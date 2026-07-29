import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const drill = resolve(repoRoot, "verification/pitr-drill/run_drill.py");
const receiptPath = resolve(repoRoot, "verification/pitr-drill/results/receipt.json");

describe("ARCHBP-045 disposable WAL/replication/PITR drill", () => {
  test("the real disposable drill is exposed as a release gate", () => {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
    expect(packageJson.scripts["verify:pitr-drill"]).toBe(
      "python3 verification/pitr-drill/run_drill.py",
    );
    expect(existsSync(drill)).toBe(true);
    expect(readFileSync(drill, "utf8")).toContain("Never touches a production cluster");
  });

  test("the recorded workload proves every PITR and reconstruction check", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.pitr-drill-receipt.v0");
    expect(Object.keys(receipt.checks)).toHaveLength(18);
    expect(Object.values(receipt.checks)).toEqual(expect.arrayContaining([true]));
    expect(Object.values(receipt.checks).every(Boolean)).toBe(true);
    expect(receipt.corpus_sha256).toEqual(expect.objectContaining({
      "empty.touch": expect.stringMatching(/^[0-9a-f]{64}$/),
      "logo.bin": expect.stringMatching(/^[0-9a-f]{64}$/),
      "src/alpha.rs": expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });
});
