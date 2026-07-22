import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { HostControlPlane, defaultRegistry } from "../scripts/host-control-plane.mjs";

// ARCHBP-101 — Declarative, audited API by which LifeOS takes and releases
// host resources. (yzx-iso t8, G8; I11/I12.)

const repoRoot = resolve(import.meta.dirname, "..");

describe("ARCHBP-101 control-plane API", () => {
  test("the API surface is defined: declarative registry, acquire, release, sweep, revertFromLog", () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp101-"));
    try {
      const plane = new HostControlPlane({
        auditPath: join(dir, "audit.jsonl"),
        registry: defaultRegistry(dir),
      });
      for (const method of ["acquire", "release", "sweep", "revertFromLog", "audit", "resource"]) {
        expect(typeof (plane as Record<string, unknown>)[method], method).toBe("function");
      }
      expect(plane.registry.schema_version).toContain("host-control-registry");
      expect(plane.registry.resources.length).toBeGreaterThanOrEqual(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the audit-log schema is set and every action appends a structured entry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp101b-"));
    try {
      const auditPath = join(dir, "audit.jsonl");
      const plane = new HostControlPlane({ auditPath, registry: defaultRegistry(dir) });
      await plane.acquire("workspace-lease");
      await plane.release("workspace-lease");
      const lines = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(lines.length).toBe(2);
      expect(lines[0]).toMatchObject({ action: "acquire", resource: "workspace-lease" });
      expect(lines[0].prior).toBeDefined();
      expect(lines[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(lines[1]).toMatchObject({ action: "release", restored: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reversibility is guaranteed: release verifies the host returned to prior state", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp101c-"));
    try {
      const plane = new HostControlPlane({ auditPath: join(dir, "a.jsonl"), registry: defaultRegistry(dir) });
      const { prior } = await plane.acquire("loopback-port-38471");
      expect(prior.free).toBe(true);
      const { restored } = await plane.release("loopback-port-38471");
      expect(restored).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
