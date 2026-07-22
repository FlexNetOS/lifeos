import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// ARCHBP-093 — Login/boot-triggered, idempotent unit that re-materializes
// the envelope and re-attaches state. (yzx-iso t7, G7.)

const repoRoot = resolve(import.meta.dirname, "..");
const unitPath = resolve(repoRoot, "planning-spine-v0/docs/lifeos-reattach.service");

describe("ARCHBP-093 re-attach trigger unit", () => {
  test("the trigger and idempotency are defined in a declarative user unit", () => {
    expect(existsSync(unitPath)).toBe(true);
    const unit = readFileSync(unitPath, "utf8");
    expect(unit).toContain("WantedBy=default.target"); // login/boot session trigger
    expect(unit).toContain("Type=oneshot");
    expect(unit).toMatch(/idempotent/i);
    expect(unit).toContain("boot-reattach.mjs reattach");
  });

  test("ordering vs host boot: user-session scope only, no host-service coupling", () => {
    const unit = readFileSync(unitPath, "utf8");
    // The host boots freely (G1): the unit never binds to host system units.
    expect(unit).not.toMatch(/^Requires=/m);
    expect(unit).not.toMatch(/^BindsTo=/m);
    expect(unit).not.toMatch(/After=.*\.(service|target)/m);
    expect(unit).toMatch(/No Requires=\/BindsTo= on any host system unit/);
  });

  test("the engine emits the same unit deterministically", () => {
    const r = spawnSync("bun", [resolve(repoRoot, "scripts/boot-reattach.mjs"), "unit"], {
      cwd: repoRoot, encoding: "utf8", timeout: 30000,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(readFileSync(unitPath, "utf8"));
  });
});
