// ARCHBP-009 — MicroLoRA / SONA / FastGRNN learning-boundary lifecycle adapter.
// RED STUB: contract surface only; every clause unimplemented so the gate
// fails closed before the real adapter lands.

export const SUPPORTED_LEARNING_COMPONENTS = [];

export function assertSupportedComponent() {
  throw new Error("ARCHBP-009 not implemented: assertSupportedComponent");
}

export function buildProvenance() {
  throw new Error("ARCHBP-009 not implemented: buildProvenance");
}

export function evaluatePromotion() {
  throw new Error("ARCHBP-009 not implemented: evaluatePromotion");
}

export function assertResourceBudget() {
  throw new Error("ARCHBP-009 not implemented: assertResourceBudget");
}

export class LearningBoundaryCell {
  static forAgent() {
    throw new Error("ARCHBP-009 not implemented: LearningBoundaryCell.forAgent");
  }
}

if (import.meta.main) {
  console.error("ARCHBP-009 learning-boundary proof not implemented");
  process.exit(1);
}
