import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const evidencePath = resolve(
  repoRoot,
  "evidence/nbverify/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-001 evidence", () => {
  test("has a bounded evidence receipt for every required launch scope", () => {
    expect(existsSync(evidencePath)).toBe(true);

    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-001",
    );

    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("unverified");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "portable-artifact-identity" }),
        expect.objectContaining({ relationship: "profile-frontdoor" }),
        expect.objectContaining({ relationship: "launcher-target" }),
        expect.objectContaining({ relationship: "process-tree" }),
        expect.objectContaining({ relationship: "ui-readiness" }),
      ]),
    );
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "portable-artifact-identity",
      ),
    ).toEqual(expect.objectContaining({ proven: true }));
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "ui-readiness",
      ),
    ).toEqual(expect.objectContaining({ proven: true }));
  });
});
