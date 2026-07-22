import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { HostControlPlane, defaultRegistry } from "../scripts/host-control-plane.mjs";

// ARCHBP-106 — Enforce the little-brother-always-functions invariant;
// controls are reversible and time-bounded. (yzx-iso t8, G8; I13.)

describe("ARCHBP-106 no permanent takeover", () => {
  test("controls are time-bounded: an expired lease auto-releases on sweep", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp106-"));
    try {
      const auditPath = join(dir, "a.jsonl");
      const plane = new HostControlPlane({ auditPath, registry: defaultRegistry(dir, { port: 38486 }) });
      const { expiresAt } = await plane.acquire("workspace-lease", { ttlMs: 50 });
      expect(expiresAt).toBeGreaterThan(Date.now() - 1000);
      const released = await plane.sweep(expiresAt + 1);
      expect(released).toEqual(["workspace-lease"]);
      const actions = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l).action);
      expect(actions).toContain("ttl-expire");
      expect(plane.holds.size).toBe(0); // nothing can be held forever
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("auto-release on failure: a failed acquire leaves zero holds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp106b-"));
    try {
      const registry = defaultRegistry(dir, { port: 38486 });
      registry.resources.push({ name: "bad", adapter: "gpu-advisory", params: { node: "/dev/never0" }, class: "gpu" });
      const plane = new HostControlPlane({ auditPath: join(dir, "a.jsonl"), registry });
      await expect(plane.acquire("bad")).rejects.toThrow();
      expect(plane.holds.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the little-brother invariant is tested: host functions DURING a hold", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp106c-"));
    try {
      const plane = new HostControlPlane({ auditPath: join(dir, "a.jsonl"), registry: defaultRegistry(dir, { port: 38486 }) });
      await plane.acquire("loopback-port-38486");
      // While LifeOS holds the port, the host still functions: filesystem,
      // process spawning, and OTHER ports all remain usable.
      const { execFileSync } = await import("node:child_process");
      const out = execFileSync("bash", ["-c", "echo host-alive; ls / >/dev/null; exit 0"], { encoding: "utf8" });
      expect(out).toContain("host-alive");
      const { createServer } = await import("node:net");
      const other = createServer();
      await new Promise<void>((res, rej) => { other.once("error", rej); other.listen(38487, "127.0.0.1", () => res()); });
      await new Promise((res) => other.close(res));
      await plane.release("loopback-port-38486");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
