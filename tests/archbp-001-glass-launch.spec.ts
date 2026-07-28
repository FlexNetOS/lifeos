import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receiptPath = resolve(import.meta.dirname, "../evidence/glass/live-launch-receipt.json");

describe("ARCHBP-001/002 causal Glass launch", () => {
  test("records Tauri launch, mounted receipt, and graceful shutdown", () => {
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.schema_version).toBe("lifeos.evidence.glass-launch-live.v1");
    expect(receipt.authority).toContain("Tauri process");
    expect(receipt.launch.pid).toBeGreaterThan(0);
    expect(receipt.launch.process_tree.length).toBeGreaterThan(0);
    expect(receipt.readiness).toEqual(expect.objectContaining({ schemaVersion: "lifeos.glass-ui-ready.v1", identity: "lifeos-glass" }));
    expect(receipt.shutdown.signal).toBe("SIGTERM");
    expect(receipt.ok).toBe(true);
  });
});
