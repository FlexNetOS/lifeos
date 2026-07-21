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
  DEFAULT_ROUTE,
  defaultPolicy,
  decideRoute,
  replay,
} from "../scripts/ruvltra-routing-lifecycle.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/ruvltra-routing-lifecycle.mjs");

const benign = {
  complexity: 0.9,
  confidence: 0.9,
  privacy: false,
  estimatedCost: 0.1,
  resourceExhausted: false,
  cloudOutage: false,
};

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process, no native addon).
// ---------------------------------------------------------------------------
describe("ARCHBP-013 local-only default", () => {
  test("defaults to local and keeps live routing disabled", () => {
    expect(DEFAULT_ROUTE).toBe("local");
    const policy = defaultPolicy();
    expect(policy.liveRoutingEnabled).toBe(false);
    // Simple/low-complexity work stays local.
    const d = decideRoute({ ...benign, complexity: 0.1 }, policy);
    expect(d.route).toBe("local");
    // Even a fully cloud-eligible workload stays local while live routing is off.
    const d2 = decideRoute(benign, policy);
    expect(d2.cloudEligible).toBe(true);
    expect(d2.route).toBe("local");
    expect(d2.reason).toBe("cloud-eligible-live-routing-disabled");
  });
});

describe("ARCHBP-013 fail-closed routing gates", () => {
  const live = () => ({ ...defaultPolicy(), liveRoutingEnabled: true });

  test("privacy denial forces local (no secret exposure)", () => {
    const d = decideRoute({ ...benign, privacy: true }, live());
    expect(d.cloudEligible).toBe(false);
    expect(d.route).toBe("local");
    expect(d.reason).toBe("privacy-denial");
  });

  test("cost ceiling forces local (no hidden spend)", () => {
    const d = decideRoute({ ...benign, estimatedCost: 999 }, live());
    expect(d.cloudEligible).toBe(false);
    expect(d.reason).toBe("cost-ceiling");
  });

  test("classifier uncertainty forces local (no forecast-only route)", () => {
    const d = decideRoute({ ...benign, confidence: 0.1 }, live());
    expect(d.cloudEligible).toBe(false);
    expect(d.reason).toBe("classifier-uncertainty");
  });

  test("cloud outage falls back to local", () => {
    const d = decideRoute({ ...benign, cloudOutage: true }, live());
    expect(d.cloudEligible).toBe(false);
    expect(d.reason).toBe("outage-fallback");
  });

  test("resource exhaustion with no cloud path fails closed (reject, not silent local crash)", () => {
    const d = decideRoute({ ...benign, privacy: true, resourceExhausted: true }, live());
    expect(d.route).toBe("reject");
  });

  test("a fully eligible workload routes cloud only when live routing is enabled", () => {
    const d = decideRoute(benign, live());
    expect(d.cloudEligible).toBe(true);
    expect(d.route).toBe("cloud");
  });

  test("every decision is fully auditable", () => {
    const d = decideRoute(benign, live());
    expect(d.audit).toBeDefined();
    expect(d.audit.complexity).toBe(benign.complexity);
    expect(d.audit.estimatedCost).toBe(benign.estimatedCost);
    expect(d.audit.costCeiling).toBe(defaultPolicy().costCeiling);
    expect(typeof d.audit.decidedAtSignalDigest).toBe("string");
  });
});

describe("ARCHBP-013 offline replay beats baseline before any live route", () => {
  test("policy replay beats an always-cloud baseline and takes no live route", () => {
    const scenarios = [
      { signals: { ...benign }, expected: "local" }, // eligible but live off -> local
      { signals: { ...benign, privacy: true }, expected: "local" },
      { signals: { ...benign, estimatedCost: 999 }, expected: "local" },
      { signals: { ...benign, confidence: 0.1 }, expected: "local" },
      { signals: { ...benign, cloudOutage: true }, expected: "local" },
      { signals: { ...benign, complexity: 0.05 }, expected: "local" },
    ];
    const r = replay(scenarios, defaultPolicy());
    expect(r.accuracy).toBe(1);
    expect(r.accuracy).toBeGreaterThan(r.baselineAccuracy);
    expect(r.beatsBaseline).toBe(true);
    expect(r.liveRoutesTaken).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Live proof (subprocess) — real FastGRNN complexity signal drives the policy.
// ---------------------------------------------------------------------------
describe("ARCHBP-013 routing proof (real @ruvector/tiny-dancer FastGRNN signal)", () => {
  test("proves local-only default, fail-closed gates, replay-beats-baseline, and no live route", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp013-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(r.defaultRoute).toBe("local");
      expect(r.liveRoutingEnabled).toBe(false);
      expect(r.classifier.trainedFastGrnn).toBe(true);
      expect(typeof r.classifier.sampleComplexity).toBe("number");
      expect(r.gates.privacyDenial).toBe(true);
      expect(r.gates.costCeiling).toBe(true);
      expect(r.gates.classifierUncertainty).toBe(true);
      expect(r.gates.outageFallback).toBe(true);
      expect(r.gates.resourceExhaustionFailsClosed).toBe(true);
      expect(r.replay.beatsBaseline).toBe(true);
      expect(r.replay.liveRoutesTaken).toBe(0);
      expect(r.auditable).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 120000);
});
