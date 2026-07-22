import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// ARCHBP-082 — CI guard that fails on any home-owned active owner.
// (yzx-iso t5, G5; invariant I08.)

const repoRoot = resolve(import.meta.dirname, "..");
const guard = resolve(repoRoot, "scripts/check-home-owned-owners.mjs");
const run = (args: string[]) =>
  spawnSync("bun", [guard, ...args], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });

describe("ARCHBP-082 home-owned-owner guard", () => {
  test("the scanner enumerates the live residual surface each CI run (session start)", () => {
    const r = run([]);
    expect(r.status, r.stderr).toBe(0); // no NEW residuals today
    expect(r.stdout).toMatch(/\d+ roots scanned/);
    expect(r.stdout).toContain("PASS");
    // Honesty: the known pre-T5 residuals are enumerated, not hidden.
    expect(r.stderr).toContain("known residual");
    expect(r.stderr).toContain("/home/flexnetos/.claude");
  });

  test("CI fails on a NEW residual (regression) — proven with a shrunken baseline", () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp082-"));
    try {
      // A baseline that omits ~/.claude makes the real, live ~/.claude a
      // "new" residual — the guard must fail.
      const shrunken = {
        schema_version: "lifeos-planning-spine.home-residual-baseline.v0",
        known_residuals: [{ path: "/home/flexnetos/FlexNetOS", why: "fixture" }],
      };
      const p = join(dir, "baseline.json");
      writeFileSync(p, JSON.stringify(shrunken));
      const r = run(["--baseline", p]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("NEW RESIDUAL");
      expect(r.stdout).toContain("FAIL");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("strict mode fails while any residual remains (the post-T5 target)", () => {
    const r = run(["--strict"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("FAIL");
  });
});
