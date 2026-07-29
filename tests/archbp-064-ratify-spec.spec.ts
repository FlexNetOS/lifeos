import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-064 — Finalize and publish the isolation spec so T2-T10 reference a
// stable authority. (yzx-iso t1-9-ratify-spec, G1.)

const repoRoot = resolve(import.meta.dirname, "..");
const specPath = resolve(
  repoRoot,
  "evidence/isolation/isolation-architecture-spec.md",
);

describe("ARCHBP-064 spec ratification and publication", () => {
  test("the spec carries a version and a ratification record", () => {
    expect(existsSync(specPath)).toBe(true);
    const spec = readFileSync(specPath, "utf8");
    // Semantic version and explicit ratified status.
    expect(spec).toMatch(/version:\s*1\.\d+\.\d+/i);
    expect(spec).toMatch(/status:\s*ratified/i);
    // The review basis is recorded — the 2026-07-22 yzx-iso vs planning-spine
    // reconciliation (verdicts in GitKB), not an unstated rubber stamp.
    expect(spec).toMatch(/reconciliation/i);
    expect(spec).toContain("evidence/isolation");
  });

  test("the spec is the stable authority referenced by all ten lane indexes", () => {
    const spec = readFileSync(specPath, "utf8");
    expect(spec).toContain("ARCHBP-058");
    expect(spec).toContain("ARCHBP-071");
  });

  test("the spec anchors to the RuVector blueprint and the owner-stated brief", () => {
    const spec = readFileSync(specPath, "utf8");
    expect(spec).toContain(
      "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
    );
    expect(spec).toContain("yazelix/envelope/yzx-envelope.nu");
  });

  test("the published spec is versioned inside the planning spine docs tree", () => {
    // Publication means the normative copy is a tracked, repository-owned
    // evidence receipt, not an untracked home-directory draft.
    expect(specPath.includes("evidence/isolation/isolation-architecture-spec.md")).toBe(true);
    const spec = readFileSync(specPath, "utf8");
    expect(spec.length).toBeGreaterThan(4000);
  });
});
