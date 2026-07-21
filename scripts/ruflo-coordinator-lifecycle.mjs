// ARCHBP-014 — Ruflo swarm coordinator lifecycle adapter.
// RED STUB: contract surface only; every clause unimplemented so the
// coordination gate fails closed before the real state machine lands.

export function authorizeDispatch() {
  throw new Error("ARCHBP-014 not implemented: authorizeDispatch");
}

export function retryPolicy() {
  throw new Error("ARCHBP-014 not implemented: retryPolicy");
}

export function budgetCheck() {
  throw new Error("ARCHBP-014 not implemented: budgetCheck");
}

export class RufloCoordinator {
  constructor() {
    throw new Error("ARCHBP-014 not implemented: RufloCoordinator");
  }
}

if (import.meta.main) {
  console.error("ARCHBP-014 coordinator proof not implemented");
  process.exit(1);
}
