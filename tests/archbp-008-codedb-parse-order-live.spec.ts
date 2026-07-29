import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receiptPath = resolve(import.meta.dirname, "../evidence/codedb/parse-order-live-receipt.json");

describe("ARCHBP-R08 CodeDB parse-order receipt", () => {
  test("retains all typed parsers and native-Nu bypass proof", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.codedb-parse-order-live.v1");
    expect(receipt.verdict).toBe("pass");
    expect(receipt.parser_order).toEqual(["from json --objects", "from json", "from nuon"]);
    expect(receipt.native_nu_bypass).toBe(true);
    expect(Object.keys(receipt.receipts)).toEqual([
      "from json --objects", "from json", "from nuon", "native",
    ]);
  });
});
