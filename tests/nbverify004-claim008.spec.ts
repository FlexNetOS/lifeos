import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const evidencePath = resolve(
  repoRoot,
  "planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-008 evidence", () => {
  test("keeps the UDS proposal fail-closed without an owner decision", () => {
    expect(existsSync(evidencePath)).toBe(true);

    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-008",
    );

    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("unverified");
    expect(claim.status).toBe("owner-decision-pending");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationship: "uds-implementation-search",
          proven: false,
        }),
        expect.objectContaining({
          relationship: "uds-contract",
          proven: false,
        }),
        expect.objectContaining({
          relationship: "owner-decision",
          proven: false,
        }),
      ]),
    );
  });
});
