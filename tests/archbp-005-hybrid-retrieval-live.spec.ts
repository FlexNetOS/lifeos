import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("ARCHBP-005 live hybrid retrieval", () => {
  test("persists lexical and dense inputs with reconstructable fused results", () => {
    const path = "evidence/postgres-ruvector/hybrid-retrieval-live-receipt.json";
    expect(existsSync(path)).toBe(true);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.hybrid-retrieval-live.v1");
    expect(receipt.returned).toBe(true);
    expect(receipt.lexical_present).toBe(true);
    expect(receipt.dense_present).toBe(true);
    expect(receipt.fused_positive).toBe(true);
    expect(receipt.ledger_query).toBe(true);
    expect(receipt.ledger_results).toBeGreaterThan(0);
    expect(receipt.lexical_direct).toBeGreaterThan(0);
    expect(receipt.query_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
