import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const evidencePath = resolve(
  repoRoot,
  "planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-002 evidence", () => {
  test("has a bounded installed-runtime workspace receipt", () => {
    expect(existsSync(evidencePath)).toBe(true);

    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-002",
    );

    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("unverified");
    expect(claim.status).toBe("partial");
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "profile-owner",
      ),
    ).toEqual(expect.objectContaining({ proven: true }));
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "workspace-responsibility",
      ),
    ).toEqual(expect.objectContaining({ proven: true }));
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "profile-owner" }),
        expect.objectContaining({ relationship: "launcher-code" }),
        expect.objectContaining({ relationship: "process-tree" }),
        expect.objectContaining({ relationship: "environment-allowlist" }),
        expect.objectContaining({ relationship: "workspace-responsibility" }),
        expect.objectContaining({ relationship: "lifeos-binding" }),
      ]),
    );

    const lifeosBinding = claim.evidence.find(
      (candidate: { relationship: string }) =>
        candidate.relationship === "lifeos-binding",
    );
    expect(lifeosBinding).toEqual(
      expect.objectContaining({
        proven: false,
        missing: expect.arrayContaining([
          "lifeos_process_receipt_missing",
          "lifeos_ui_acceptance_receipt_missing",
          "lifeos_bridge_contract_missing",
        ]),
      }),
    );
  });
});
