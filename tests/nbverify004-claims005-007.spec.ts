import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const evidencePath = resolve(
  import.meta.dirname,
  "../planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-005 through 007 evidence", () => {
  test("keeps startup, static-engine, and RVF claims bounded", () => {
    expect(existsSync(evidencePath)).toBe(true);
    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claims = new Map(
      receipt.claims.map((claim: { claim_id: string }) => [
        claim.claim_id,
        claim,
      ]),
    );

    for (const claimId of [
      "SWARM-CLAIM-005",
      "SWARM-CLAIM-006",
      "SWARM-CLAIM-007",
    ]) {
      expect(claims.has(claimId)).toBe(true);
      expect(claims.get(claimId).verification_status).toBe("unverified");
      expect(claims.get(claimId).evidence.length).toBeGreaterThan(0);
    }

    expect(claims.get("SWARM-CLAIM-005").evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "startup-orchestration" }),
        expect.objectContaining({ relationship: "agent-process-search" }),
      ]),
    );
    expect(claims.get("SWARM-CLAIM-006").evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "ruvllm-package" }),
        expect.objectContaining({ relationship: "static-engine-boundary" }),
      ]),
    );
    expect(claims.get("SWARM-CLAIM-007").evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "rvf-runtime-proof" }),
        expect.objectContaining({ relationship: "agent-rvf-boundary" }),
      ]),
    );
  });
});
