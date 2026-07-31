import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// ARCHBP-072 — Enumerate CLAUDE_CONFIG_DIR, CODEX_HOME, YAZELIX_STATE_DIR
// and peers under the declared Yazelix path law. (yzx-iso t3, G4.)

const repoRoot = resolve(import.meta.dirname, "..");
const artifact = resolve(repoRoot, "evidence/isolation/runtime_env_enumeration.json");

describe("ARCHBP-072 runtime env enumeration", () => {
  test("the complete var list is captured with durable/volatile tags", () => {
    expect(existsSync(artifact)).toBe(true);
    const e = JSON.parse(readFileSync(artifact, "utf8"));
    const names = e.entries.map((x: { name: string }) => x.name);
    for (const required of [
      "CLAUDE_CONFIG_DIR", "CODEX_HOME", "YAZELIX_STATE_DIR",
      "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_RUNTIME_DIR", "ICM_DB",
      "CARGO_HOME", "CARGO_TARGET_DIR", "TMPDIR",
    ]) {
      expect(names, `missing var: ${required}`).toContain(required);
    }
    for (const entry of e.entries) {
      expect(["runtime", "durable", "volatile", "portable", "unset"]).toContain(entry.tier);
    }
  });

  test("the enumeration is cross-checked against the T1.2 tier map and regenerates live", () => {
    // Regenerate to a temp path so the committed artifact stays untouched.
    const tmpOut = resolve(repoRoot, "node_modules/.cache/archbp-072-enum.json");
    const run = spawnSync(
      "bun",
      [resolve(repoRoot, "scripts/enumerate-runtime-env.mjs"), "--from-targets", `--output=${tmpOut}`],
      { cwd: repoRoot, encoding: "utf8", timeout: 30000 },
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/\d+ vars/);
    const live = JSON.parse(readFileSync(tmpOut, "utf8"));
    expect(live.var_count).toBeGreaterThanOrEqual(10);
    const e = JSON.parse(readFileSync(artifact, "utf8"));
    expect(e.cross_checked_against).toContain("isolation_tier_map.json");
    // Every tier-map-known var carries the map's tier and misplaced flag.
    const map = JSON.parse(
      readFileSync(resolve(repoRoot, "evidence/isolation/isolation_tier_map.json"), "utf8"),
    );
    const mapByName = new Map(map.entries.map((m: { name: string }) => [m.name, m]));
    for (const entry of e.entries.filter((x: { tier_map_entry: boolean }) => x.tier_map_entry)) {
      const m = mapByName.get(entry.name) as { tier: string; misplaced?: boolean };
      expect(entry.tier, entry.name).toBe(m.tier);
      expect(entry.misplaced, entry.name).toBe(Boolean(m.misplaced));
    }
  });

  test("no declared FlexNetOS runtime path resolves under host /run", () => {
    const e = JSON.parse(readFileSync(artifact, "utf8"));
    const onRunDurable = e.entries
      .filter((x: { on_run_tmpfs: boolean; tier: string }) => x.on_run_tmpfs && x.tier === "durable")
      .map((x: { name: string }) => x.name);
    expect(e.durable_on_run_count).toBe(onRunDurable.length);
    expect(onRunDurable).toEqual([]);
    expect(e.on_run_tmpfs_count).toBe(0);
    expect(e.entries.every((x: { target_path?: string }) => !x.target_path?.startsWith("/run/"))).toBe(true);
  });
});
