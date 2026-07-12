import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  "UnixStream|UnixListener|AF_UNIX|unix.*socket|domain socket|uds",
  "src",
  "src-tauri",
  "crates",
]);
const matches = search.output.split("\n").filter(Boolean);
const implementationMatches = matches.filter(
  (line) =>
    /\.(rs|ts|js|vue):\d+:/i.test(line) &&
    !/AGENTS\.md:/i.test(line),
);
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-008",
  verification_status: "unverified",
  status: "owner-decision-pending",
  conclusion:
    "UDS remains an architecture proposal. No LifeOS UDS endpoint or protocol was found, and no owner decision selected UDS or defined its contract.",
  evidence: [
    {
      relationship: "uds-implementation-search",
      proven: implementationMatches.length > 0,
      command: search.command,
      exit_status: search.exit_status,
      matches,
      implementation_matches: implementationMatches,
      note: "A source mention or proposal is not an implemented endpoint.",
    },
    {
      relationship: "uds-contract",
      proven: false,
      missing: [
        "endpoint-identity",
        "request-response-schema",
        "peer-identity",
        "authorization",
        "freshness",
        "audit",
        "failure-and-recovery",
      ],
    },
    {
      relationship: "owner-decision",
      proven: false,
      proposal: "LifeOS should connect to the active workspace through Unix Domain Sockets.",
      decision_required:
        "Select UDS or another transport only after the protocol and authority contract is reviewed.",
      owner_decision_path:
        "POSTGRES-007; POSTGRES-009; LIFEOS-010",
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-008",
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
    claim_id: "SWARM-CLAIM-008",
    mode: "read-only-uds-contract-and-owner-decision-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, implementation_matches: implementationMatches.length }, null, 2));
