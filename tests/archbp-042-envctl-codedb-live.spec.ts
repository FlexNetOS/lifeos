import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const receiptPath = "evidence/envctl-codedb/live-committer-receipt.json";

describe("ARCHBP-042 envctl-only CodeDB commit boundary", () => {
  test("records live CodeDB ingress, envctl commit, and return projection evidence", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.envctl-codedb-live.v1");
    expect(receipt.authority_invariants).toEqual(expect.arrayContaining([5, 7, 10, 12, 14]));
    expect(receipt.code_db.revision).toBe("5ec4242c656d019ea9dd583c1c78f1d5d48b4e7f");
    expect(receipt.code_db.worktree).toBe("clean");
    expect(receipt.code_db.path).toBe("rtk_nu → CodeDB → redb");
    expect(receipt.envctl.revision).toBe("47929f609aa1bbbcb7e5618eb4126e49ca356429");
    expect(receipt.envctl.worktree).toBe("clean");
    expect(receipt.envctl.committer_role).toBe("lifeos_envctl");
    expect(receipt.envctl.tests).toHaveLength(4);
    expect(receipt.envctl.tests.every((test) => test.status === "passed")).toBe(true);
    expect(receipt.boundary).toMatchObject({
      durable_committer: "envctl",
      staging: "codedb_outbox_export",
      postgres_role: "canonical durable authority",
      non_envctl_write_denied: true,
    });
    expect(receipt.code_db.verification_output_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.envctl.verification_output_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
