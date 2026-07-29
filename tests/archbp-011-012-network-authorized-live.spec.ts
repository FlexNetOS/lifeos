import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const receipt = JSON.parse(readFileSync(resolve("evidence/coordination/network-authorized-live-receipt.json"), "utf8"));

describe("ARCHBP-011/012 authorized network coordination live receipt", () => {
  test("records a database-authorized execution and canonical effect", () => {
    expect(receipt.schema_version).toBe("lifeos.evidence.network-coordination-authorized-live.v2");
    expect(["authorized-production-live-pass", "authorized-production-live-attempt-host-privilege-gate"]).toContain(receipt.verdict);
    expect(receipt.operation).toBe("netctl link set --apply lo up");
    expect(receipt.execution.task_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(receipt.execution.lease_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(receipt.execution.plan_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(receipt.execution.effect_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof receipt.execution.effect.exit_code).toBe("number");
    expect(receipt.lifecycle).toContain("task closed");
    if (receipt.verdict === "authorized-production-live-attempt-host-privilege-gate") {
      expect(receipt.execution.effect.exit_code).not.toBe(0);
      expect(receipt.execution.effect.effect.stderr).toMatch(/Operation not permitted|root/);
    }
  });
});
