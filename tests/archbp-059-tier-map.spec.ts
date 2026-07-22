import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-059 — Exhaustively classify every runtime path into volatile (tmpfs),
// durable (persistent), or portable (release) tiers so classification cannot
// drift. (yzx-iso t1-2-tier-map, G1/G4.)

const repoRoot = resolve(import.meta.dirname, "..");
const tierMapPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/isolation_tier_map.json",
);

const TIERS = new Set(["volatile", "durable", "portable"]);

// The known agent/runtime surface that a tier map claiming exhaustiveness must
// at minimum classify (env vars and state paths from the 2026-07-21 incident
// analysis and the path-law migration runbook).
const REQUIRED_ENV_VARS = [
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "YAZELIX_STATE_DIR",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "ICM_DB",
];
const REQUIRED_PATH_NAMES = [
  "postgres-datadir",
  "redb-plane",
  "claude-session-transcripts",
  "cargo-target",
  "rustup-toolchains",
  "build-tmp",
  "profile-runtime",
  "runner-work-root",
];

function loadTierMap() {
  return JSON.parse(readFileSync(tierMapPath, "utf8"));
}

describe("ARCHBP-059 runtime path tier map", () => {
  test("the tier map artifact exists", () => {
    expect(existsSync(tierMapPath)).toBe(true);
  });

  test("every entry is classified into exactly volatile, durable, or portable", () => {
    const map = loadTierMap();
    expect(Array.isArray(map.entries)).toBe(true);
    expect(map.entries.length).toBeGreaterThan(0);
    for (const entry of map.entries) {
      expect(entry.name, JSON.stringify(entry)).toBeTruthy();
      expect(TIERS.has(entry.tier), `${entry.name}: ${entry.tier}`).toBe(true);
      expect(typeof entry.path).toBe("string");
      expect(entry.path.length).toBeGreaterThan(0);
    }
  });

  test("the known env-var and state-path surface is covered", () => {
    const map = loadTierMap();
    const names = new Set(map.entries.map((e: { name: string }) => e.name));
    for (const required of [...REQUIRED_ENV_VARS, ...REQUIRED_PATH_NAMES]) {
      expect(names.has(required), `missing classification: ${required}`).toBe(
        true,
      );
    }
  });

  test("rule: nothing durable lives on host /run", () => {
    const map = loadTierMap();
    expect(map.rule).toBe("nothing-durable-on-host-run");
    const offenders = map.entries.filter(
      (e: { tier: string; target_path: string }) =>
        e.tier === "durable" && e.target_path.startsWith("/run/"),
    );
    expect(offenders).toEqual([]);
  });

  test("entries still parasitized on host /run are flagged as misplaced with a durable target", () => {
    const map = loadTierMap();
    const onRun = map.entries.filter(
      (e: { current_path?: string; tier: string }) =>
        (e.current_path ?? "").startsWith("/run/") && e.tier === "durable",
    );
    // The 2026-07-21 incident proved this set is non-empty today (tmpfs
    // profile-runtime); the tier map must record it honestly, not hide it.
    expect(onRun.length).toBeGreaterThan(0);
    for (const entry of onRun) {
      expect(entry.misplaced, `${entry.name} must be flagged misplaced`).toBe(
        true,
      );
      expect(entry.target_path.startsWith("/run/")).toBe(false);
    }
  });

  test("declares its consumer (t3 runtime-relocation lane)", () => {
    const map = loadTierMap();
    expect(map.feeds).toContain("tasks/yzx-iso/t3-0-lane-index");
  });
});
