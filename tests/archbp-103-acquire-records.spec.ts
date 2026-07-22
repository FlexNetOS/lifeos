import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { HostControlPlane, defaultRegistry } from "../scripts/host-control-plane.mjs";

// ARCHBP-103 — Take authoritative control while recording prior host state
// for restore. (yzx-iso t8, G8; I11.)

describe("ARCHBP-103 acquire records prior state", () => {
  test("acquire captures the pre-acquire host state before taking control", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp103-"));
    try {
      const auditPath = join(dir, "a.jsonl");
      const plane = new HostControlPlane({ auditPath, registry: defaultRegistry(dir) });
      const { prior } = await plane.acquire("loopback-port-38471");
      expect(prior).toEqual({ port: 38471, free: true }); // real pre-state
      const audit = JSON.parse(readFileSync(auditPath, "utf8").trim().split("\n")[0]);
      expect(audit.prior).toEqual(prior); // recorded in the durable log
      await plane.release("loopback-port-38471");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("conflicts are handled: a second acquire of a held resource is denied and audited", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp103b-"));
    try {
      const auditPath = join(dir, "a.jsonl");
      const plane = new HostControlPlane({ auditPath, registry: defaultRegistry(dir) });
      await plane.acquire("workspace-lease");
      await expect(plane.acquire("workspace-lease")).rejects.toThrow(/conflict/);
      const lines = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(lines.some((l) => l.action === "acquire-denied" && l.reason === "already-held")).toBe(true);
      await plane.release("workspace-lease");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a failing acquire auto-releases and is audited (nothing stays half-held)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp103c-"));
    try {
      const auditPath = join(dir, "a.jsonl");
      const registry = defaultRegistry(dir);
      registry.resources.push({ name: "missing-gpu", adapter: "gpu-advisory", params: { node: "/dev/nonexistent0" }, class: "gpu" });
      const plane = new HostControlPlane({ auditPath, registry });
      await expect(plane.acquire("missing-gpu")).rejects.toThrow(/missing/);
      const lines = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(lines.some((l) => l.action === "auto-release" && l.resource === "missing-gpu")).toBe(true);
      expect(plane.holds.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
