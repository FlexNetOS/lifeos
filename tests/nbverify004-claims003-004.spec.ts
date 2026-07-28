import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const evidencePath = resolve(
  root,
  "evidence/nbverify/NBVERIFY-004.local-evidence.json",
);
const receiptPath = resolve(root, "evidence/engine-room/live-receipt.json");

describe("NBVERIFY-004 SWARM-CLAIM-003/004 evidence", () => {
  test("binds both claims to the installed Engine Room live trace", () => {
    expect(existsSync(evidencePath)).toBe(true);
    expect(existsSync(receiptPath)).toBe(true);

    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));

    for (const id of ["SWARM-CLAIM-003", "SWARM-CLAIM-004"]) {
      const claim = evidence.claims.find(
        (candidate: { claim_id: string }) => candidate.claim_id === id,
      );
      expect(claim).toEqual(
        expect.objectContaining({
          claim_id: id,
          verification_status: "verified",
          status: "verified",
        }),
      );
      expect(claim.evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            relationship: "installed-engine-room-live-trace",
            proven: true,
            session: receipt.session,
          }),
        ]),
      );
    }

    expect(receipt.ready).toBe(true);
    expect(receipt.argv).toEqual(["yzx", "enter", "--session", receipt.session]);
    expect(receipt.nushell_config).toContain("/yazelix/nu/env.nu");
    expect(receipt.process_tree).toEqual(
      expect.arrayContaining([
        expect.stringContaining("--new-session-with-layout"),
        expect.stringContaining("--env-config"),
      ]),
    );
  });
});
