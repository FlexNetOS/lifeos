import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const evidencePath = resolve(
  import.meta.dirname,
  "../evidence/nbverify/NBVERIFY-004.local-evidence.json",
);

describe("NBVERIFY-004 SWARM-CLAIM-006 evidence", () => {
  test("records live native RuvLLM usage by the Ruflo coordinator", () => {
    expect(existsSync(evidencePath)).toBe(true);
    const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
    const claim = receipt.claims.find(
      (candidate: { claim_id: string }) =>
        candidate.claim_id === "SWARM-CLAIM-006",
    );
    expect(claim).toBeDefined();
    expect(claim.verification_status).toBe("verified");
    expect(claim.status).toBe("verified");
    expect(claim.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: "ruvllm-package" }),
        expect.objectContaining({ relationship: "native-capability" }),
        expect.objectContaining({ relationship: "static-engine-boundary", proven: true }),
        expect.objectContaining({ relationship: "automatic-agent-usage", proven: true }),
      ]),
    );
    expect(
      claim.evidence.find(
        (candidate: { relationship: string }) =>
          candidate.relationship === "static-engine-boundary",
      ),
    ).toEqual(expect.objectContaining({ proven: true }));
  });
});
