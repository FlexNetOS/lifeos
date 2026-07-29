import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receiptPath = resolve(import.meta.dirname, "../evidence/benchmarks/redb_owner_latency.json");

describe("live redb owner latency receipt", () => {
  test("records raw commit-to-projection/event samples without claiming render latency", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schemaVersion).toBe("lifeos.redb-owner-latency.v1");
    expect(receipt.sampleCount).toBe(100);
    expect(receipt.samplesMs).toHaveLength(100);
    expect(receipt.p50Ms).toBeGreaterThan(0);
    expect(receipt.p95Ms).toBeGreaterThanOrEqual(receipt.p50Ms);
    expect(receipt.p99Ms).toBeGreaterThanOrEqual(receipt.p95Ms);
    expect(receipt.renderLeg).toMatch(/separate acceptance/i);
  });
});
