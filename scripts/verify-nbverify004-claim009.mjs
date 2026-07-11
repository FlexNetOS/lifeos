import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
function run(command, args) {
  try {
    return { command: [command, ...args].join(" "), exit_status: 0, output: execFileSync(command, args, { encoding: "utf8" }) };
  } catch (error) {
    return { command: [command, ...args].join(" "), exit_status: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}
const search = run("rg", [
  "-n",
  "-i",
  "redb|shared.*state|state.*redb",
  "src",
  "src-tauri",
  "crates",
  "--glob",
  "!**/AGENTS.md",
]);
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-009",
  verification_status: "unverified",
  status: "owner-decision-pending",
  conclusion:
    "No shared redb state-file implementation or authority contract exists in the LifeOS source surface. The proposal remains unresolved against UDS, PostgreSQL, and existing store boundaries.",
  evidence: [
    {
      relationship: "redb-implementation-search",
      proven: search.output.trim().length > 0,
      command: search.command,
      exit_status: search.exit_status,
      matches: search.output.split("\n").filter(Boolean),
    },
    {
      relationship: "shared-redb-contract",
      proven: false,
      missing: [
        "owner-and-writer-count",
        "schema-and-locking",
        "snapshot-version",
        "freshness",
        "corruption-recovery",
        "postgresql-relationship",
      ],
    },
    {
      relationship: "authority-decision",
      proven: false,
      proposal:
        "LifeOS could connect through shared redb state files instead of or alongside UDS.",
      decision_required:
        "Choose derived view, IPC mechanism, cache, or authority before implementation.",
      owner_decision_path: "PGAUTH-002; PGAUTH-006; STORE-001; POSTGRES-007",
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-009",
);
const packagePath = join(root, "package.json");
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: {
    root,
    package_json_sha256: createHash("sha256").update(readFileSync(packagePath)).digest("hex"),
  },
  claims: [...retained, claim],
  collector: {
    claim_id: "SWARM-CLAIM-009",
    mode: "read-only-redb-authority-and-contract-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, implementation_matches: claim.evidence[0].matches.length }, null, 2));
