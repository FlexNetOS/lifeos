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
  WITNESS_ALGORITHM,
  WITNESS_SCHEMA_VERSION,
  DOMAIN_TAGS,
  ALGORITHM_DECISION,
  WitnessChain,
  verifyChain,
} from "../scripts/witness-chain-lifecycle.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/witness-chain-lifecycle.mjs");

function builtChain() {
  const wc = new WitnessChain(WITNESS_ALGORITHM);
  wc.record("source", { id: "S1", bytes: 10 });
  wc.record("vector", { id: "V1", dim: 8 });
  wc.record("decision", { id: "D1", route: "local" });
  wc.record("execution", { id: "E1", status: "ran" });
  wc.record("proof", { id: "P1", accepted: false });
  return wc;
}

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process).
// ---------------------------------------------------------------------------
describe("ARCHBP-016 documented primitive, domain separation, and honest claims", () => {
  test("binds a reviewed standard primitive with domain separation and no impossibility claim", () => {
    expect(WITNESS_ALGORITHM).toBe("sha256");
    expect(WITNESS_SCHEMA_VERSION).toMatch(/^witness-chain\.v\d+$/);
    // five event kinds each get a distinct domain tag
    expect(new Set(Object.values(DOMAIN_TAGS)).size).toBe(5);
    // the decision is documented and standard (no custom cryptography)
    expect(ALGORITHM_DECISION.chosen).toBe("sha256");
    expect(ALGORITHM_DECISION.considered).toContain("shake256");
    expect(ALGORITHM_DECISION.customCryptography).toBe(false);
    expect(ALGORITHM_DECISION.claim).toMatch(/tamper-evident/i);
    expect(ALGORITHM_DECISION.claim).not.toMatch(/impossible/i);
  });
});

describe("ARCHBP-016 tamper-evident witness chain", () => {
  test("a well-formed chain verifies independently", () => {
    const v = verifyChain(builtChain().entries);
    expect(v.valid).toBe(true);
  });

  test("event removal breaks verification", () => {
    const e = builtChain().entries.slice();
    e.splice(2, 1);
    expect(verifyChain(e).valid).toBe(false);
  });

  test("event reorder breaks verification", () => {
    const e = builtChain().entries.slice();
    [e[1], e[2]] = [e[2], e[1]];
    expect(verifyChain(e).valid).toBe(false);
  });

  test("event substitution breaks verification", () => {
    const e = builtChain().entries.map((x) => ({ ...x }));
    e[3] = { ...e[3], data: { id: "E1", status: "TAMPERED" } };
    expect(verifyChain(e).valid).toBe(false);
  });

  test("replaying an entry (duplicate seq) breaks verification", () => {
    const e = builtChain().entries.slice();
    e.push({ ...e[1] });
    expect(verifyChain(e).valid).toBe(false);
  });

  test("algorithm confusion breaks verification (bound algorithm id)", () => {
    const e = builtChain().entries.map((x) => ({ ...x, algorithm: "shake256" }));
    expect(verifyChain(e).valid).toBe(false);
  });

  test("a partial write (missing entryHash) fails closed", () => {
    const e = builtChain().entries.map((x) => ({ ...x }));
    delete e[2].entryHash;
    expect(verifyChain(e).valid).toBe(false);
  });

  test("history is append-only (record returns a growing immutable log)", () => {
    const wc = builtChain();
    const before = wc.entries.length;
    wc.record("proof", { id: "P2", accepted: false });
    expect(wc.entries.length).toBe(before + 1);
    // recorded entries carry monotonically increasing seq
    const seqs = wc.entries.map((x) => x.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
});

// ---------------------------------------------------------------------------
// Live proof (subprocess).
// ---------------------------------------------------------------------------
describe("ARCHBP-016 witness-chain proof", () => {
  test("proves tamper detection across removal, reorder, substitution, replay, algorithm confusion, and partial writes", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp016-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(r.algorithm).toBe("sha256");
      expect(r.decision.customCryptography).toBe(false);
      expect(r.wellFormedValid).toBe(true);
      expect(r.tamperDetection.removal).toBe(true);
      expect(r.tamperDetection.reorder).toBe(true);
      expect(r.tamperDetection.substitution).toBe(true);
      expect(r.tamperDetection.replay).toBe(true);
      expect(r.tamperDetection.algorithmConfusion).toBe(true);
      expect(r.tamperDetection.partialWrite).toBe(true);
      expect(r.independentVerification).toBe(true);
      expect(r.claim).toMatch(/tamper-evident/i);
      expect(r.claim).not.toMatch(/impossible/i);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 120000);
});
