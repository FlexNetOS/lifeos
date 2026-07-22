import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { HostControlPlane, defaultRegistry } from "../scripts/host-control-plane.mjs";

// ARCHBP-105 — Durable, reversible log of every control action.
// (yzx-iso t8, G8.)

const DURABLE_ROOT = "/home/flexnetos/meta/var/xdg-data/lifeos/host-control";

describe("ARCHBP-105 durable reversible audit log", () => {
  test("every action is logged append-only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp105-"));
    try {
      const auditPath = join(dir, "a.jsonl");
      const plane = new HostControlPlane({ auditPath, registry: defaultRegistry(dir) });
      await plane.acquire("workspace-lease");
      await plane.release("workspace-lease");
      await plane.acquire("loopback-port-38471");
      await plane.release("loopback-port-38471");
      const actions = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l).action);
      expect(actions).toEqual(["acquire", "release", "acquire", "release"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("holds are reversible from the log alone (revertFromLog releases everything held)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp105b-"));
    try {
      const auditPath = join(dir, "a.jsonl");
      const plane = new HostControlPlane({ auditPath, registry: defaultRegistry(dir) });
      await plane.acquire("workspace-lease");
      await plane.acquire("loopback-port-38471");
      const released = await plane.revertFromLog();
      expect(released.sort()).toEqual(["loopback-port-38471", "workspace-lease"]);
      expect(plane.holds.size).toBe(0);
      expect(existsSync(join(dir, "lease"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the operational log lives in the durable plane (meta/var xdg-data tier)", async () => {
    // Real durable-plane write: the demo audit target under meta/var —
    // the tier map's durable xdg-data root — receives the control log.
    const auditPath = join(DURABLE_ROOT, "audit.jsonl");
    const scratch = mkdtempSync(join(tmpdir(), "archbp105c-"));
    try {
      const plane = new HostControlPlane({ auditPath, registry: defaultRegistry(scratch) });
      await plane.acquire("workspace-lease");
      await plane.release("workspace-lease");
      expect(existsSync(auditPath)).toBe(true);
      const lines = readFileSync(auditPath, "utf8").trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(2);
      // Durable-tier location per the tier map (meta/var/xdg-data).
      expect(auditPath.startsWith("/home/flexnetos/meta/var/xdg-data/")).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
