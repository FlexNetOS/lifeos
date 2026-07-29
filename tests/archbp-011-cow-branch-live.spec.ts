import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const receiptPath = resolve(process.cwd(), "evidence/cow/live-branch-receipt.json");

describe("ARCHBP-011 live COW branch activation", () => {
  it("records real database/RuVector branch, overlay, RVF, promotion, and rollback evidence", () => {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.status).toBe("passed");
    expect(receipt.execution).toContain("real PostgreSQL/RuVector");
    expect(receipt.verification.capability.implemented).toBe(true);
    expect(receipt.verification.capability.rvf_roundtrip).toBe(true);
    expect(receipt.verification.capability.runtime_digest_binding).toBe(true);
    expect(receipt.verification.proposal_isolation_before_merge).toEqual({
      child_members: 1,
      root_members: 0,
    });
    expect(receipt.verification.rollback_snapshot_valid).toBe(true);
    expect(receipt.verification.branch_overlay_count).toBeGreaterThanOrEqual(2);
    expect(receipt.verification.rvf_container_count).toBeGreaterThanOrEqual(2);
  });
});
