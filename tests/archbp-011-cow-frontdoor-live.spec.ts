import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const receiptPath = resolve(process.cwd(), "evidence/cow/frontdoor-live-receipt.json");

describe("ARCHBP-011 current S16 COW front door activation", () => {
  it("records the current branch binding and accepted v2 lifecycle", () => {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.status).toBe("passed");
    expect(receipt.execution).toContain("current-S16 PostgreSQL/RuVector front door");
    expect(receipt.verification.binding_report.bound_branch_count).toBeGreaterThan(0);
    expect(receipt.verification.capability.implemented).toBe(true);
    expect(receipt.verification.capability.rvf_roundtrip).toBe(true);
    expect(receipt.verification.proposal_isolation_before_merge.child_members).toBe(
      receipt.verification.proposal_isolation_before_merge.child_members_before_overlay + 1,
    );
    expect(receipt.verification.proposal_isolation_before_merge.root_members).toBe(
      receipt.verification.proposal_isolation_before_merge.root_members_before_overlay,
    );
    expect(receipt.verification.rollback_snapshot_valid).toBe(true);
  });
});
