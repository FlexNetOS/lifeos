// ARCHBP-010 — swarm scale and hardware acceptance harness.
// RED STUB: contract surface only; unimplemented so the scale gate fails closed
// before the real measurement harness lands.

export const SCALE_STEPS = [];

export function scaleSchedule() {
  throw new Error("ARCHBP-010 not implemented: scaleSchedule");
}
export function percentile() {
  throw new Error("ARCHBP-010 not implemented: percentile");
}
export function confidenceInterval95() {
  throw new Error("ARCHBP-010 not implemented: confidenceInterval95");
}
export function declaredCells() {
  throw new Error("ARCHBP-010 not implemented: declaredCells");
}

if (import.meta.main) {
  console.error("ARCHBP-010 swarm scale proof not implemented");
  process.exit(1);
}
