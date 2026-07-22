import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-073 — Confirm caches, cargo-target, tmp, rustup stay ephemeral on
// tmpfs (or contractually volatile), with no durable data in the volatile
// tier. (yzx-iso t3, G4.)

const repoRoot = resolve(import.meta.dirname, "..");
const tierMap = () =>
  JSON.parse(readFileSync(resolve(repoRoot, "planning-spine-v0/docs/isolation_tier_map.json"), "utf8"));
const enumeration = () =>
  JSON.parse(readFileSync(resolve(repoRoot, "planning-spine-v0/docs/runtime_env_enumeration.json"), "utf8"));

function mountSourceOf(path: string): string | null {
  // Longest-prefix match over the live host mount table.
  const lines = readFileSync("/proc/mounts", "utf8").trim().split("\n");
  let best: { point: string; type: string } | null = null;
  for (const line of lines) {
    const [, point, type] = line.split(" ");
    if (path.startsWith(point) && (!best || point.length > best.point.length)) {
      best = { point, type };
    }
  }
  return best ? best.type : null;
}

describe("ARCHBP-073 volatile tier stays ephemeral", () => {
  test("volatile /run paths are live tmpfs mounts on this host", () => {
    const volatileOnRun = tierMap().entries.filter(
      (e: { tier: string; current_path: string }) =>
        e.tier === "volatile" && e.current_path.startsWith("/run/"),
    );
    expect(volatileOnRun.length).toBeGreaterThan(0); // rustup, build-tmp
    for (const e of volatileOnRun) {
      expect(mountSourceOf(e.current_path), e.name).toBe("tmpfs");
    }
  });

  test("cargo-target is volatile by contract (disk-backed by policy, reproducible)", () => {
    const cargo = tierMap().entries.find((e: { name: string }) => e.name === "cargo-target");
    expect(cargo.tier).toBe("volatile");
    expect(cargo.misplaced).toBe(false);
    expect(cargo.note).toMatch(/reproducible|ephemeral/i);
  });

  test("no durable data hides in the volatile tier", () => {
    // No volatile entry may target a durable-tier destination, and no
    // durable entry may TARGET a tmpfs/volatile root.
    for (const e of tierMap().entries) {
      if (e.tier === "volatile") {
        expect(e.target_path.startsWith("/home/flexnetos/meta/var/lib"), e.name).toBe(false);
      }
      if (e.tier === "durable") {
        expect(e.target_path.startsWith("/run/"), e.name).toBe(false);
      }
    }
    // The live enumeration agrees: every volatile-tagged env var that points
    // at /run is intentional (never a misplaced durable).
    for (const v of enumeration().entries) {
      if (v.tier === "volatile" && v.on_run_tmpfs) {
        expect(v.misplaced, v.name).toBe(false);
      }
    }
  });

  test("the volatile contract is documented in the spec and tier map", () => {
    const spec = readFileSync(
      resolve(repoRoot, "planning-spine-v0/docs/isolation-architecture-spec.md"),
      "utf8",
    );
    expect(spec).toMatch(/volatile.*tmpfs|tmpfs.*volatile/i);
    expect(tierMap().tiers.volatile).toMatch(/tmpfs/);
  });
});
