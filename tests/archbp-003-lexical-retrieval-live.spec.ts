import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("ARCHBP-003 live lexical retrieval", () => {
  test("records a tenant-scoped byte-linked retrieval result", () => {
    const path = "evidence/postgres-ruvector/lexical-retrieval-live-receipt.json";
    expect(existsSync(path)).toBe(true);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.lexical-retrieval-live.v1");
    expect(receipt.tenant_scoped).toBe(true);
    expect(receipt.byte_linked).toBe(true);
    expect(receipt.generation_reconstructable).toBe(true);
    expect(receipt.deterministic_rank).toBe(true);
    expect(receipt.source_object_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
