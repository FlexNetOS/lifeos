import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const generatedRoot = resolve(
  repoRoot,
  "planning-spine-v0/generated/notebooklm_claim_verification",
);
const matrixPath = resolve(generatedRoot, "NBVERIFY-004.truth-matrix.csv");
const sourceReceiptPath = resolve(
  generatedRoot,
  "NBVERIFY-004.source-receipt.json",
);

describe("NBVERIFY-004 progress artifacts", () => {
  test("records the strict fourteen-claim queue without closing unverified work", () => {
    expect(existsSync(matrixPath)).toBe(true);
    expect(existsSync(sourceReceiptPath)).toBe(true);

    const matrix = readFileSync(matrixPath, "utf8").trim().split("\n");
    expect(matrix).toHaveLength(15);
    expect(matrix[0]).toContain("claim_id");

    const rows = new Map(
      matrix.slice(1).map((row) => [row.split(",")[0].replaceAll('"', ""), row]),
    );
    for (let index = 1; index <= 14; index += 1) {
      expect(rows.has(`SWARM-CLAIM-${String(index).padStart(3, "0")}`)).toBe(
        true,
      );
    }
    expect(rows.get("SWARM-CLAIM-001")).toContain("partial");
    expect(rows.get("SWARM-CLAIM-002")).toContain("partial");
    expect(rows.get("SWARM-CLAIM-003")).toContain("qualified");
    expect(rows.get("SWARM-CLAIM-004")).toContain("qualified");
    expect(rows.get("SWARM-CLAIM-005")).toContain("queued");

    const receipt = JSON.parse(readFileSync(sourceReceiptPath, "utf8"));
    expect(receipt.task_id).toBe("NBVERIFY-004");
    expect(receipt.source_task_id).toBe("NBSOURCE-004");
    expect(receipt.atomic_claim_count).toBeUndefined();
    expect(receipt.source.atomic_claim_count).toBe(14);
    expect(receipt.all_claims_closed).toBe(false);
    expect(receipt.hy3.model).toBe("tencent/hy3:free");
    expect(receipt.hy3.authenticated_generation).toBe(false);
    expect(receipt.hy3.reason).toContain("OPENROUTER_API_KEY");
  });
});
