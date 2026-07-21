import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import {
  SCALE_STEPS,
  scaleSchedule,
  percentile,
  confidenceInterval95,
  declaredCells,
} from "../scripts/swarm-scale-harness.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/swarm-scale-harness.mjs");

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process).
// ---------------------------------------------------------------------------
describe("ARCHBP-010 declared scale steps and honest capacity schedule", () => {
  test("declares the 1/8/16/32/50 scale ladder and runs 50 only when capacity permits", () => {
    expect(SCALE_STEPS).toEqual([1, 8, 16, 32, 50]);
    const ample = scaleSchedule(48);
    expect(ample.scales).toContain(50);
    expect(ample.skipped).toEqual([]);
    const scarce = scaleSchedule(2);
    expect(scarce.scales).toContain(1);
    expect(scarce.scales).toContain(8);
    expect(scarce.scales).not.toContain(50);
    expect(scarce.skipped).toContain(50);
    expect(scarce.reason).toMatch(/capacity/i);
  });
});

describe("ARCHBP-010 honest statistics and declared cells", () => {
  test("computes percentiles and 95% confidence intervals from raw samples", () => {
    const s = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
    expect(percentile(s, 50)).toBeGreaterThan(0);
    expect(percentile(s, 95)).toBeGreaterThanOrEqual(percentile(s, 50));
    const ci = confidenceInterval95(s);
    expect(ci.n).toBe(10);
    expect(ci.low).toBeLessThanOrEqual(ci.mean);
    expect(ci.high).toBeGreaterThanOrEqual(ci.mean);
  });

  test("declares which resource cells are measured and does not claim GPU/network", () => {
    const cells = declaredCells();
    expect(cells.cpu).toBe(true);
    expect(cells.memory).toBe(true);
    expect(cells.gpu).toBe(false);
    expect(cells.network).toBe(false);
    expect(cells.storage).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Live proof (subprocess) — real worker_threads scale measurement.
// ---------------------------------------------------------------------------
describe("ARCHBP-010 swarm scale proof (real worker_threads)", () => {
  test("publishes raw samples and hardware identity across scales, with overload and recovery", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp010-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));

      // exact hardware/software identity published
      expect(typeof r.hardware.cpuModel).toBe("string");
      expect(r.hardware.logicalCpus).toBeGreaterThan(0);
      expect(typeof r.hardware.nodeVersion).toBe("string");

      // ran the required scale ladder (this host has capacity for 50)
      const scales = r.sweep.map((s) => s.scale);
      expect(scales).toContain(1);
      expect(scales).toContain(8);
      expect(scales).toContain(16);
      expect(scales).toContain(32);
      expect(scales).toContain(50);

      // every reported scale has raw samples and a confidence interval — no
      // architecture claim exceeds measured evidence
      for (const s of r.sweep) {
        expect(s.rawSampleCount).toBe(s.scale);
        expect(s.samplesMs.length).toBe(s.scale);
        expect(s.ci.n).toBe(s.scale);
        expect(s.meanMs).toBeGreaterThan(0);
      }

      // overload degrades, recovery returns toward baseline
      expect(r.overload.overloadMeanMs).toBeGreaterThan(0);
      expect(r.overload.degraded).toBe(true);
      expect(r.recovery.recovered).toBe(true);

      // honest limits declared
      expect(r.honestLimits.gpuMeasured).toBe(false);
      expect(r.honestLimits.networkMeasured).toBe(false);
      expect(typeof r.honestLimits.note).toBe("string");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 180000);
});
