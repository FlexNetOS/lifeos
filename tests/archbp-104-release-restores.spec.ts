import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { HostControlPlane, defaultRegistry } from "../scripts/host-control-plane.mjs";

// ARCHBP-104 — Restore prior host state on release so the OS returns to
// normal. (yzx-iso t8, G8; I12/I13.)

describe("ARCHBP-104 release restores prior host state", () => {
  test("release restores and independently verifies OS normalcy (port usable again)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp104-"));
    try {
      const plane = new HostControlPlane({ auditPath: join(dir, "a.jsonl"), registry: defaultRegistry(dir) });
      await plane.acquire("loopback-port-38471");
      const { restored } = await plane.release("loopback-port-38471");
      expect(restored).toBe(true);
      // Independent OS-normalcy proof: the little brother can bind the port
      // again immediately after release.
      const server = createServer();
      await new Promise<void>((res, rej) => {
        server.once("error", rej);
        server.listen(38471, "127.0.0.1", () => res());
      });
      await new Promise((res) => server.close(res));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no residue: worker processes and lease dirs are gone after release", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp104b-"));
    try {
      const plane = new HostControlPlane({ auditPath: join(dir, "a.jsonl"), registry: defaultRegistry(dir) });
      await plane.acquire("background-worker");
      expect(existsSync(join(dir, "worker.pid"))).toBe(true);
      await plane.acquire("workspace-lease");
      expect(existsSync(join(dir, "lease"))).toBe(true);
      await plane.release("background-worker");
      await plane.release("workspace-lease");
      expect(existsSync(join(dir, "worker.pid"))).toBe(false);
      expect(existsSync(join(dir, "lease"))).toBe(false);
      expect(plane.holds.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
