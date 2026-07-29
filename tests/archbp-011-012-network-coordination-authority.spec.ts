import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receiptPath = resolve(import.meta.dirname, "../evidence/coordination/network-authority-live-receipt.json");

describe("ARCHBP-011/012 network and coordination authority receipt", () => {
  test("retains exact source, database, dry-run, and fail-closed evidence", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.network-coordination-authority-live.v1");
    expect(receipt.verdict).toBe("pass-with-authorized-apply-release-gate");
    expect(receipt.database.migration_count).toBe(93);
    expect(receipt.database.latest_migration).toBe(104);
    expect(receipt.database.procedure_count).toBe(9);
    expect(receipt.network.dry_run.result).toBe("planned");
    expect(receipt.network.unauthorized_submission_rejected).toBe(true);
    expect(Object.values(receipt.components).every((component) => component.clean)).toBe(true);
  });
});
