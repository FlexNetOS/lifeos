import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const evidencePath = resolve(
  import.meta.dirname,
  "../evidence/nbverify/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-011 evidence", () => {
  test("records the mounted event-to-render benchmark", () => {
    expect(existsSync(evidencePath)).toBe(true);
    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-011",
    );
    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("verified");
    expect(claim.status).toBe("verified");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "performance-benchmark-runtime", proven: true }),
        expect.objectContaining({ relationship: "workload-and-slo", proven: true }),
        expect.objectContaining({ relationship: "benchmark-result", proven: true }),
      ]),
    );
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "benchmark-result",
      ),
    ).toEqual(expect.objectContaining({ proven: true }));
  });
});
