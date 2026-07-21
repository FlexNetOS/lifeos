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
  MINCUT_ALGORITHM,
  COMPLEXITY_CLASS,
  classifyCut,
  boundedIsolation,
} from "../scripts/mincut-swarm-isolation.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/mincut-swarm-isolation.mjs");

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process).
// ---------------------------------------------------------------------------
describe("ARCHBP-015 supported implementation and honest complexity", () => {
  test("uses the exact Stoer-Wagner min cut and claims only polynomial complexity", () => {
    expect(MINCUT_ALGORITHM).toBe("stoer-wagner");
    expect(COMPLEXITY_CLASS).toBe("polynomial");
    // never a subpolynomial claim
    expect(COMPLEXITY_CLASS).not.toContain("subpolynomial");
  });
});

describe("ARCHBP-015 cut classification and bounded blast radius", () => {
  test("classifies a cut below the threshold as harmful", () => {
    expect(classifyCut(1, 2).harmful).toBe(true);
    expect(classifyCut(9, 2).harmful).toBe(false);
    expect(classifyCut(2, 2).harmful).toBe(false);
  });

  test("isolates only the smaller partition (bounded blast radius)", () => {
    const iso = boundedIsolation([[0, 1, 2], [3, 4, 5, 6, 7]]);
    expect(iso.isolated).toEqual([0, 1, 2]);
    expect(iso.blastRadius).toBe(3);
    expect(iso.blastRadius).toBeLessThanOrEqual(Math.ceil(8 / 2));
  });
});

// ---------------------------------------------------------------------------
// Live proof (subprocess) — real agentdb MincutService.
// ---------------------------------------------------------------------------
describe("ARCHBP-015 MinCut swarm isolation proof (real agentdb MincutService)", () => {
  test("detects and isolates compromised swarms, avoids false positives, and recovers", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp015-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));

      // exact supported implementation + honest complexity
      expect(r.algorithm).toBe("stoer-wagner");
      expect(r.complexityClass).toBe("polynomial");
      expect(r.subpolynomialClaimed).toBe(false);

      // compromised: harmful boundary detected with reproducible evidence, bounded blast radius
      expect(r.compromised.harmful).toBe(true);
      expect(r.compromised.cutSize).toBe(1);
      expect(Array.isArray(r.compromised.cutEdges)).toBe(true);
      expect(r.compromised.cutEdges.length).toBeGreaterThan(0);
      expect(r.compromised.blastRadius).toBeLessThanOrEqual(3);

      // healthy + noisy: no false isolation
      expect(r.healthy.harmful).toBe(false);
      expect(r.noisy.harmful).toBe(false);

      // partitioned: real disconnection surfaced (cut 0)
      expect(r.partitioned.cutSize).toBe(0);

      // false-positive analysis measured (0 over the healthy/noisy set)
      expect(r.falsePositiveRate).toBe(0);

      // recovery: after isolating the compromised partition, the remainder is healthy
      expect(r.recovery.remainderHarmful).toBe(false);

      // reproducible evidence: deterministic across two runs
      expect(r.reproducible).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 120000);
});
