// ARCHBP-015 — RuVector MinCut dynamic swarm isolation.
//
// Detects and isolates harmful or inconsistent swarm edges using the exact
// supported MinCut implementation (agentdb MincutService, Stoer-Wagner — the
// deterministic global-min-cut algorithm). Every isolation carries reproducible
// cut evidence (the exact cut edges + partitions + cut size), a bounded blast
// radius (only the smaller partition is isolated), a measured false-positive
// rate on healthy/noisy swarms, and a recovery check. Complexity is reported
// honestly as POLYNOMIAL (Stoer-Wagner is O(V·E + V^2 log V)); no subpolynomial
// behavior is claimed. Runs under Bun.

export const MINCUT_ALGORITHM = "stoer-wagner";
export const COMPLEXITY_CLASS = "polynomial";

/** A cut strictly below the isolation threshold marks a harmful/weak boundary. */
export function classifyCut(cutSize, threshold) {
  return { harmful: cutSize < threshold, cutSize, threshold };
}

/** Isolate only the smaller partition — a bounded blast radius, never the whole swarm. */
export function boundedIsolation(partitions) {
  const sorted = [...partitions].sort((a, b) => a.length - b.length);
  const isolated = sorted[0] ?? [];
  return { isolated, blastRadius: isolated.length };
}

export class MinCutSwarmIsolation {
  constructor(service, threshold) {
    this.service = service;
    this.threshold = threshold;
  }

  static async create(threshold = 2) {
    const { MincutService } = await import("agentdb/controllers/MincutService");
    const service = new MincutService({ algorithm: "stoer-wagner", minCutThreshold: threshold });
    await service.initialize();
    return new MinCutSwarmIsolation(service, threshold);
  }

  async analyze(edges) {
    const result = await this.service.stoerWagnerMincut(edges);
    const { harmful } = classifyCut(result.cutSize, this.threshold);
    const iso = boundedIsolation(result.partitions);
    return {
      cutSize: result.cutSize,
      cutEdges: result.cutEdges,
      partitions: result.partitions,
      implementation: result.algorithm,
      harmful,
      isolatedPartition: iso.isolated,
      blastRadius: iso.blastRadius,
      evidence: { cutSize: result.cutSize, cutEdges: result.cutEdges, algorithm: MINCUT_ALGORITHM },
    };
  }

  /** Build the swarm remainder after removing the isolated partition (for recovery). */
  static recover(edges, isolatedNodes) {
    const removed = new Set(isolatedNodes);
    const kept = [];
    for (let node = 0; node < edges.length; node += 1) {
      if (!removed.has(node)) kept.push(node);
    }
    const remap = new Map(kept.map((old, index) => [old, index]));
    return kept.map((old) =>
      (edges[old] ?? [])
        .filter((neighbor) => remap.has(neighbor))
        .map((neighbor) => remap.get(neighbor)),
    );
  }

  async falsePositiveRate(healthyGraphs) {
    let flagged = 0;
    for (const g of healthyGraphs) {
      const a = await this.analyze(g);
      if (a.harmful) flagged += 1;
    }
    return healthyGraphs.length ? flagged / healthyGraphs.length : 0;
  }
}

// ---------------------------------------------------------------------------
// CLI proof emitter (Bun) — real agentdb MincutService.
// ---------------------------------------------------------------------------
async function emitProof() {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");

  const threshold = 2;
  const iso = await MinCutSwarmIsolation.create(threshold);

  // Compromised: two clusters {0,1,2} and {3,4,5} joined by ONE weak edge 2-3.
  const compromised = [[1, 2], [0, 2], [0, 1, 3], [2, 4, 5], [3, 5], [3, 4]];
  // Healthy: dense mesh (well-connected, high min cut).
  const healthy = [
    [1, 2, 3, 4, 5], [0, 2, 3, 4, 5], [0, 1, 3, 4, 5],
    [0, 1, 2, 4, 5], [0, 1, 2, 3, 5], [0, 1, 2, 3, 4],
  ];
  // Noisy: a 6-node ring (min cut 2, not below threshold — not harmful).
  const noisy = [[1, 5], [0, 2], [1, 3], [2, 4], [3, 5], [4, 0]];
  // Partitioned: two groups {0,1} and {2,3,4} joined by a single bridge 1-2
  // (a network-partition point) — the min cut identifies the bridge and the two
  // partitions.
  const partitioned = [[1], [0, 2], [1, 3, 4], [2, 4], [2, 3]];

  const cA = await iso.analyze(compromised);
  const hA = await iso.analyze(healthy);
  const nA = await iso.analyze(noisy);
  const pA = await iso.analyze(partitioned);

  const falsePositiveRate = await iso.falsePositiveRate([healthy, noisy]);

  // Recovery: remove the isolated compromised partition; the remainder is healthy.
  const remainder = MinCutSwarmIsolation.recover(compromised, cA.isolatedPartition);
  const rA = await iso.analyze(remainder);

  // Reproducible evidence: deterministic across two runs.
  const cA2 = await iso.analyze(compromised);
  const reproducible =
    cA.cutSize === cA2.cutSize && JSON.stringify(cA.cutEdges) === JSON.stringify(cA2.cutEdges);

  const result = {
    task: "ARCHBP-015",
    generatedAt: new Date().toISOString(),
    algorithm: MINCUT_ALGORITHM,
    implementation: cA.implementation,
    complexityClass: COMPLEXITY_CLASS,
    subpolynomialClaimed: false,
    compromised: {
      harmful: cA.harmful,
      cutSize: cA.cutSize,
      cutEdges: cA.cutEdges,
      isolatedPartition: cA.isolatedPartition,
      blastRadius: cA.blastRadius,
    },
    healthy: { harmful: hA.harmful, cutSize: hA.cutSize },
    noisy: { harmful: nA.harmful, cutSize: nA.cutSize },
    partitioned: { cutSize: pA.cutSize, partitions: pA.partitions.length },
    falsePositiveRate,
    recovery: { remainderHarmful: rA.harmful, remainderCutSize: rA.cutSize },
    reproducible,
  };

  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const canonical = resolve(process.cwd(), "node_modules/.cache/lifeos/archbp-015/mincut-proof.raw.json");
  const outputPath = outputArg ? resolve(process.cwd(), outputArg.slice("--output=".length)) : canonical;
  mkdirSync(dirname(outputPath), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, json);
  process.stdout.write(json);
}

if (import.meta.main) {
  emitProof().catch((error) => {
    console.error("ARCHBP-015 mincut isolation proof failed:", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
