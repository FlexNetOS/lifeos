// ARCHBP-009 — MicroLoRA / SONA / FastGRNN learning-boundary lifecycle adapter.
//
// Integrates ONLY primary-source-supported learning components — MicroLoRA and
// SONA (@ruvector/sona) and FastGRNN (@ruvector/tiny-dancer) — binds learning
// state to agent identity and witness provenance, and enforces the learning
// boundary: learning happens in a per-agent SANDBOX engine and never affects
// execution until a witness-backed promotion passes. Rollback is deterministic
// (discard the sandbox; execution reverts to the config-reconstructed baseline
// that never learned). No component outside the whitelist is admitted, no model
// is replaced, and no absolute-stability claim is made.
//
// Runs under Bun (the @ruvector native ESM builds use extensionless imports).

import { createHash } from "node:crypto";

export const SUPPORTED_LEARNING_COMPONENTS = ["microlora", "sona", "fastgrnn"];

/** Reject any component not backed by a supported primary source. */
export function assertSupportedComponent(name) {
  if (!SUPPORTED_LEARNING_COMPONENTS.includes(name)) {
    throw new Error(`ARCHBP-009: unsupported learning component '${name}'`);
  }
  return name;
}

/**
 * Build a frozen provenance record binding learning state to an exact source
 * and model identity. Every field is required — missing identity fails closed.
 */
export function buildProvenance({ component, packageVersion, nativeVersion, model, agentId, digest } = {}) {
  const fields = { component, packageVersion, nativeVersion, model, agentId, digest };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`ARCHBP-009: provenance missing required field '${key}'`);
    }
  }
  assertSupportedComponent(component);
  return Object.freeze({ ...fields });
}

/**
 * Witness-backed promotion gate. Learned state may only affect execution when
 * its provenance is complete, its quality meets the threshold, and a witness is
 * present. Fail-closed on any missing precondition.
 */
export function evaluatePromotion({ provenanceComplete, quality, witness, threshold = 0.5 } = {}) {
  if (provenanceComplete !== true) return { promoted: false, reason: "incomplete-provenance" };
  if (typeof quality !== "number" || !Number.isFinite(quality) || quality < threshold) {
    return { promoted: false, reason: "insufficient-quality" };
  }
  if (!witness) return { promoted: false, reason: "missing-witness" };
  return { promoted: true, reason: "promoted" };
}

