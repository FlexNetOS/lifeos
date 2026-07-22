// ARCHBP-046 — RED STUB. Contract surface only; the database coordinator is
// unimplemented so the governance gate fails closed before the real engine
// lands.

export const DURABLE_AUTHORITY = "unimplemented";

export function hasDbGitExecution() {
  return true;
}
export function governMerge() {
  throw new Error("ARCHBP-046 not implemented: governMerge");
}
export function buildReceipt() {
  throw new Error("ARCHBP-046 not implemented: buildReceipt");
}
export class DatabaseCoordinator {
  issueJobSpec() {
    throw new Error("ARCHBP-046 not implemented: issueJobSpec");
  }
  acquireLease() {
    throw new Error("ARCHBP-046 not implemented: acquireLease");
  }
}

if (import.meta.main) {
  console.error("ARCHBP-046 db coordinator proof not implemented");
  process.exit(1);
}
