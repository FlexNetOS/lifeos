import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("ARCHBP-007 live OpenPencil durable Apply", () => {
  test("persists exact source bytes through the envctl-owned projection boundary", () => {
    const path = "evidence/postgres-ruvector/open-pencil-apply-live-receipt.json";
    expect(existsSync(path)).toBe(true);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.open-pencil-apply-live.v1");
    expect(receipt.applied).toBe(true);
    expect(receipt.idempotent).toBe(true);
    expect(receipt.ledger).toBe(true);
    expect(receipt.projection).toBe(true);
    expect(receipt.round_trip).toBe(true);
    expect(receipt.verified).toBe(true);
    expect(receipt.rejected_bad_digest).toBe(true);
    expect(receipt.rejected_bad_path).toBe(true);
    expect(receipt.source_byte_length).toBe(receipt.stored_byte_length);
    expect(receipt.object_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
