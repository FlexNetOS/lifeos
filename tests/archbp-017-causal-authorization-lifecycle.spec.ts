import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import {
  provenanceDigest,
  buildCausalGraph,
  detectAnomalies,
  cypherTrace,
  authorize,
} from "../scripts/causal-authorization-lifecycle.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/causal-authorization-lifecycle.mjs");

const NOW = 1_000_000;
function edge(from, to, type, evidence, ts = NOW) {
  return { from, to, type, evidence, provenanceDigest: provenanceDigest(evidence), timestamp: ts };
}
const goodEdges = () => [
  edge("S1", "V1", "dependency", { src: "S1" }),
  edge("V1", "D1", "causal", { vec: "V1" }),
  edge("D1", "E1", "causal", { dec: "D1" }),
];

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process).
// ---------------------------------------------------------------------------
describe("ARCHBP-017 provenance-bound causal graph", () => {
  test("builds a graph only from provenance-bound edges and rejects invented ones", () => {
    const g = buildCausalGraph(goodEdges());
    expect(g.nodes.size).toBeGreaterThan(0);
    // invented edge (no provenance) is rejected
    expect(() => buildCausalGraph([{ from: "X", to: "Y", type: "causal" }])).toThrow();
  });
});

describe("ARCHBP-017 adversarial edge detection", () => {
  test("detects forged, cyclic, stale, and contradictory edges", () => {
    const forged = goodEdges();
    forged[1] = { ...forged[1], provenanceDigest: "deadbeef" }; // provenance does not match evidence
    expect(detectAnomalies(buildCausalGraph(forged), { now: NOW, staleMs: 1000 }).forged).toBe(true);

    const cyclic = [...goodEdges(), edge("E1", "S1", "causal", { back: 1 })];
    expect(detectAnomalies(buildCausalGraph(cyclic), { now: NOW, staleMs: 10_000 }).cyclic).toBe(true);

    const stale = goodEdges().map((e) => ({ ...e, timestamp: NOW - 999_999 }));
    expect(detectAnomalies(buildCausalGraph(stale), { now: NOW, staleMs: 1000 }).stale).toBe(true);

    const contradictory = [...goodEdges(), edge("D1", "V1", "causal", { contra: 1 })];
    expect(detectAnomalies(buildCausalGraph(contradictory), { now: NOW, staleMs: 10_000 }).contradictory).toBe(true);

    // healthy graph: no anomalies
    const clean = detectAnomalies(buildCausalGraph(goodEdges()), { now: NOW, staleMs: 10_000 });
    expect(clean.forged || clean.cyclic || clean.stale || clean.contradictory).toBe(false);
  });
});

describe("ARCHBP-017 Cypher-style results trace to exact evidence", () => {
  test("every query result carries the exact provenance evidence of its edge", () => {
    const g = buildCausalGraph(goodEdges());
    const results = cypherTrace(g, { type: "causal" });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.evidence).toBeDefined();
      expect(r.provenanceDigest).toBe(provenanceDigest(r.evidence));
    }
  });
});

describe("ARCHBP-017 deterministic policy is final; GNN is advisory only", () => {
  test("authorizes a required, provenance-valid, anomaly-free mutation and denies otherwise", () => {
    const g = buildCausalGraph(goodEdges());
    const ctx = { now: NOW, staleMs: 10_000, gnnAdvisoryScore: 0.99, witnessPresent: true };
    const allow = authorize({ required: [["D1", "E1"]] }, g, ctx);
    expect(allow.decision).toBe("allow");
    expect(allow.reason).toBeDefined(); // no opaque rejection/approval

    // GNN-only cannot authorize: a missing required edge is denied even with a
    // perfect advisory GNN score.
    const deny = authorize({ required: [["E1", "PROD"]] }, g, ctx);
    expect(deny.decision).toBe("deny");
    expect(deny.reason).toContain("missing-required-edge");
    expect(deny.gnnAdvisory.advisoryOnly).toBe(true);
  });

  test("is deterministic: identical inputs yield identical decisions", () => {
    const g = buildCausalGraph(goodEdges());
    const ctx = { now: NOW, staleMs: 10_000, gnnAdvisoryScore: 0.5, witnessPresent: true };
    const a = authorize({ required: [["D1", "E1"]] }, g, ctx);
    const b = authorize({ required: [["D1", "E1"]] }, g, ctx);
    expect(a.decision).toBe(b.decision);
    expect(a.reason).toBe(b.reason);
  });
});

// ---------------------------------------------------------------------------
// Live proof (subprocess) — real GNN advisory + real witness receipts.
// ---------------------------------------------------------------------------
describe("ARCHBP-017 causal authorization proof (real GNN + witness receipts)", () => {
  test("proves adversarial detection, advisory GNN, deterministic policy, and witness receipts", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp017-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(r.anomalies.forged).toBe(true);
      expect(r.anomalies.cyclic).toBe(true);
      expect(r.anomalies.stale).toBe(true);
      expect(r.anomalies.contradictory).toBe(true);
      expect(r.cypherTracesToEvidence).toBe(true);
      expect(r.gnn.evaluated).toBe(true);
      expect(r.gnn.advisoryOnly).toBe(true);
      expect(typeof r.gnn.baselineComparison).toBe("string");
      expect(r.authorization.allowValid).toBe(true);
      expect(r.authorization.denyMissing).toBe(true);
      expect(r.authorization.gnnOnlyCannotAuthorize).toBe(true);
      expect(r.authorization.deterministic).toBe(true);
      expect(r.witness.everyDecisionHasReceipt).toBe(true);
      expect(r.witness.chainValid).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 120000);
});
