import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const evidencePath = resolve(
  repoRoot,
  "evidence/nbverify/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-005 evidence", () => {
  test("records the live governed-agent startup boundary", () => {
    expect(existsSync(evidencePath)).toBe(true);

    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-005",
    );

    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("verified");
    expect(claim.status).toBe("verified");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relationship: "startup-orchestration",
          proven: true,
        }),
        expect.objectContaining({
          relationship: "agent-inventory",
          proven: true,
        }),
        expect.objectContaining({
          relationship: "authority-gate",
          proven: true,
        }),
        expect.objectContaining({
          relationship: "ordering-readiness",
          proven: true,
        }),
        expect.objectContaining({
          relationship: "failure-isolation",
          proven: true,
        }),
        expect.objectContaining({
          relationship: "shutdown-restart",
          proven: true,
        }),
        expect.objectContaining({
          relationship: "agent-process-search",
          proven: true,
        }),
      ]),
    );
    expect(claim.conclusion).toContain("Boot reattach now health-gates");
  });
});
