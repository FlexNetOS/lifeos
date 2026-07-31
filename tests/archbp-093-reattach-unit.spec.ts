import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-093 — Login/launch-triggered, idempotent re-materialization is part
// of the Yazelix launch contract. LifeOS ships a verifier, never a competing
// user unit or host boot service.

const repoRoot = resolve(import.meta.dirname, "..");
const reattachPath = resolve(repoRoot, "scripts/boot-reattach.mjs");
const retiredUnitPath = resolve(repoRoot, "evidence/isolation/lifeos-reattach.service");

describe("ARCHBP-093 Yazelix-owned re-attach", () => {
  test("LifeOS ships no local service unit", () => {
    expect(existsSync(retiredUnitPath)).toBe(false);
    const src = readFileSync(reattachPath, "utf8");
    expect(src).not.toContain("systemctl");
    expect(src).not.toContain("WantedBy=");
  });

  test("the verifier delegates activation to the profile-owned Yazelix bootstrap", () => {
    const src = readFileSync(reattachPath, "utf8");
    expect(src).toContain("YAZELIX_STACK_BOOTSTRAP");
    expect(src).toContain("/home/flexnetos/.nix-profile/bin/yazelix-stack-bootstrap");
    expect(src).toContain("execFileSync(YAZELIX_STACK_BOOTSTRAP");
  });

  test("the full owned stack is readiness-checked after Yazelix activation", () => {
    const src = readFileSync(reattachPath, "utf8");
    for (const service of ["sqld", "postgresql-ruvector", "icm-web", "lifeos-mqtt", "glass-engine-frontdoor"]) {
      expect(src).toContain(`name: "${service}"`);
    }
  });
});
