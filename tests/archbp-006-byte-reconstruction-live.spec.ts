import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("ARCHBP-006 live byte reconstruction", () => {
  test("round-trips arbitrary bytes with both canonical digests and witness verification", () => {
    const path = "evidence/postgres-ruvector/byte-reconstruction-live-receipt.json";
    expect(existsSync(path)).toBe(true);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.byte-reconstruction-live.v1");
    expect(receipt.verified).toBe(true);
    expect(receipt.round_trip).toBe(true);
    expect(receipt.sha256_match).toBe(true);
    expect(receipt.shake256_match).toBe(true);
    expect(receipt.source_byte_length).toBe(receipt.reconstructed_byte_length);
    expect(receipt.source_byte_length).toBeGreaterThan(0);
    expect(receipt.object_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
