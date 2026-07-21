// ARCHBP-015 — RuVector MinCut dynamic swarm isolation.
// RED STUB: contract surface only; unimplemented so the isolation gate fails
// closed before the real MinCut adapter lands.

export const MINCUT_ALGORITHM = "unimplemented";
export const COMPLEXITY_CLASS = "unimplemented";

export function classifyCut() {
  throw new Error("ARCHBP-015 not implemented: classifyCut");
}

export function boundedIsolation() {
  throw new Error("ARCHBP-015 not implemented: boundedIsolation");
}

export class MinCutSwarmIsolation {
  static async create() {
    throw new Error("ARCHBP-015 not implemented: MinCutSwarmIsolation.create");
  }
}

if (import.meta.main) {
  console.error("ARCHBP-015 mincut isolation proof not implemented");
  process.exit(1);
}
