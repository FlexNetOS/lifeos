import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--output="),
);
const outputPath = outputArgument
  ? resolve(root, outputArgument.slice("--output=".length))
  : join(
      root,
      "planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
    );
const extractPath = join(
  root,
  "planning-spine-v0/generated/notebooklm_source_extracts/NBSOURCE-004-lifeos-ruvnet-swarm.md",
);
const proofPath = join(root, "planning-spine-v0/proof_records/NBSOURCE-004.proof.json");
const text = readFileSync(extractPath, "utf8");
const proof = JSON.parse(readFileSync(proofPath, "utf8"));
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-014",
  verification_status: "qualified",
  status: "qualified",
  conclusion:
    "The indexed source's citation-absence condition is verified: markers [1] through [3] have no recoverable bibliography, document identity, or exact passage. No citation target is inferred, so the technical assertions remain unverified.",
  evidence: [
    {
      relationship: "citation-absence",
      proven:
        text.includes("[1]") &&
        text.includes("[3]") &&
        /\[1\].*\[3\]/s.test(text) &&
        /no bibliography|no exact source/i.test(text),
      source_path: extractPath,
      source_id: "72e22d9c-72c9-4389-8358-700bb46b55b6",
      extract_sha256: hash(extractPath),
      source_fulltext_sha256: proof.checksums?.notebooklm_fulltext_sha256 ?? null,
    },
    {
      relationship: "citation-targets",
      proven: false,
      targets: [],
      missing: ["document-identities", "immutable-versions", "exact-supporting-passages"],
      note: "No citation target was inferred from repeated source wording or neighboring sources.",
    },
    {
      relationship: "technical-claim-impact",
      proven: false,
      affected_claims: [
        "SWARM-CLAIM-001",
        "SWARM-CLAIM-002",
        "SWARM-CLAIM-003",
        "SWARM-CLAIM-004",
        "SWARM-CLAIM-005",
        "SWARM-CLAIM-006",
        "SWARM-CLAIM-007",
        "SWARM-CLAIM-008",
        "SWARM-CLAIM-009",
        "SWARM-CLAIM-010",
        "SWARM-CLAIM-011",
        "SWARM-CLAIM-012",
        "SWARM-CLAIM-013",
      ],
      note: "Citation absence closes provenance availability only; it verifies no technical behavior.",
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-014",
);
const packagePath = join(root, "package.json");
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: { root, package_json_sha256: hash(packagePath) },
  claims: [...retained, claim],
  collector: {
    claim_id: "SWARM-CLAIM-014",
    mode: "read-only-citation-provenance-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, citation_absence_proven: claim.evidence[0].proven, citation_targets: 0 }, null, 2));
