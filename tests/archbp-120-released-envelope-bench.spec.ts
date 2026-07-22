import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-120 — Benchmark the released envelope vs bare native; confirm no
// hypervisor tax. Gate: Benchmark run; Overhead within noise; Consumes T2.7
// harness. (yzx-iso t10-7, G2 — the RELEASED-bundle instantiation of the
// ARCHBP-130 measurement: the same self-timing harness, pointed at the
// bundle launcher in --store mode with the host store hidden.)

const repoRoot = resolve(import.meta.dirname, "..");
const benchPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/envelope_released_benchmark.json",
);
const BENCH_BUNDLE = "/home/flexnetos/meta/var/cache/archbp021/bench-bundle";
const load = () => JSON.parse(readFileSync(benchPath, "utf8"));

describe("ARCHBP-120 released-envelope benchmark", () => {
  test("the benchmark ran through the T2.7 harness against the released launcher", () => {
    expect(existsSync(benchPath)).toBe(true);
    const b = load();
    expect(b.schema_version).toBe("lifeos-planning-spine.envelope-latency-bench.v0");
    expect(b.released_engine).toContain("released-engine-shim.sh");
    expect(b.consumes).toContain("envelope-latency-bench.mjs");
    expect(b.runs_per_arm).toBeGreaterThanOrEqual(9);
    expect(b.bare_samples_s.length).toBe(b.runs_per_arm);
    expect(b.envelope_samples_s.length).toBe(b.runs_per_arm);
  });

  test("runtime overhead is within noise — no hypervisor tax", () => {
    const b = load();
    // The recorded run must land within measurement noise: the envelope is
    // a native-process namespace, not a hypervisor (I04). Committed record
    // keeps the tight bound; the workload self-times to exclude setup.
    expect(Math.abs(b.runtime_overhead_pct)).toBeLessThan(5);
    expect(b.envelope_setup_median_ms).toBeLessThan(1000); // one-time, reported honestly
  });

  test("the released bundle executes the workload live with the host store hidden", () => {
    const python = execFileSync("bash", ["-c", 'readlink -f "$(command -v python3)"'], { encoding: "utf8" }).trim();
    const out = execFileSync(`${BENCH_BUNDLE}/released-engine-shim.sh`, [
      "enter", "--id", "archbp120-spec", "--",
      python, "-c", "import os; print('released-ok', len(os.listdir('/nix/store')))",
    ], { encoding: "utf8", timeout: 60000 });
    expect(out).toContain("released-ok");
    const visible = Number(out.trim().split(" ").pop());
    expect(visible).toBeLessThan(100); // the bundle closure only — host store hidden
  }, 90000);
});
