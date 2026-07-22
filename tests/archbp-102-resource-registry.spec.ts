import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error mjs module
import { defaultRegistry, HostControlPlane } from "../scripts/host-control-plane.mjs";

// ARCHBP-102 — Register desktop apps, daemons, network, GPU, ports,
// update/power as controllable resources. (yzx-iso t8, G8.)

describe("ARCHBP-102 controllable-resource registry", () => {
  test("the registry enumerates resources across the controllable classes", () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp102-"));
    try {
      const reg = defaultRegistry(dir, { port: 23482 });
      const classes = new Set(reg.resources.map((r: { class: string }) => r.class));
      // The in-session provable classes; desktop apps / network-controller /
      // update-policy adapters land with their host-gated lanes (Omada T6,
      // update governance T9) on the same adapter contract.
      for (const c of ["ports", "power-policy", "daemons", "gpu"]) {
        expect(classes.has(c), `class missing: ${c}`).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("every resource has a per-resource acquire/release adapter with prior-state capture", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp102b-"));
    try {
      const plane = new HostControlPlane({ auditPath: join(dir, "a.jsonl"), registry: defaultRegistry(dir, { port: 23482 }) });
      for (const r of plane.registry.resources) {
        const { prior } = await plane.acquire(r.name, { ttlMs: 10000 });
        expect(prior, r.name).toBeDefined(); // prior state captured per resource
        const { restored } = await plane.release(r.name);
        expect(restored, r.name).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
