import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const evidencePath = resolve(
  import.meta.dirname,
  "../planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-010 evidence", () => {
  test("does not confuse mock agent-team UI with a live swarm projection", () => {
    expect(existsSync(evidencePath)).toBe(true);
    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-010",
    );
    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("unverified");
    expect(claim.status).toBe("partial");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "ui-status-search" }),
        expect.objectContaining({ relationship: "canonical-status-flow" }),
        expect.objectContaining({ relationship: "stale-unavailable-states" }),
      ]),
    );
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "canonical-status-flow",
      ),
    ).toEqual(expect.objectContaining({ proven: false }));
  });
});
