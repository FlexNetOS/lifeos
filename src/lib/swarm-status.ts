export type SwarmStatus = {
  state: "ready" | "stale" | "degraded" | "unavailable" | "unknown";
  identity: string | null;
  localSeq: number;
  ageMs: number | null;
  freshness: "fresh" | "stale" | "unknown";
};

const STALE_AFTER_MS = 10_000;

export function deriveSwarmStatus(
  projection: { localSeq?: number; degraded?: boolean; entries?: Record<string, unknown> } | null,
  now = Date.now(),
): SwarmStatus {
  if (!projection) {
    return { state: "unavailable", identity: null, localSeq: 0, ageMs: null, freshness: "unknown" };
  }
  const entries = projection.entries ?? {};
  const rawUpdatedAt = entries["swarm.updatedAt"];
  const updatedAt = typeof rawUpdatedAt === "number" ? rawUpdatedAt : typeof rawUpdatedAt === "string" ? Number(rawUpdatedAt) : null;
  const validUpdatedAt = updatedAt !== null && Number.isFinite(updatedAt) ? updatedAt : null;
  const ageMs = validUpdatedAt === null ? null : Math.max(0, now - validUpdatedAt);
  const stale = ageMs === null || ageMs > STALE_AFTER_MS;
  const state = projection.degraded ? "degraded" : stale ? "stale" : (entries["swarm.status"] as SwarmStatus["state"] ?? "unknown");
  return {
    state,
    identity: typeof entries["swarm.identity"] === "string" ? entries["swarm.identity"] : null,
    localSeq: projection.localSeq ?? 0,
    ageMs,
    freshness: stale ? "stale" : "fresh",
  };
}
