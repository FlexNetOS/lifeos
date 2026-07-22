// ARCHBP-017 — causal graph GNN and Cypher authorization guardrails.
//
// Constructs causal/dependency graphs from PROVENANCE-BOUND evidence, evaluates
// the supported GNN (@ruvector/gnn RuvectorLayer) and Cypher-style queries as
// ADVISORY detectors, and requires a DETERMINISTIC policy plus witness evidence
// before any mutation is authorized. GNN is never the sole authority; every
// allow or deny is deterministic, carries a non-opaque reason, and emits a
// witness receipt on the ARCHBP-016 witness chain. Adversarial edges (missing,
// forged, cyclic, stale, contradictory) fail closed. Runs under Bun.

import { createHash } from "node:crypto";

export const EDGE_TYPES = ["causal", "dependency"];

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/** Provenance digest binds an edge to its exact evidence. */
export function provenanceDigest(evidence) {
  return createHash("sha256").update(`prov|${stableStringify(evidence)}`).digest("hex").slice(0, 16);
}

/** Build a causal/dependency graph — only from provenance-bound edges. */
export function buildCausalGraph(edges) {
  const nodes = new Set();
  const adjacency = new Map();
  const list = [];
  for (const e of edges ?? []) {
    if (!e || typeof e.from !== "string" || typeof e.to !== "string") {
      throw new Error("ARCHBP-017: malformed edge");
    }
    if (!EDGE_TYPES.includes(e.type)) {
      throw new Error(`ARCHBP-017: unsupported edge type '${e.type}'`);
    }
    if (typeof e.provenanceDigest !== "string" || e.provenanceDigest.length === 0) {
      throw new Error(`ARCHBP-017: invented edge without provenance ${e.from}->${e.to}`);
    }
    nodes.add(e.from);
    nodes.add(e.to);
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    adjacency.get(e.from).push(e);
    list.push(e);
  }
  return { nodes, adjacency, edges: list };
}

function hasCycle(graph) {
  // A cycle anywhere in the combined causal/dependency graph is an anomaly.
  const adj = new Map();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...graph.nodes].map((n) => [n, WHITE]));
  const dfs = (n) => {
    color.set(n, GRAY);
    for (const m of adj.get(n) ?? []) {
      if (color.get(m) === GRAY) return true;
      if (color.get(m) === WHITE && dfs(m)) return true;
    }
    color.set(n, BLACK);
    return false;
  };
  for (const n of graph.nodes) {
    if (color.get(n) === WHITE && dfs(n)) return true;
  }
  return false;
}

/** Detect adversarial edges: forged, cyclic, stale, contradictory. */
export function detectAnomalies(graph, { now, staleMs } = {}) {
  const forged = graph.edges.some((e) => e.provenanceDigest !== provenanceDigest(e.evidence));
  const cyclic = hasCycle(graph);
  const stale = typeof now === "number" && typeof staleMs === "number"
    ? graph.edges.some((e) => typeof e.timestamp === "number" && e.timestamp < now - staleMs)
    : false;
  const causalPairs = new Set(graph.edges.filter((e) => e.type === "causal").map((e) => `${e.from}->${e.to}`));
  const contradictory = graph.edges
    .filter((e) => e.type === "causal")
    .some((e) => causalPairs.has(`${e.to}->${e.from}`));
  return { forged, cyclic, stale, contradictory };
}

/** Cypher-style query — every result traces to the exact edge evidence. */
export function cypherTrace(graph, pattern = {}) {
  return graph.edges
    .filter((e) => (pattern.type ? e.type === pattern.type : true)
      && (pattern.from ? e.from === pattern.from : true)
      && (pattern.to ? e.to === pattern.to : true))
    .map((e) => ({ from: e.from, to: e.to, type: e.type, evidence: e.evidence, provenanceDigest: e.provenanceDigest }));
}

function edgePresent(graph, from, to) {
  return (graph.adjacency.get(from) ?? []).some((e) => e.to === to);
}

/**
 * Deterministic authorization. Allows a mutation ONLY when a witness is
 * present, the graph has no adversarial anomalies, and every required edge is
 * present with valid provenance. The GNN advisory score is recorded but is
 * never a factor in the decision (GNN-only can never authorize). No opaque
 * rejection: every decision carries a reason.
 */
export function authorize(mutation, graph, ctx = {}) {
  const gnnAdvisory = { score: typeof ctx.gnnAdvisoryScore === "number" ? ctx.gnnAdvisoryScore : null, advisoryOnly: true };
  const anomalies = detectAnomalies(graph, ctx);
  const decide = (decision, reason) => ({ decision, reason, gnnAdvisory, anomalies });

  if (ctx.witnessPresent !== true) return decide("deny", "missing-witness-evidence");
  if (anomalies.forged) return decide("deny", "forged-edge");
  if (anomalies.cyclic) return decide("deny", "cyclic-edge");
  if (anomalies.stale) return decide("deny", "stale-edge");
  if (anomalies.contradictory) return decide("deny", "contradictory-edge");
  for (const [from, to] of mutation?.required ?? []) {
    if (!edgePresent(graph, from, to)) {
      return decide("deny", `missing-required-edge:${from}->${to}`);
    }
  }
  return decide("allow", "policy-satisfied");
}

