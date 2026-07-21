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
  FROZEN_MODEL_CONTRACT,
  assertBoundedStats,
  summarizeLatency,
  classifyLocalFailure,
} from "../scripts/ruvllm-inference-lifecycle.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/ruvllm-inference-lifecycle.mjs");

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process, no native addon).
// ---------------------------------------------------------------------------
describe("ARCHBP-008 frozen-model and resource contracts", () => {
  test("declares a profile-owned, no-download frozen model contract", () => {
    expect(FROZEN_MODEL_CONTRACT.download).toBe("none");
    expect(FROZEN_MODEL_CONTRACT.ownership).toBe("profile-only");
    expect(FROZEN_MODEL_CONTRACT.externalModel).toBe(false);
  });

  test("accepts bounded finite resource stats and rejects unbounded ones", () => {
    const ok = assertBoundedStats({
      totalQueries: 3,
      memoryNodes: 0,
      patternsLearned: 1,
      avgLatencyMs: 12.5,
      cacheHitRate: 0.5,
      routerAccuracy: 0.9,
    });
    expect(ok.bounded).toBe(true);
    expect(assertBoundedStats({ totalQueries: Infinity }).bounded).toBe(false);
    expect(assertBoundedStats({ totalQueries: NaN }).bounded).toBe(false);
    expect(assertBoundedStats({ totalQueries: -1 }).bounded).toBe(false);
  });
});

describe("ARCHBP-008 raw latency samples (no fabrication)", () => {
  test("summarizes only real, positive, measured samples", () => {
    const s = summarizeLatency([5, 3, 8, 4]);
    expect(s.count).toBe(4);
    expect(s.minMs).toBe(3);
    expect(s.maxMs).toBe(8);
    expect(s.meanMs).toBeCloseTo(5, 5);
    expect(s.allReal).toBe(true);
  });

  test("fails closed on fabricated, empty, or non-positive samples", () => {
    expect(summarizeLatency([]).allReal).toBe(false);
    expect(summarizeLatency([1, 0, 2]).allReal).toBe(false);
    expect(summarizeLatency([1, -2]).allReal).toBe(false);
    expect(summarizeLatency([1, NaN]).allReal).toBe(false);
  });
});

describe("ARCHBP-008 local failure behavior", () => {
  test("flags demo mode and marks generation unreliable when no native model is loaded", () => {
    const c = classifyLocalFailure({ nativeLoaded: false, confidence: 0.1 });
    expect(c.demoMode).toBe(true);
    expect(c.reliableGeneration).toBe(false);
  });

  test("treats a loaded native model as reliable", () => {
    const c = classifyLocalFailure({ nativeLoaded: true, confidence: 0.9 });
    expect(c.demoMode).toBe(false);
    expect(c.reliableGeneration).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Live lifecycle gate clauses (subprocess proof against the real ruvllm surface).
// ---------------------------------------------------------------------------
describe("ARCHBP-008 ruvllm inference proof (real @ruvector/ruvllm native surface)", () => {
  test("proves frozen identity, isolated cartridges, deterministic lifecycle, bounded resources, local fallback, and raw latency", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp008-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));

      // one frozen model identity, stable across probes
      expect(typeof r.identity.model).toBe("string");
      expect(r.identity.model.length).toBeGreaterThan(0);
      expect(r.identity.stable).toBe(true);
      expect(r.identity.externalModelDownloaded).toBe(false);

      // isolated cartridge state
      expect(r.cartridges.count).toBe(2);
      expect(r.cartridges.activeAfterSwitch).toBe("cart-b");
      expect(r.cartridges.isolated).toBe(true);

      // deterministic startup and shutdown
      expect(r.lifecycle.started).toBe(true);
      expect(r.lifecycle.shutdownClean).toBe(true);
      expect(r.lifecycle.rejectsAfterShutdown).toBe(true);

      // bounded resource use
      expect(r.resources.bounded).toBe(true);

      // local failure behavior
      expect(r.localFailure.demoMode).toBe(true);
      expect(r.localFailure.reliableGeneration).toBe(false);

      // raw latency samples
      expect(Array.isArray(r.latency.samplesMs)).toBe(true);
      expect(r.latency.samplesMs.length).toBeGreaterThanOrEqual(3);
      expect(r.latency.allReal).toBe(true);
      expect(r.latency.meanMs).toBeGreaterThan(0);
      // hot-swap claim is limited to the measured workload
      expect(typeof r.hotSwap.measuredSwapNs).toBe("number");
      expect(r.hotSwap.claimScope).toBe("measured-workload-only");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
