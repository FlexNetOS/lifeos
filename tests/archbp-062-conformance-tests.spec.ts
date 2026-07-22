import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-062 — For each goal G1-G10 define the concrete runnable test that
// proves it (e.g. host full-upgrade+reboot leaves LifeOS byte-identical).
// (yzx-iso t1-5-conformance-tests, G1.)

const repoRoot = resolve(import.meta.dirname, "..");
const specPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/isolation-architecture-spec.md",
);
const ledgerPath = resolve(
  repoRoot,
  "planning-spine-v0/docs/isolation_invariant_ledger.json",
);

function loadLedger() {
  return JSON.parse(readFileSync(ledgerPath, "utf8"));
}

describe("ARCHBP-062 per-goal conformance tests", () => {
  test("G1-G10 each has a named conformance test in the spec", () => {
    expect(existsSync(specPath)).toBe(true);
    const spec = readFileSync(specPath, "utf8");
    for (let i = 1; i <= 10; i += 1) {
      expect(spec, `missing conformance test CT-G${i}`).toContain(`CT-G${i}`);
    }
  });

  test("every conformance test references at least one invariant ID", () => {
    const spec = readFileSync(specPath, "utf8");
    const ledger = loadLedger();
    const invariantIds = new Set(
      ledger.invariants.map((inv: { id: string }) => inv.id),
    );
    for (let i = 1; i <= 10; i += 1) {
      // Take the CT-Gn table row / definition line and require an I-id on it.
      const line = spec
        .split("\n")
        .find((l) => l.includes(`CT-G${i}`) && /I\d{2}/.test(l));
      expect(line, `CT-G${i} does not reference an invariant`).toBeTruthy();
      const referenced = line!.match(/I\d{2}/g) ?? [];
      expect(referenced.length).toBeGreaterThan(0);
      for (const id of referenced) {
        expect(invariantIds.has(id), `CT-G${i}: unknown invariant ${id}`).toBe(
          true,
        );
      }
    }
  });

  test("the acceptance gauntlet is handed to the t10 release lane", () => {
    const spec = readFileSync(specPath, "utf8");
    expect(spec).toContain("tasks/yzx-iso/t10-0-lane-index");
  });
});
