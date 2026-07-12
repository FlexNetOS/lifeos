import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const generatedRoot = join(
  repoRoot,
  "planning-spine-v0",
  "generated",
  "notebooklm_claim_verification",
);
const evidencePath = join(generatedRoot, "NBVERIFY-004.local-evidence.json");
const claimsPath = join(
  repoRoot,
  "planning-spine-v0",
  "generated",
  "notebooklm_source_claims.source.csv",
);
const sourceExtractPath = join(
  repoRoot,
  "planning-spine-v0",
  "generated",
  "notebooklm_source_extracts",
  "NBSOURCE-004-lifeos-ruvnet-swarm.md",
);
const sourceProofPath = join(
  repoRoot,
  "planning-spine-v0",
  "proof_records",
  "NBSOURCE-004.proof.json",
);
const matrixPath = join(generatedRoot, "NBVERIFY-004.truth-matrix.csv");
const receiptPath = join(generatedRoot, "NBVERIFY-004.source-receipt.json");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function csvEscape(value) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return `"${normalized.replaceAll('"', '""')}"`;
}

const claimRows = readFileSync(claimsPath, "utf8")
  .trim()
  .split("\n")
  .map(parseCsvLine)
  .filter((row) => row[0] === "NBSOURCE-004");
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const evidenceByClaim = new Map(
  evidence.claims.map((claim) => [claim.claim_id, claim]),
);
const claimIds = Array.from({ length: 14 }, (_, index) =>
  `SWARM-CLAIM-${String(index + 1).padStart(3, "0")}`,
);

const matrixRows = [
  [
    "claim_id",
    "classification",
    "claim_text",
    "truth_status",
    "verification_status",
    "evidence_relationships",
    "gap_or_conclusion",
  ].map(csvEscape).join(","),
];
for (const claimId of claimIds) {
  const source = claimRows.find((row) => row[3] === claimId);
  const claim = evidenceByClaim.get(claimId);
  const relationships = claim
    ? claim.evidence.map((item) => item.relationship).join("|")
    : "";
  matrixRows.push(
    [
      claimId,
      source?.[2] ?? "unknown",
      source?.[4] ?? "",
      claim?.status ?? "queued",
      claim?.verification_status ?? "unverified",
      relationships,
      claim?.conclusion ??
        "No claim-scoped local evidence receipt yet; process in strict queue order.",
    ]
      .map(csvEscape)
      .join(","),
  );
}

const proofRecord = JSON.parse(readFileSync(sourceProofPath, "utf8"));
const closedStatuses = new Set([
  "verified",
  "qualified",
  "refuted",
  "owner-decision-pending",
]);
const unresolved = claimIds.filter(
  (claimId) => !closedStatuses.has(evidenceByClaim.get(claimId)?.status),
);
const receipt = {
  schema_version: "lifeos.notebooklm.nbverify-004.source-receipt.v1",
  task_id: "NBVERIFY-004",
  source_task_id: "NBSOURCE-004",
  observed_at: new Date().toISOString(),
  source: {
    claim_table: claimsPath,
    claim_table_sha256: sha256(claimsPath),
    structured_extract: sourceExtractPath,
    structured_extract_sha256: sha256(sourceExtractPath),
    source_proof_record: sourceProofPath,
    notebooklm_fulltext_sha256:
      proofRecord.checksums?.notebooklm_fulltext_sha256 ?? null,
    atomic_claim_count: claimIds.length,
  },
  evidence: {
    local_receipt: evidencePath,
    local_receipt_sha256: sha256(evidencePath),
    observed_claim_ids: claimIds.filter((claimId) =>
      evidenceByClaim.has(claimId),
    ),
    queued_claim_ids: claimIds.filter(
      (claimId) => !evidenceByClaim.has(claimId),
    ),
  },
  hy3: {
    model: "tencent/hy3:free",
    authenticated_generation: false,
    openrouter_api_key_present: false,
    reason:
      "OPENROUTER_API_KEY was not available; no authenticated OpenRouter generation was attempted or claimed.",
    issue_to_send_if_credentialed:
      "Research the conflict between source assertions and installed LifeOS/Yazelix evidence, preserving profile ownership, claim boundaries, and unresolved citations.",
  },
  all_claims_closed: unresolved.length === 0,
  unresolved_claim_ids: unresolved,
  matrix_path: matrixPath,
  progress_only: true,
  completion_gate:
    "Do not create NBVERIFY-004 proof or mark the task complete until every claim has exactly one bounded verdict and planning-spine verification passes.",
};

await Bun.write(matrixPath, `${matrixRows.join("\n")}\n`);
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      matrix_path: matrixPath,
      source_receipt_path: receiptPath,
      observed_claim_count: receipt.evidence.observed_claim_ids.length,
      queued_claim_count: receipt.evidence.queued_claim_ids.length,
      all_claims_closed: receipt.all_claims_closed,
      hy3_authenticated_generation: receipt.hy3.authenticated_generation,
    },
    null,
    2,
  ),
);
