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
  SUPPORTED_LEARNING_COMPONENTS,
  assertSupportedComponent,
  buildProvenance,
  evaluatePromotion,
  assertResourceBudget,
} from "../scripts/learning-boundary-lifecycle.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/learning-boundary-lifecycle.mjs");

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process, no native addon).
// ---------------------------------------------------------------------------
describe("ARCHBP-009 supported-component whitelist", () => {
  test("accepts only the primary-source MicroLoRA, SONA, and FastGRNN components", () => {
    expect([...SUPPORTED_LEARNING_COMPONENTS].sort()).toEqual(["fastgrnn", "microlora", "sona"]);
    expect(assertSupportedComponent("sona")).toBe("sona");
    expect(() => assertSupportedComponent("invented-optimizer")).toThrow();
    expect(() => assertSupportedComponent("gpt-online")).toThrow();
  });
});

describe("ARCHBP-009 exact source/model identity (provenance)", () => {
  test("requires every identity field and freezes the record", () => {
    const p = buildProvenance({
      component: "sona",
      packageVersion: "0.1.7",
      nativeVersion: "2.2.3",
      model: "sona-h8-mlr2",
      agentId: "agent-a",
      digest: "abc123",
    });
    expect(p.component).toBe("sona");
    expect(p.packageVersion).toBe("0.1.7");
    expect(p.nativeVersion).toBe("2.2.3");
    expect(Object.isFrozen(p)).toBe(true);
  });

  test("fails closed on any missing identity field", () => {
    expect(() => buildProvenance({ component: "sona" })).toThrow();
    expect(() =>
      buildProvenance({ component: "sona", packageVersion: "0.1.7", nativeVersion: "2.2.3", model: "m", agentId: "", digest: "d" }),
    ).toThrow();
  });
});

describe("ARCHBP-009 witness-backed promotion gate", () => {
  test("promotes only complete provenance with sufficient quality and a witness", () => {
    expect(evaluatePromotion({ provenanceComplete: true, quality: 0.9, witness: "w1", threshold: 0.5 }).promoted).toBe(true);
    expect(evaluatePromotion({ provenanceComplete: true, quality: 0.2, witness: "w1", threshold: 0.5 }).promoted).toBe(false);
    expect(evaluatePromotion({ provenanceComplete: true, quality: 0.9, witness: null, threshold: 0.5 }).promoted).toBe(false);
    expect(evaluatePromotion({ provenanceComplete: false, quality: 0.9, witness: "w1", threshold: 0.5 }).promoted).toBe(false);
  });
});

describe("ARCHBP-009 resource budgets", () => {
  test("accepts bounded learning stats and rejects dropped or non-finite counters", () => {
    expect(assertResourceBudget({ trajectories_dropped: 0, patterns_stored: 1 }, { maxDropped: 0 }).withinBudget).toBe(true);
    expect(assertResourceBudget({ trajectories_dropped: 3, patterns_stored: 1 }, { maxDropped: 0 }).withinBudget).toBe(false);
    expect(assertResourceBudget({ trajectories_dropped: NaN }, { maxDropped: 0 }).withinBudget).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Live lifecycle gate clauses (subprocess proof against the real learning stack).
// ---------------------------------------------------------------------------
describe("ARCHBP-009 learning-boundary proof (real @ruvector/sona + @ruvector/tiny-dancer)", () => {
  test("proves provenance identity, per-agent isolation, witness-gated promotion, deterministic rollback, resource budgets, and FastGRNN integration", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp009-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));

      // exact source/model identity
      expect(r.provenance.sona.packageVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(r.provenance.sona.nativeVersion.length).toBeGreaterThan(0);
      expect(r.provenance.fastgrnn.packageVersion).toMatch(/^\d+\.\d+\.\d+/);

      // per-agent isolation: agent-a learns, agent-b is unaffected
      expect(r.isolation.agentASandboxPatterns).toBeGreaterThan(0);
      expect(r.isolation.agentBSandboxPatterns).toBe(0);
      expect(r.isolation.isolated).toBe(true);

      // learned state must not affect execution before witness-backed promotion
      expect(r.promotion.executionBeforePromotionUsesBaseline).toBe(true);
      expect(r.promotion.promoted).toBe(true);
      expect(r.promotion.executionAfterPromotionUsesSandbox).toBe(true);

      // deterministic rollback reverts execution to baseline
      expect(r.rollback.deterministic).toBe(true);
      expect(r.rollback.executionAfterRollbackMatchesBaseline).toBe(true);

      // resource budget respected
      expect(r.resources.withinBudget).toBe(true);

      // FastGRNN integrated with a real score
      expect(typeof r.fastgrnn.score).toBe("number");
      expect(Number.isFinite(r.fastgrnn.score)).toBe(true);

      // only supported components; an unsupported one is rejected
      expect(r.componentGuard.rejectedUnsupported).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 120000);
});
