import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receiptPath = resolve(import.meta.dirname, "../evidence/learning/live-lifecycle-receipt.json");
const rufloVersion = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
).devDependencies.ruflo;

describe("ARCHBP-009/013/014/015 durable learning-runtime receipt", () => {
  test("retains the complete passed live proof for learning, routing, Ruflo, and ATAS", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.learning-ruflo-atas-live.v1");
    expect(receipt.verdict).toBe("pass");
    expect(receipt.tasks).toEqual(["ARCHBP-009", "ARCHBP-013", "ARCHBP-014", "ARCHBP-015"]);
    expect(receipt.runtime.ruflo_installed_version).toBe(rufloVersion);
    expect(receipt.proofs.learning.promotion.promoted).toBe(true);
    expect(receipt.proofs.routing.replay.liveRoutesTaken).toBe(0);
    expect(receipt.proofs.coordination.primarySource.rufloInstalled).toBe(true);
    expect(receipt.proofs.forecast.promotion.selfPromoted).toBe(false);
  });
});
