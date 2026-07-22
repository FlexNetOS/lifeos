import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-058 — Document big-brother/little-brother semantics: LifeOS acquires
// and releases host resources on demand; Ubuntu always functions normally.
// (yzx-iso t1-1-two-brother-model, G1.)

const repoRoot = resolve(import.meta.dirname, "..");
const specPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/isolation-architecture-spec.md",
);

describe("ARCHBP-058 two-brother control model", () => {
  test("the isolation architecture spec exists", () => {
    expect(existsSync(specPath)).toBe(true);
  });

  test("acquire + clean-release semantics are written", () => {
    const spec = readFileSync(specPath, "utf8");
    // Acquisition is on-demand and declared.
    expect(spec).toMatch(/acquire/i);
    expect(spec).toMatch(/on demand/i);
    // Release restores the prior host state — clean, reversible, never a
    // permanent takeover.
    expect(spec).toMatch(/clean[- ]release/i);
    expect(spec).toMatch(/restor\w+ (the )?prior host state/i);
    expect(spec).toMatch(/reversible/i);
  });

  test("the little-brother-always-functions invariant is stated", () => {
    const spec = readFileSync(specPath, "utf8");
    expect(spec).toMatch(/little[- ]brother[- ]always[- ]functions/i);
    // Ubuntu updates, reboots, and runs its own daemons without LifeOS
    // interference.
    expect(spec).toMatch(/updates?, reboots?/i);
  });

  test("the two-brother section declares its consumer (t8 host-control lane)", () => {
    const spec = readFileSync(specPath, "utf8");
    expect(spec).toContain("tasks/yzx-iso/t8-0-lane-index");
  });
});
