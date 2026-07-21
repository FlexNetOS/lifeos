// ARCHBP-017 — causal graph GNN and Cypher authorization guardrails.
// RED STUB: contract surface only; unimplemented so the authorization gate
// fails closed before the real deterministic authorizer lands.

export function provenanceDigest() {
  throw new Error("ARCHBP-017 not implemented: provenanceDigest");
}
export function buildCausalGraph() {
  throw new Error("ARCHBP-017 not implemented: buildCausalGraph");
}
export function detectAnomalies() {
  throw new Error("ARCHBP-017 not implemented: detectAnomalies");
}
export function cypherTrace() {
  throw new Error("ARCHBP-017 not implemented: cypherTrace");
}
export function authorize() {
  throw new Error("ARCHBP-017 not implemented: authorize");
}

if (import.meta.main) {
  console.error("ARCHBP-017 causal authorization proof not implemented");
  process.exit(1);
}
