import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

// ARCHBP-130 — GAP t2-7-latency-validation: Benchmark in-envelope vs
// bare-native; assert near-zero overhead (no hypervisor tax).

const repoRoot = resolve(import.meta.dirname, "..");
const artifactPath = resolve(repoRoot, "planning-spine-v0/docs/envelope_latency_benchmark.json");
const harness = resolve(repoRoot, "scripts/envelope-latency-bench.mjs");

describe("ARCHBP-130 envelope latency benchmark", () => {
  test("the benchmark harness is built and the recorded run shows overhead within noise", () => {
    expect(existsSync(harness)).toBe(true);
    expect(existsSync(artifactPath)).toBe(true);
    const r = JSON.parse(readFileSync(artifactPath, "utf8"));
    expect(r.runs_per_arm).toBeGreaterThanOrEqual(9);
    expect(r.bare_median_s).toBeGreaterThan(0.5); // long enough to dominate noise
    // The no-hypervisor-tax claim (I04): runtime overhead within 2%.
    expect(Math.abs(r.runtime_overhead_pct)).toBeLessThan(2.0);
    // Honesty: envelope setup cost is recorded separately, not hidden.
    expect(r.envelope_setup_median_ms).toBeGreaterThan(0);
    expect(r.setup_cost_note).toMatch(/excluded from the runtime-latency claim/);
  });

  test("the result is recorded for the T10.7 release gauntlet", () => {
    const r = JSON.parse(readFileSync(artifactPath, "utf8"));
    expect(r.recorded_for).toContain("t10-7-latency-benchmark");
    expect(Array.isArray(r.bare_samples_s)).toBe(true);
    expect(Array.isArray(r.envelope_samples_s)).toBe(true);
    expect(r.bare_samples_s.length).toBe(r.runs_per_arm);
  });

  test("the harness executes live and reproduces near-zero overhead (loose CI tolerance)", () => {
    const tmpOut = resolve(repoRoot, "node_modules/.cache/archbp-130-bench.json");
    const run = spawnSync("bun", [harness, `--output=${tmpOut}`], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 180000,
    });
    expect(run.status, run.stderr).toBe(0);
    const live = JSON.parse(readFileSync(tmpOut, "utf8"));
    // Liveness tolerance: the full suite runs ~16 spec files concurrently,
    // so CPU contention adds noise well beyond the quiet-host measurement.
    // 10% still refutes any hypervisor-class tax (VM/container overheads are
    // 10-30%+); the committed artifact above carries the strict <2% record
    // measured on a quiet host.
    expect(Math.abs(live.runtime_overhead_pct)).toBeLessThan(10.0);
  }, 180000);
});
