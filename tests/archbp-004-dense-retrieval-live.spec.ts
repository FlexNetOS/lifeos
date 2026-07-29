import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("ARCHBP-004 live dense retrieval", () => {
  test("records an indexed dimension-specific projection result", () => {
    const path = "evidence/postgres-ruvector/dense-retrieval-live-receipt.json";
    expect(existsSync(path)).toBe(true);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.dense-retrieval-live.v1");
    expect(receipt.dimension).toBe(384);
    expect(receipt.projection_populated).toBe(true);
    expect(receipt.byte_linked).toBe(true);
    expect(receipt.generation_reconstructable).toBe(true);
    expect(receipt.rank_positive).toBe(true);
    expect(receipt.source_object_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
