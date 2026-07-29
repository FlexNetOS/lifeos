import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receiptPath = resolve("evidence/release/live-promotion-receipt.json");

describe("ARCHBP-018 live release promotion boundary", () => {
  test("records all eleven witnessed database release gates", () => {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.release-promotion-live.v1");
    expect(receipt.verdict).toBe("release-promotion-live-pass");
    expect(receipt.verification_count).toBe(11);
    expect(receipt.gates).toEqual([
      "build", "test", "byte-reconstruction", "retrieval", "graph-causal",
      "security", "model", "forecast", "witness", "runner-receipt", "rollback",
    ]);
    expect(receipt.manifest_verified).toBe(true);
    expect(receipt.closure_verified).toBe(true);
    expect(receipt.rollback_verified).toBe(true);
    expect(receipt.outbox_present).toBe(true);
  });
});
