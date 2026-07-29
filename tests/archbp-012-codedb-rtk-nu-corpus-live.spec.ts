import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receiptPath = resolve(import.meta.dirname, "../evidence/codedb/rtk-nu-corpus-live-receipt.json");

describe("ARCHBP-R12 CodeDB rtk_nu byte corpus", () => {
  test("retains binary, failure, signal, partial-line, and interleaved streams", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.codedb-rtk-nu-corpus-live.v1");
    expect(receipt.verdict).toBe("pass");
    expect(receipt.protected_checkout_mutated).toBe(false);
    expect(receipt.corpus).toEqual([
      "binary-failure-partial",
      "signal",
      "interleaved",
      "success-partial",
    ]);
    for (const name of receipt.corpus) {
      expect(receipt.cases[name].frame_count, name).toBeGreaterThan(0);
      expect(receipt.cases[name].raw_bytes, name).toBeGreaterThan(0);
      expect(receipt.cases[name].raw_object_ids.length, name).toBe(receipt.cases[name].streams.length);
    }
  });
});
