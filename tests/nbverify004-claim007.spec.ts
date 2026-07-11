import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const evidencePath = resolve(
  import.meta.dirname,
  "../planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-007 evidence", () => {
  test("separates RVF proof artifacts from per-agent RVF ownership", () => {
    expect(existsSync(evidencePath)).toBe(true);
    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-007",
    );
    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("unverified");
    expect(claim.status).toBe("qualified");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "rvf-runtime-proof" }),
        expect.objectContaining({ relationship: "agent-rvf-boundary" }),
        expect.objectContaining({ relationship: "per-agent-loading-contract" }),
      ]),
    );
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "per-agent-loading-contract",
      ),
    ).toEqual(expect.objectContaining({ proven: false }));
  });
});
