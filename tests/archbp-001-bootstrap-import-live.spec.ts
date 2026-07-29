import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const receiptPath = "evidence/postgres-ruvector/bootstrap-import-live-receipt.json";

describe("ARCHBP-001 bootstrap import authority", () => {
  test("records open and close sessions with verified raw backing", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.bootstrap-import-live.v1");
    expect(receipt.source_id).toBe("ARCHANCHOR-001");
    expect(receipt.zero_undeclared_loss).toBe(true);
    expect(receipt.raw_bytes_retained).toBe(true);
    expect(receipt.opened_session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(receipt.closed_session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(receipt.counts).toEqual({
      session_rows: 2,
      open_rows: 1,
      close_rows: 1,
      raw_backed_rows: 2,
      verified_raw_rows: 2,
      digest_rows: 2,
    });
  });
});
