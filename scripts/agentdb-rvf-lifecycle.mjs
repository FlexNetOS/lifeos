// ARCHBP-007 — AgentDB RVF active/passive memory lifecycle adapter.
// RED STUB: exports the contract surface only; every clause is unimplemented so
// the ARCHBP-007 gate fails closed before the real adapter lands.

export const ACTIVE_PLANE = "rvf";
export const PASSIVE_MACRO_AUTHORITY = "unimplemented";

export class AuthorityViolationError extends Error {}

export function assertNotMacroAuthority() {
  throw new Error("ARCHBP-007 not implemented: assertNotMacroAuthority");
}

export function correctStatusBytes() {
  throw new Error("ARCHBP-007 not implemented: correctStatusBytes");
}

export function evaluateWitness() {
  throw new Error("ARCHBP-007 not implemented: evaluateWitness");
}

export function classifyWitnessSegments() {
  throw new Error("ARCHBP-007 not implemented: classifyWitnessSegments");
}

export class AgentRvfMemory {
  static async open() {
    throw new Error("ARCHBP-007 not implemented: AgentRvfMemory.open");
  }
}

if (import.meta.main) {
  console.error("ARCHBP-007 lifecycle proof not implemented");
  process.exit(1);
}
