// ARCHBP-008 — ruvllm shared-model edge inference lifecycle adapter.
// RED STUB: contract surface only; every clause unimplemented so the gate
// fails closed before the real adapter lands.

export const FROZEN_MODEL_CONTRACT = { download: "unimplemented" };

export function assertBoundedStats() {
  throw new Error("ARCHBP-008 not implemented: assertBoundedStats");
}

export function summarizeLatency() {
  throw new Error("ARCHBP-008 not implemented: summarizeLatency");
}

export function classifyLocalFailure() {
  throw new Error("ARCHBP-008 not implemented: classifyLocalFailure");
}

export class RuvllmInferenceCell {
  static async start() {
    throw new Error("ARCHBP-008 not implemented: RuvllmInferenceCell.start");
  }
}

if (import.meta.main) {
  console.error("ARCHBP-008 inference proof not implemented");
  process.exit(1);
}
