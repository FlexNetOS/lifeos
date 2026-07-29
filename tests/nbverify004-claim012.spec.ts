import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const evidencePath = resolve(
  import.meta.dirname,
  "../evidence/nbverify/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-012 evidence", () => {
  test("records the live no-overlap authority and recovery boundary", () => {
    expect(existsSync(evidencePath)).toBe(true);
    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-012",
    );
    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("verified");
    expect(claim.status).toBe("verified");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "authority-search" }),
        expect.objectContaining({ relationship: "no-overlap-contract" }),
        expect.objectContaining({ relationship: "split-brain-recovery" }),
      ]),
    );
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "no-overlap-contract",
      ),
    ).toEqual(expect.objectContaining({ proven: true, canonical_writer: expect.any(String) }));
  });
});
