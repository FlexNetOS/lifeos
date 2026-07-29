import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receiptPath = resolve(import.meta.dirname, "../evidence/glass/live-readiness-receipt.json");

describe("ARCHBP-001/002 live Glass readiness", () => {
  test("records a checksum-verified owner projection after the Tauri shell mounted", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.glass-ui-live.v1");
    expect(receipt.authority).toBe("authenticated redb owner projection");
    expect(receipt.projection.checksum_verified).toBe(true);
    expect(receipt.projection.local_seq).toBeGreaterThan(0);
    expect(receipt.readiness).toEqual(expect.objectContaining({
      schemaVersion: "lifeos.glass-ui-ready.v1",
      state: "ready",
      identity: "lifeos-glass",
    }));
    expect(receipt.fresh).toBe(true);
  });
});
