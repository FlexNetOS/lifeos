import { readFileSync } from "node:fs";
import { join } from "node:path";

const evidencePath = join(
  process.cwd(),
  "evidence/nbverify/NBVERIFY-004.local-evidence.json",
);
const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
const claim = receipt.claims.find((candidate) => candidate.claim_id === "SWARM-CLAIM-014");
if (!claim) throw new Error("SWARM-CLAIM-014 evidence is missing");
if (claim.status !== "qualified" || claim.verification_status !== "qualified") {
  throw new Error("SWARM-CLAIM-014 must remain qualified until citation targets exist");
}
const absence = claim.evidence.find((item) => item.relationship === "citation-absence");
const targets = claim.evidence.find((item) => item.relationship === "citation-targets");
if (!absence?.proven || targets?.proven !== false || targets.targets?.length !== 0) {
  throw new Error("citation provenance boundary is not represented honestly");
}
console.log(JSON.stringify({
  claim_id: claim.claim_id,
  status: claim.status,
  citation_absence_proven: true,
  citation_targets: [],
  source: evidencePath,
}, null, 2));
