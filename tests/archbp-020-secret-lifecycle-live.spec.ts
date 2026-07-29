import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const receiptPath = "evidence/secrets/live-lifecycle-receipt.json";

describe("ARCHBP-020 six-part secret lifecycle", () => {
  test("records a live transaction for seed, mint, broker, relay, rotation, and revocation", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.secret-lifecycle-live.v1");
    expect(receipt.authority_invariants).toEqual(expect.arrayContaining([8, 10, 12, 14]));
    expect(receipt.database.transaction).toBe("rolled back after successful lifecycle");
    expect(receipt.stages).toHaveLength(7);
    expect(receipt.plaintext_exposed).toBe(false);
    expect(receipt.output_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
