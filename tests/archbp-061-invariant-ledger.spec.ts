import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-061 — Enumerate I01..In invariants, each with an acceptance
// predicate, covering isolation, persistence, ownership, portability.
// (yzx-iso t1-4-invariant-ledger, G1.)

const repoRoot = resolve(import.meta.dirname, "..");
const ledgerPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/isolation_invariant_ledger.json",
);
const specPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/isolation-architecture-spec.md",
);

const GOALS = new Set(
  Array.from({ length: 10 }, (_, i) => `G${i + 1}`),
);
const REQUIRED_AXES = ["isolation", "persistence", "ownership", "portability"];

function loadLedger() {
  return JSON.parse(readFileSync(ledgerPath, "utf8"));
}

describe("ARCHBP-061 isolation invariant ledger", () => {
  test("the invariant ledger artifact exists", () => {
    expect(existsSync(ledgerPath)).toBe(true);
  });

  test("invariants are numbered I01..In, each with an acceptance predicate", () => {
    const ledger = loadLedger();
    expect(Array.isArray(ledger.invariants)).toBe(true);
    expect(ledger.invariants.length).toBeGreaterThanOrEqual(10);
    ledger.invariants.forEach(
      (
        inv: { id: string; statement: string; predicate: string },
        index: number,
      ) => {
        expect(inv.id).toBe(`I${String(index + 1).padStart(2, "0")}`);
        expect(typeof inv.statement).toBe("string");
        expect(inv.statement.length).toBeGreaterThan(10);
        expect(typeof inv.predicate).toBe("string");
        expect(inv.predicate.length).toBeGreaterThan(10);
      },
    );
  });

  test("each invariant maps to at least one goal G1-G10", () => {
    const ledger = loadLedger();
    for (const inv of ledger.invariants) {
      expect(Array.isArray(inv.goals), inv.id).toBe(true);
      expect(inv.goals.length, inv.id).toBeGreaterThan(0);
      for (const goal of inv.goals) {
        expect(GOALS.has(goal), `${inv.id}: ${goal}`).toBe(true);
      }
    }
  });

  test("the ledger covers isolation, persistence, ownership, and portability", () => {
    const ledger = loadLedger();
    const covered = new Set(
      ledger.invariants.flatMap((inv: { covers: string[] }) => inv.covers),
    );
    for (const axis of REQUIRED_AXES) {
      expect(covered.has(axis), `axis not covered: ${axis}`).toBe(true);
    }
  });

  test("the ledger is merged as normative into the spec", () => {
    const ledger = loadLedger();
    expect(ledger.normative).toBe(true);
    const spec = readFileSync(specPath, "utf8");
    expect(spec).toContain("isolation_invariant_ledger.json");
    // Every invariant id must be referenced from the normative spec body.
    for (const inv of ledger.invariants) {
      expect(spec).toContain(inv.id);
    }
  });
});
