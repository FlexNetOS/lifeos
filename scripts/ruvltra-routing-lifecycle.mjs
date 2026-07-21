// ARCHBP-013 — RuvLTRA proportional local-cloud routing lifecycle adapter.
// RED STUB: contract surface only; every clause unimplemented so the routing
// gate fails closed before the real policy engine lands.

export const DEFAULT_ROUTE = "unimplemented";

export function defaultPolicy() {
  throw new Error("ARCHBP-013 not implemented: defaultPolicy");
}

export function decideRoute() {
  throw new Error("ARCHBP-013 not implemented: decideRoute");
}

export function replay() {
  throw new Error("ARCHBP-013 not implemented: replay");
}

export class RuvltraRouter {
  static async train() {
    throw new Error("ARCHBP-013 not implemented: RuvltraRouter.train");
  }
}

if (import.meta.main) {
  console.error("ARCHBP-013 routing proof not implemented");
  process.exit(1);
}
