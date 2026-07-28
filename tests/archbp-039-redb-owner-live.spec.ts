import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const receiptPath = "evidence/redb/owner-live-receipt.json";

describe("ARCHBP-039 supervised redb owner live receipt", () => {
  test("records the current owner revision and every required live boundary", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.redb-owner-live.v1");
    expect(receipt.source.owner_revision).toBe(
      "c49af6e5a9301296d9ff0133c04acd987363155f",
    );
    expect(receipt.source.owner_worktree).toBe("clean");
    expect(receipt.tests).toHaveLength(2);
    expect(receipt.tests.every((test) => test.status === "passed")).toBe(true);
    expect(receipt.proven).toEqual(
      expect.arrayContaining([
        "authenticated OwnerClient mutation and token rejection",
        "monotonic local sequence and checksummed read-only projection",
        "ordered projection events",
        "crash-after-commit replay on owner restart",
      ]),
    );
    expect(receipt.output_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