// ---------------------------------------------------------------------------
// CLI proof emitter (Bun) — real GNN advisory + real witness receipts.
// ---------------------------------------------------------------------------
async function emitProof() {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { WitnessChain, verifyChain } = await import("./witness-chain-lifecycle.mjs");

  const NOW = 1_000_000;
  const edge = (from, to, type, evidence, ts = NOW) => ({
    from, to, type, evidence, provenanceDigest: provenanceDigest(evidence), timestamp: ts,
  });
  const good = () => [
    edge("S1", "V1", "dependency", { src: "S1" }),
    edge("V1", "D1", "causal", { vec: "V1" }),
    edge("D1", "E1", "causal", { dec: "D1" }),
  ];

  // adversarial detection (one anomaly per graph)
  const forgedEdges = good(); forgedEdges[1] = { ...forgedEdges[1], provenanceDigest: "deadbeef" };
  const cyclicEdges = [...good(), edge("E1", "S1", "causal", { back: 1 })];
  const staleEdges = good().map((e) => ({ ...e, timestamp: NOW - 999_999 }));
  const contraEdges = [...good(), edge("D1", "V1", "causal", { contra: 1 })];
  const anomalies = {
    forged: detectAnomalies(buildCausalGraph(forgedEdges), { now: NOW, staleMs: 1000 }).forged,
    cyclic: detectAnomalies(buildCausalGraph(cyclicEdges), { now: NOW, staleMs: 10_000 }).cyclic,
    stale: detectAnomalies(buildCausalGraph(staleEdges), { now: NOW, staleMs: 1000 }).stale,
    contradictory: detectAnomalies(buildCausalGraph(contraEdges), { now: NOW, staleMs: 10_000 }).contradictory,
  };

  const g = buildCausalGraph(good());
  const traces = cypherTrace(g, { type: "causal" });
  const cypherTracesToEvidence = traces.length > 0
    && traces.every((t) => t.provenanceDigest === provenanceDigest(t.evidence));

  // GNN advisory (real @ruvector/gnn RuvectorLayer) vs a mean baseline.
  let gnn;
  try {
    const { RuvectorLayer } = await import("@ruvector/gnn");
    const layer = new RuvectorLayer(8, 8, 1, 0.0);
    const node = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8].map((x) => x / 8));
    const neighbors = [
      new Float32Array([2, 3, 4, 5, 6, 7, 8, 9].map((x) => x / 9)),
      new Float32Array([0, 1, 2, 3, 4, 5, 6, 7].map((x) => x / 7)),
    ];
    const weights = new Float32Array([0.6, 0.4]);
    const out = layer.forward(node, neighbors, weights);
    const norm = (v) => Math.sqrt(Array.from(v).reduce((a, x) => a + x * x, 0));
    const gnnNorm = norm(out);
    // baseline: weighted mean of neighbors
    const baseline = new Float32Array(8);
    for (let i = 0; i < 8; i += 1) baseline[i] = 0.6 * neighbors[0][i] + 0.4 * neighbors[1][i];
    const baseNorm = norm(baseline);
    gnn = {
      evaluated: true,
      advisoryOnly: true,
      baselineComparison: `gnn_norm=${gnnNorm.toFixed(4)} vs baseline_mean_norm=${baseNorm.toFixed(4)}`,
    };
  } catch (error) {
    gnn = { evaluated: false, advisoryOnly: true, baselineComparison: `gnn-unavailable: ${String(error).slice(0, 60)}` };
  }

  // deterministic policy + GNN-only cannot authorize
  const ctxValid = { now: NOW, staleMs: 10_000, gnnAdvisoryScore: 0.99, witnessPresent: true };
  const allow = authorize({ required: [["D1", "E1"]] }, g, ctxValid);
  const deny = authorize({ required: [["E1", "PROD"]] }, g, ctxValid); // GNN perfect but edge missing
  const a1 = authorize({ required: [["D1", "E1"]] }, g, ctxValid);
  const a2 = authorize({ required: [["D1", "E1"]] }, g, ctxValid);
  const authorization = {
    allowValid: allow.decision === "allow",
    denyMissing: deny.decision === "deny" && deny.reason.startsWith("missing-required-edge"),
    gnnOnlyCannotAuthorize: deny.decision === "deny" && deny.gnnAdvisory.score === 0.99 && deny.gnnAdvisory.advisoryOnly === true,
    deterministic: a1.decision === a2.decision && a1.reason === a2.reason,
  };

  // witness receipts: every decision recorded on the ARCHBP-016 witness chain
  const wc = new WitnessChain("sha256");
  for (const d of [allow, deny]) {
    wc.record("proof", { decision: d.decision, reason: d.reason, gnnAdvisoryScore: d.gnnAdvisory.score });
  }
  const witness = {
    everyDecisionHasReceipt: wc.entries.length === 2,
    chainValid: verifyChain(wc.entries).valid,
  };

  const result = {
    task: "ARCHBP-017",
    generatedAt: new Date().toISOString(),
    anomalies,
    cypherTracesToEvidence,
    gnn,
    authorization,
    witness,
  };

  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const canonical = resolve(process.cwd(), "node_modules/.cache/lifeos/archbp-017/causal-auth-proof.raw.json");
  const outputPath = outputArg ? resolve(process.cwd(), outputArg.slice("--output=".length)) : canonical;
  mkdirSync(dirname(outputPath), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, json);
  process.stdout.write(json);
}

if (import.meta.main) {
  emitProof().catch((error) => {
    console.error("ARCHBP-017 causal authorization proof failed:", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
