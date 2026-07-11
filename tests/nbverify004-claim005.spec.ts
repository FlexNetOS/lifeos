import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const evidencePath = resolve(
  repoRoot,
  "planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-005 evidence", () => {
  test("records the automatic-agent-startup boundary without overclaiming", () => {
    expect(existsSync(evidencePath)).toBe(true);

    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-005",
    );

    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("unverified");
    expect(claim.status).toBe("qualified");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationship: "startup-orchestration",
          proven: false,
        }),
        expect.objectContaining({
          relationship: "agent-inventory",
          proven: false,
        }),
        expect.objectContaining({
          relationship: "authority-gate",
          proven: false,
        }),
        expect.objectContaining({
          relationship: "ordering-readiness",
          proven: false,
        }),
        expect.objectContaining({
          relationship: "failure-isolation",
          proven: false,
        }),
        expect.objectContaining({
          relationship: "shutdown-restart",
          proven: false,
        }),
        expect.objectContaining({
          relationship: "agent-process-search",
          proven: false,
        }),
      ]),
    );
    expect(claim.conclusion).toContain(
      "No automatic governed Ruvnet-agent startup is proven",
    );
  });
});
