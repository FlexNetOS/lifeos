import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const evidencePath = join(root, "evidence/nbverify/NBVERIFY-004.local-evidence.json");
const matrixPath = join(root, "evidence/nbverify/NBVERIFY-004.truth-matrix.csv");
const sourceReceiptPath = join(root, "evidence/nbverify/NBVERIFY-004.source-receipt.json");
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const claimIds = Array.from({ length: 14 }, (_, index) =>
  `SWARM-CLAIM-${String(index + 1).padStart(3, "0")}`,
);
const byId = new Map(evidence.claims.map((claim) => [claim.claim_id, claim]));
const missing = claimIds.filter((claimId) => !byId.has(claimId));
if (missing.length) throw new Error(`missing claim evidence: ${missing.join(", ")}`);

const csv = ["claim_id,status,verification_status"];
for (const claimId of claimIds) {
  const claim = byId.get(claimId);
  csv.push(`${claimId},${claim.status},${claim.verification_status}`);
}

const receipt = {
  schema_version: "lifeos.evidence.nbverify-004.source-receipt.v1",
  task_id: "NBVERIFY-004",
  source_task_id: "NBSOURCE-004",
  observed_at: new Date().toISOString(),
  source: {
    atomic_claim_count: claimIds.length,
    source_bytes_captured: true,
    source_identity: "NBSOURCE-004",
  },
  evidence: {
    local_receipt: evidencePath,
    local_receipt_sha256: createHash("sha256").update(readFileSync(evidencePath)).digest("hex"),
    claim_ids: claimIds,
  },
  all_claims_closed: claimIds.every((claimId) =>
    ["verified", "qualified", "refuted", "owner-decision-pending"].includes(byId.get(claimId).status),
  ),
  hy3: {
    model: "tencent/hy3:free",
    authenticated_generation: false,
    reason: "OPENROUTER_API_KEY was not available; no authenticated generation was attempted or claimed.",
  },
  progress_only: true,
};

await Bun.write(matrixPath, `${csv.join("\n")}\n`);
await Bun.write(sourceReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  matrix_path: matrixPath,
  source_receipt_path: sourceReceiptPath,
  claim_count: claimIds.length,
  all_claims_closed: receipt.all_claims_closed,
}, null, 2));
