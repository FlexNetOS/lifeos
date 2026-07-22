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
  DURABLE_AUTHORITY,
  hasDbGitExecution,
  governMerge,
  buildReceipt,
  DatabaseCoordinator,
} from "../scripts/db-coordinator-lifecycle.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/db-coordinator-lifecycle.mjs");

const policy = () => ({ maxMerges: 2, leaseTtlMs: 1000 });

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process).
// ---------------------------------------------------------------------------
describe("ARCHBP-046 PostgreSQL/RuVector is the durable authority, not a Git executor", () => {
  test("declares the durable coordinator and does not replace physical Git execution", () => {
    expect(DURABLE_AUTHORITY).toBe("postgresql+ruvector");
    expect(hasDbGitExecution()).toBe(false);
  });
});

describe("ARCHBP-046 governed multi-merge", () => {
  test("denies monorepo fusion, unapproved merges, and over-budget merges", () => {
    // same-repo, approved, within budget -> allowed
    expect(governMerge({ sourceRepo: "r1", targetRepo: "r1", approvedBy: "owner" }, policy(), 0).allowed).toBe(true);
    // monorepo fusion (cross-repo merge) -> denied
    const fusion = governMerge({ sourceRepo: "r1", targetRepo: "r2", approvedBy: "owner" }, policy(), 0);
    expect(fusion.allowed).toBe(false);
    expect(fusion.reason).toContain("fusion");
    // unapproved -> denied
    expect(governMerge({ sourceRepo: "r1", targetRepo: "r1", approvedBy: null }, policy(), 0).allowed).toBe(false);
    // over budget -> denied
    expect(governMerge({ sourceRepo: "r1", targetRepo: "r1", approvedBy: "owner" }, policy(), 2).allowed).toBe(false);
  });
});

describe("ARCHBP-046 receipts require raw logs", () => {
  test("captures exact inputs/intermediates/outputs/conflicts/errors and fails closed without raw logs", () => {
    const r = buildReceipt({
      jobId: "J1",
      inputs: ["in"],
      intermediates: ["mid"],
      outputs: ["out"],
      conflicts: [],
      errors: [],
      rawLogs: ["log-line"],
    });
    expect(r.inputs).toEqual(["in"]);
    expect(r.outputs).toEqual(["out"]);
    expect(Array.isArray(r.conflicts)).toBe(true);
    expect(() => buildReceipt({ jobId: "J1", inputs: [], intermediates: [], outputs: [], conflicts: [], errors: [], rawLogs: [] })).toThrow();
  });
});

describe("ARCHBP-046 database-issued JobSpec and exclusive lease", () => {
  test("issues a JobSpec with identity/task/branch/lease/policy and enforces an exclusive lease", () => {
    const c = new DatabaseCoordinator();
    const spec = c.issueJobSpec({ taskId: "T1", repo: "r1", branch: "b1", holder: "agent-a", policy: policy() });
    expect(typeof spec.jobId).toBe("string");
    expect(spec.taskId).toBe("T1");
    expect(spec.branch).toBe("b1");
    expect(spec.authority).toBe("postgresql+ruvector");

    // exclusive lease: A acquires, B is denied while A holds
    expect(c.acquireLease(spec.jobId, "agent-a", 0).granted).toBe(true);
    const denied = c.acquireLease(spec.jobId, "agent-b", 10);
    expect(denied.granted).toBe(false);
    expect(denied.reason).toContain("lease");
  });
});

// ---------------------------------------------------------------------------
// Live proof (subprocess).
// ---------------------------------------------------------------------------
describe("ARCHBP-046 database-coordinator proof", () => {
  test("proves DB-issued specs, exclusive leases, governed merge, receipts, and physical-Git boundary", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp046-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(r.durableAuthority).toBe("postgresql+ruvector");
      expect(r.dbReplacesGit).toBe(false);
      expect(r.jobSpec.hasAllFields).toBe(true);
      expect(r.lease.exclusive).toBe(true);
      expect(r.merge.fusionDenied).toBe(true);
      expect(r.merge.unapprovedDenied).toBe(true);
      expect(r.merge.approvedAllowed).toBe(true);
      expect(r.merge.overBudgetDenied).toBe(true);
      expect(r.receipt.complete).toBe(true);
      expect(r.receipt.missingLogsFailsClosed).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 120000);
});
