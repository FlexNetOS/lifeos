import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// ARCHBP-075 — CI check that fails if any durable var points at host /run.
// (yzx-iso t3, G4; invariant I06.)

const repoRoot = resolve(import.meta.dirname, "..");
const guard = resolve(repoRoot, "scripts/check-durable-not-on-run.mjs");

const run = (args: string[]) =>
  spawnSync("bun", [guard, ...args], { cwd: repoRoot, encoding: "utf8", timeout: 30000 });

describe("ARCHBP-075 durable-not-on-run CI guard", () => {
  test("the guard runs in CI (this suite) and passes on the current clean targets", () => {
    const r = run([]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("PASS");
    // Honesty: the known restart-gated live misplacement is REPORTED, not
    // hidden, while targets stay clean.
    expect(r.stderr).toContain("misplaced (known, restart-gated)");
  });

  test("strict mode fails today — the live misplacement is real until the migration lands", () => {
    const r = run(["--strict"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("FAIL");
  });

  test("fails on regression: a durable entry targeting /run is rejected", () => {
    const dir = mkdtempSync(join(tmpdir(), "archbp075-"));
    try {
      const bad = {
        schema_version: "lifeos-planning-spine.isolation-tier-map.v0",
        rule: "nothing-durable-on-host-run",
        entries: [
          {
            name: "REGRESSED_VAR",
            kind: "env-var",
            path: "$REGRESSED_VAR",
            current_path: "/run/user/1001/oops",
            target_path: "/run/user/1001/oops",
            tier: "durable",
            misplaced: false,
          },
        ],
      };
      const badPath = join(dir, "bad_tier_map.json");
      writeFileSync(badPath, JSON.stringify(bad));
      const r = run(["--tier-map", badPath]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("REGRESSION");
      expect(r.stdout).toContain("FAIL");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