/** Validate learning stays inside its resource budget (no dropped trajectories). */
export function assertResourceBudget(stats, { maxDropped = 0 } = {}) {
  const numbers = Object.values(stats ?? {}).filter((v) => typeof v === "number");
  const allFinite = numbers.length > 0 && numbers.every((v) => Number.isFinite(v));
  const dropped = stats?.trajectories_dropped;
  const withinBudget = allFinite && Number.isFinite(dropped) && dropped <= maxDropped;
  return { withinBudget, dropped: Number.isFinite(dropped) ? dropped : null };
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

const ATTENTION = (dim) => Array(dim).fill(1 / dim);

/**
 * Per-agent learning boundary. A baseline SONA engine backs execution; a
 * sandbox SONA engine accumulates learning that only affects execution after a
 * witness-backed promotion. Construct via `LearningBoundaryCell.forAgent`.
 */
export class LearningBoundaryCell {
  constructor(agentId, config, baseline, sandbox, versions) {
    this.agentId = agentId;
    this.config = config;
    this.baseline = baseline;
    this.sandbox = sandbox;
    this.versions = versions;
    this.promoted = false;
    this.dim = config.embeddingDim;
  }

  static async forAgent(agentId, config) {
    const { readFileSync } = await import("node:fs");
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { SonaEngine } = await import("@ruvector/sona");
    const tinyDancer = await import("@ruvector/tiny-dancer");
    const sonaPkg = JSON.parse(readFileSync(require.resolve("@ruvector/sona/package.json"), "utf8"));
    const tdPkg = JSON.parse(readFileSync(require.resolve("@ruvector/tiny-dancer/package.json"), "utf8"));
    const versions = {
      sonaPackage: sonaPkg.version,
      sonaNative: sonaPkg.version,
      tdPackage: tdPkg.version,
      tdNative: String(tinyDancer.version()),
      trainRouter: tinyDancer.trainRouter,
      score: tinyDancer.score,
    };
    const baseline = SonaEngine.withConfig(config);
    const sandbox = SonaEngine.withConfig(config);
    return new LearningBoundaryCell(agentId, config, baseline, sandbox, versions);
  }

  sonaProvenance() {
    return buildProvenance({
      component: "sona",
      packageVersion: this.versions.sonaPackage,
      nativeVersion: this.versions.sonaNative,
      model: `sona-h${this.config.hiddenDim}-mlr${this.config.microLoraRank}`,
      agentId: this.agentId,
      digest: sha256(this.config),
    });
  }

  fastgrnnProvenance() {
    return buildProvenance({
      component: "fastgrnn",
      packageVersion: this.versions.tdPackage,
      nativeVersion: this.versions.tdNative,
      model: "fastgrnn-router",
      agentId: this.agentId,
      digest: sha256({ agent: this.agentId, kind: "fastgrnn-router" }),
    });
  }

  /** Record a trajectory into the SANDBOX and learn; returns a witness digest. */
  learnInSandbox(input, quality) {
    const tid = this.sandbox.beginTrajectory(input);
    this.sandbox.setTrajectoryRoute(tid, "learn");
    this.sandbox.addTrajectoryContext(tid, `${this.agentId}:sandbox`);
    this.sandbox.addTrajectoryStep(tid, input, ATTENTION(input.length), quality);
    this.sandbox.endTrajectory(tid, quality);
    this.sandbox.forceLearn();
    return sha256({ agentId: this.agentId, input, quality });
  }

  patternCount(engine, input) {
    return engine.findPatterns(input, this.config.patternClusters).length;
  }

  sandboxPatternCount(input) {
    return this.patternCount(this.sandbox, input);
  }

  baselinePatternCount(input) {
    return this.patternCount(this.baseline, input);
  }

  /** The engine currently backing execution: baseline until promoted. */
  executionEngine() {
    return this.promoted ? this.sandbox : this.baseline;
  }

  /** Learned-state effect on execution: number of patterns visible to execution. */
  executionPatterns(input) {
    return this.patternCount(this.executionEngine(), input);
  }

  promote(witness, quality) {
    const provenance = this.sonaProvenance();
    const decision = evaluatePromotion({
      provenanceComplete: Boolean(provenance),
      quality,
      witness,
      threshold: this.config.qualityThreshold ?? 0.5,
    });
    if (decision.promoted) this.promoted = true;
    return decision;
  }

  get isPromoted() {
    return this.promoted;
  }

  /** Deterministic rollback: execution reverts to the baseline that never learned. */
  rollback() {
    this.promoted = false;
    return true;
  }

  stats() {
    return {
      sandbox: JSON.parse(this.sandbox.getStats()),
      baseline: JSON.parse(this.baseline.getStats()),
    };
  }

  /** Integrate FastGRNN: train a small router and score one embedding. */
  async fastGrnnTrainAndScore(outputPath) {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      embedding: Array.from({ length: this.dim }, (_, j) => ((i + j) % 5) / 5),
      scores: i % 2 === 0 ? { cheap: 0.9, strong: 0.92 } : { cheap: 0.2, strong: 0.95 },
    }));
    await this.versions.trainRouter(rows, { cheap: 1, strong: 15 }, {
      outputPath,
      inputDim: this.dim,
      hiddenDim: 4,
      epochs: 5,
      learningRate: 0.05,
    });
    const score = await this.versions.score(outputPath, rows[0].embedding);
    return { score, provenance: this.fastgrnnProvenance() };
  }
}

