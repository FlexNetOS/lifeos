import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const receiptPath = "evidence/postgres-ruvector/live-authority-receipt.json";

describe("ARCHBP-001/002 PostgreSQL and RuVector authority", () => {
  test("records a live canonical database authority receipt", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.postgres-ruvector-live.v1");
    expect(receipt.authority_invariants).toEqual(expect.arrayContaining([1, 2, 7, 13]));
    expect(receipt.server_version).toBe("17.10");
    expect(receipt.ruvector).toEqual({ schema: "extensions", version: "0.3.1" });
    expect(receipt.migrations.count).toBe(42);
    expect(receipt.migrations.versions).toEqual(expect.arrayContaining([1, 28, 40, 49, 50, 51, 52, 53]));
    expect(receipt.required_schemas).toEqual([true, true, true, true, true]);
    expect(receipt.connection.password_recorded).toBe(false);
    expect(receipt.verification_output_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
