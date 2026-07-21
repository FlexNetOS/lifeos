// ARCHBP-016 — witness-chain anti-bluffing receipts.
// RED STUB: contract surface only; unimplemented so the witness gate fails
// closed before the real tamper-evident chain lands.

export const WITNESS_ALGORITHM = "unimplemented";
export const WITNESS_SCHEMA_VERSION = "unimplemented";
export const DOMAIN_TAGS = {};
export const ALGORITHM_DECISION = { chosen: "unimplemented" };

export function verifyChain() {
  throw new Error("ARCHBP-016 not implemented: verifyChain");
}

export class WitnessChain {
  constructor() {
    throw new Error("ARCHBP-016 not implemented: WitnessChain");
  }
}

if (import.meta.main) {
  console.error("ARCHBP-016 witness-chain proof not implemented");
  process.exit(1);
}