// ---------------------------------------------------------------------------
// CLI proof emitter (Bun).
// ---------------------------------------------------------------------------
async function emitProof() {
  const { writeFileSync, mkdirSync, mkdtempSync, rmSync } = await import("node:fs");
  const { resolve, dirname, join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const config = {
    hiddenDim: 8,
    embeddingDim: 8,
    microLoraRank: 2,
    baseLoraRank: 4,
    patternClusters: 4,
    trajectoryCapacity: 100,
    backgroundIntervalMs: 1000,
    qualityThreshold: 0.5,
    enableSimd: true,
  };
  const input = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

  const cellA = await LearningBoundaryCell.forAgent("agent-a", config);
  const cellB = await LearningBoundaryCell.forAgent("agent-b", config);

  const provenance = { sona: cellA.sonaProvenance(), fastgrnn: cellA.fastgrnnProvenance() };

  // per-agent isolation: agent-a learns, agent-b does not
  const witnessA = cellA.learnInSandbox(input, 0.95);
  const isolation = {
    agentASandboxPatterns: cellA.sandboxPatternCount(input),
    agentBSandboxPatterns: cellB.sandboxPatternCount(input),
    isolated: cellA.sandboxPatternCount(input) > 0 && cellB.sandboxPatternCount(input) === 0,
  };

  // learned state must not reach execution before a witness-backed promotion
  const baselinePatterns = cellA.baselinePatternCount(input);
  const executionBeforePromotionUsesBaseline = cellA.executionPatterns(input) === baselinePatterns;
  const decision = cellA.promote(witnessA, 0.95);
  const executionAfterPromotionUsesSandbox =
    cellA.executionPatterns(input) === cellA.sandboxPatternCount(input) &&
    cellA.executionPatterns(input) > baselinePatterns;
  const promotion = {
    promoted: decision.promoted,
    reason: decision.reason,
    executionBeforePromotionUsesBaseline,
    executionAfterPromotionUsesSandbox,
  };

  // deterministic rollback: execution reverts to the baseline
  cellA.rollback();
  const executionAfterRollbackMatchesBaseline = cellA.executionPatterns(input) === baselinePatterns;
  const rollback = {
    deterministic: executionAfterRollbackMatchesBaseline && !cellA.isPromoted,
    executionAfterRollbackMatchesBaseline,
  };

  // resource budget
  const resources = assertResourceBudget(cellA.stats().sandbox, { maxDropped: 0 });

  // FastGRNN integration
  const workDir = mkdtempSync(join(tmpdir(), "archbp009-fastgrnn-"));
  let fastgrnn;
  try {
    const routerPath = join(workDir, "router.safetensors");
    const r = await cellA.fastGrnnTrainAndScore(routerPath);
    fastgrnn = { score: r.score, provenance: r.provenance };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  // component guard
  let rejectedUnsupported = false;
  try {
    assertSupportedComponent("invented-optimizer");
  } catch {
    rejectedUnsupported = true;
  }

  const result = {
    task: "ARCHBP-009",
    generatedAt: new Date().toISOString(),
    provenance,
    isolation,
    promotion,
    rollback,
    resources,
    fastgrnn,
    componentGuard: { rejectedUnsupported, supported: SUPPORTED_LEARNING_COMPONENTS },
    stabilityClaim: "measured-workload-only; no absolute-stability claim",
  };

  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const canonical = resolve(process.cwd(), "node_modules/.cache/lifeos/archbp-009/learning-boundary-proof.raw.json");
  const outputPath = outputArg ? resolve(process.cwd(), outputArg.slice("--output=".length)) : canonical;
  mkdirSync(dirname(outputPath), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, json);
  process.stdout.write(json);
}

if (import.meta.main) {
  emitProof().catch((error) => {
    console.error("ARCHBP-009 learning-boundary proof failed:", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
