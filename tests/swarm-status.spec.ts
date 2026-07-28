import { describe, expect, test } from "vitest";

import { deriveSwarmStatus } from "@/lib/swarm-status";

describe("canonical owner-published swarm status", () => {
  test("maps a fresh ready heartbeat and identity", () => {
    expect(
      deriveSwarmStatus(
        {
          localSeq: 12,
          entries: {
            "swarm.identity": "lifeos-glass",
            "swarm.status": "ready",
            "swarm.updatedAt": "1000",
          },
        },
        2_000,
      ),
    ).toEqual({
      state: "ready",
      identity: "lifeos-glass",
      localSeq: 12,
      ageMs: 1_000,
      freshness: "fresh",
    });
  });

  test("fail-closes missing and stale heartbeats", () => {
    expect(deriveSwarmStatus(null, 2_000).state).toBe("unavailable");
    expect(
      deriveSwarmStatus({ localSeq: 13, entries: { "swarm.updatedAt": "1000" } }, 12_001),
    ).toMatchObject({ state: "stale", freshness: "stale", localSeq: 13 });
    expect(
      deriveSwarmStatus({ localSeq: 14, degraded: true, entries: { "swarm.updatedAt": "2000" } }, 2_001),
    ).toMatchObject({ state: "degraded", freshness: "fresh" });
  });
});
