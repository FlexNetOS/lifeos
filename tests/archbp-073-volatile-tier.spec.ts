import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-073 — All FlexNetOS runtime state, including regenerable caches and
// scratch space, remains under the persistent Yazelix runtime root. Cargo is
// supplied by fenix and keeps its registry/build state on Meta-owned storage.

const repoRoot = resolve(import.meta.dirname, "..");
const tierMap = () =>
  JSON.parse(readFileSync(resolve(repoRoot, "evidence/isolation/isolation_tier_map.json"), "utf8"));
const enumeration = () =>
  JSON.parse(readFileSync(resolve(repoRoot, "evidence/isolation/runtime_env_enumeration.json"), "utf8"));
const runtimeRoot = "/home/flexnetos/meta/var/lib/yazelix/runtime";

describe("ARCHBP-073 Yazelix owns the complete runtime tier", () => {
  test("every declared runtime or volatile path is inside Yazelix", () => {
    for (const entry of tierMap().entries.filter((e: { tier: string }) => ["runtime", "volatile"].includes(e.tier))) {
      if (entry.target_path === "tmpfs") continue; // private in-envelope /tmp, not host runtime
      expect(entry.target_path.startsWith(runtimeRoot), entry.name).toBe(true);
      expect(entry.target_path.startsWith("/run/"), entry.name).toBe(false);
    }
  });

  test("Cargo state is durable and fenix is the only toolchain owner", () => {
    const cargoHome = tierMap().entries.find((e: { name: string }) => e.name === "CARGO_HOME");
    const cargoTarget = tierMap().entries.find((e: { name: string }) => e.name === "CARGO_TARGET_DIR");
    expect(cargoHome.tier).toBe("durable");
    expect(cargoTarget.tier).toBe("durable");
    expect(cargoHome.note).toMatch(/fenix/i);
    expect(cargoTarget.note).toMatch(/fenix/i);
    expect(tierMap().entries.some((e: { name: string }) => e.name === "RUSTUP_HOME")).toBe(false);
  });

  test("the captured environment has no host-runtime owner", () => {
    expect(enumeration().on_run_tmpfs_count).toBe(0);
    for (const entry of enumeration().entries) {
      expect(entry.target_path?.startsWith("/run/"), entry.name).toBe(false);
    }
  });

  test("the tier map states the durable Yazelix runtime contract", () => {
    expect(tierMap().tiers.runtime).toMatch(/Yazelix-owned runtime root/);
    expect(tierMap().tiers.durable).toMatch(/never host \/run/);
  });
});
