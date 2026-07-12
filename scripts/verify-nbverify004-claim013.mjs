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
  "Temporal Strange Attractor|strange attractor|Echo.State Network|\\bESN\\b|timeline prediction|forecasting",
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
  claim_id: "SWARM-CLAIM-013",
  verification_status: "unverified",
  status: "qualified",
  conclusion:
    "No Temporal Strange Attractor implementation, orchestrator, forecast output, calibration, accuracy evaluation, uncertainty model, or runtime proof exists in the candidate product source.",
  evidence: [
    {
      relationship: "forecasting-implementation-search",
      proven: search.output.trim().length > 0,
      command: search.command,
      exit_status: search.exit_status,
      matches: search.output.split("\n").filter(Boolean).slice(0, 160),
      note: "Generic simulation schemas or source prose are not a forecasting implementation.",
    },
    {
      relationship: "forecast-model-boundary",
      proven: false,
      missing: [
        "algorithm",
        "model-definition",
        "orchestrator-path",
        "input-state",
        "output-schema",
        "uncertainty",
      ],
    },
    {
      relationship: "evaluation-runtime",
      proven: false,
      missing: [
        "training-or-calibration",
        "accuracy-metric",
        "benchmark-workload",
        "runtime-process",
        "non-executing-simulation-boundary",
      ],
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-013",
);
const packagePath = join(root, "package.json");
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: { root, package_json_sha256: createHash("sha256").update(readFileSync(packagePath)).digest("hex") },
  claims: [...retained, claim],
  collector: {
    claim_id: "SWARM-CLAIM-013",
    mode: "read-only-forecasting-implementation-boundary-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, search_matches: claim.evidence[0].matches.length }, null, 2));
