import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const evidencePath = resolve(
  import.meta.dirname,
  "../planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-009 evidence", () => {
  test("keeps shared redb as an unresolved authority proposal", () => {
    expect(existsSync(evidencePath)).toBe(true);
    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-009",
    );
    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("unverified");
    expect(claim.status).toBe("owner-decision-pending");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "redb-implementation-search" }),
        expect.objectContaining({ relationship: "shared-redb-contract" }),
        expect.objectContaining({ relationship: "authority-decision" }),
      ]),
    );
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "shared-redb-contract",
      ),
    ).toEqual(expect.objectContaining({ proven: false }));
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "redb-implementation-search",
      ),
    ).toEqual(expect.objectContaining({ proven: false }));
  });
});
