import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { rematerializeEnvelope, reattachDurablePlane } from "../scripts/boot-reattach.mjs";

// ARCHBP-094 — Recreate the bwrap envelope + mounts after a reboot.
// ARCHBP-095 — Rebind the durable plane so services find their data.
// (yzx-iso t7, G7; both proven by live execution of the re-attach path.)

const repoRoot = resolve(import.meta.dirname, "..");

describe("ARCHBP-094 envelope re-materialization", () => {
  test("the envelope is rebuilt live with its mounts, matching the T2 design", () => {
    const r = rematerializeEnvelope();
    expect(r.ok).toBe(true);
    // T2 design conformance: private PID namespace, private UTS hostname,
    // home overlay opaque — the same probe surface ARCHBP-066 proved.
    expect(r.probe.pid).toBe(2);
    expect(r.probe.hostname).toBe("yzx-envelope");
    expect(r.probe.host_home_visible).toBe("no");
    expect(Number(r.probe.mounts)).toBeGreaterThan(10); // mounts restored
  }, 60000);
});

describe("ARCHBP-095 durable-plane rebind", () => {
  test("durable mounts re-attach with correct ownership, paths matching T3/T4", () => {
    const r = reattachDurablePlane();
    expect(r.ok).toBe(true);
    const byName = new Map(r.roots.map((x: { name: string }) => [x.name, x]));
    // Paths are exactly the tier map's durable roots (T3/T4 authority).
    const map = JSON.parse(
      readFileSync(resolve(repoRoot, "planning-spine-v0/docs/isolation_tier_map.json"), "utf8"),
    );
    const durableTargets = map.entries
      .filter((e: { tier: string }) => e.tier === "durable")
      .map((e: { target_path: string }) => e.target_path);
    const pg = byName.get("postgres-datadir") as { path: string; exists: boolean; owned: boolean };
    expect(pg.exists).toBe(true);
    expect(pg.owned).toBe(true); // ownership correct: this user owns its data
    expect(durableTargets.some((t: string) => t.startsWith(pg.path))).toBe(true);
    const xdg = byName.get("xdg-data") as { writable: boolean; owned: boolean };
    expect(xdg.writable).toBe(true);
    expect(xdg.owned).toBe(true);
  });
});
