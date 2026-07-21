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
  ACTIVE_PLANE,
  PASSIVE_MACRO_AUTHORITY,
  AuthorityViolationError,
  assertNotMacroAuthority,
  correctStatusBytes,
  evaluateWitness,
  classifyWitnessSegments,
} from "../scripts/agentdb-rvf-lifecycle.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/agentdb-rvf-lifecycle.mjs");
const HEX32 = /^[0-9a-f]{32}$/;
const ZERO_ID = "00000000000000000000000000000000";

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process, no native addon).
// ---------------------------------------------------------------------------
describe("ARCHBP-007 authority boundary (passive/active separation)", () => {
  test("declares PostgreSQL/RuVector as the sole passive macro authority, distinct from the active RVF plane", () => {
    expect(PASSIVE_MACRO_AUTHORITY).toBe("postgresql+ruvector");
    expect(ACTIVE_PLANE).toBe("rvf");
    expect(PASSIVE_MACRO_AUTHORITY).not.toBe(ACTIVE_PLANE);
  });

  test("refuses to let the active .rvf plane act as the passive macro authority (no competing authority)", () => {
    expect(() => assertNotMacroAuthority(PASSIVE_MACRO_AUTHORITY)).toThrow(
      AuthorityViolationError,
    );
    // Serving the active plane's own role is allowed.
    expect(assertNotMacroAuthority(ACTIVE_PLANE)).toBe(ACTIVE_PLANE);
  });
});

describe("ARCHBP-007 fail-closed handling of observed API defects", () => {
  test("corrects the status().fileSizeBytes underreport defect using the real on-disk size", () => {
    const corrected = correctStatusBytes({ fileSizeBytes: 0, epoch: 0 }, 1821);
    expect(corrected.fileSizeBytes).toBe(1821);
    expect(corrected.fileSizeBytesRaw).toBe(0);
    expect(corrected.corrected).toBe(true);
  });

  test("never reports a witness as verified when the chain is unavailable (fail-closed)", () => {
    const w = evaluateWitness({
      chain: null,
      verifyResult: null,
      witnessSegments: [{ segType: "witness" }, { segType: "vec" }],
    });
    expect(w.verified).toBe(false);
    expect(w.reason).toBe("witness-chain-unavailable");
    // The witness substrate (persisted segments) is still recorded honestly.
    expect(w.substratePresent).toBe(true);
    expect(w.witnessSegmentCount).toBe(1);
  });

  test("reports verified only when the native chain verification actually succeeds", () => {
    const w = evaluateWitness({
      chain: new Uint8Array(73),
      verifyResult: { valid: true, entryCount: 1 },
      witnessSegments: [{ segType: "witness" }],
    });
    expect(w.verified).toBe(true);
    expect(w.entryCount).toBe(1);
  });

  test("classifies witness segments without trusting the broken chain accessor", () => {
    const c = classifyWitnessSegments([
      { segType: "manifest" },
      { segType: "witness" },
      { segType: "vec" },
      { segType: "witness" },
    ]);
    expect(c.witnessSegmentCount).toBe(2);
    expect(c.substratePresent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Live lifecycle gate clauses (subprocess proof against the real RVF surface).
// ---------------------------------------------------------------------------
describe("ARCHBP-007 RVF lifecycle proof (real @ruvector/rvf + agentdb native surface)", () => {
  test("proves identity, portable export/import, crash recovery, witness-bound feedback, and authority boundary", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp007-lifecycle-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));

      // stable agent identity
      expect(r.identity.fileId).toMatch(HEX32);
      expect(r.identity.parentId).toBe(ZERO_ID);
      expect(r.identity.lineageDepth).toBe(0);

      // active working state persisted + retrievable
      expect(r.active.remembered).toBe(3);
      expect(Array.isArray(r.active.recall)).toBe(true);
      expect(r.active.recall.length).toBeGreaterThan(0);

      // portable .rvf export and import + crash recovery (identity survives)
      expect(r.portability.exported).toBe(true);
      expect(r.portability.exportBytes).toBeGreaterThan(0);
      expect(r.recovery.reopenFileId).toBe(r.identity.fileId);
      expect(r.recovery.recovered).toBe(true);

      // witness-bound feedback: substrate is real, chain verify fails closed
      expect(r.witness.substratePresent).toBe(true);
      expect(r.witness.witnessSegmentCount).toBeGreaterThan(0);
      expect(r.witness.verified).toBe(false);
      expect(r.witness.reason).toBe("witness-chain-unavailable");
      expect(r.feedback.recorded).toBe(true);
      expect(r.feedback.solverTrainCount).toBeGreaterThan(0);

      // observed status defect corrected
      expect(r.status.fileSizeBytesRaw).toBe(0);
      expect(r.status.fileSizeBytes).toBeGreaterThan(0);
      expect(r.status.corrected).toBe(true);

      // no competing macro authority
      expect(r.authority.passive).toBe("postgresql+ruvector");
      expect(r.authority.active).toBe("rvf");
      expect(r.authority.macroAuthorityGuardThrew).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
