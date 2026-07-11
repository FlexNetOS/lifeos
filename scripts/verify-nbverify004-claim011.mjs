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
  "benchmark|p50|p95|p99|latency|real.time|freshness",
  "src",
  "src-tauri",
  "crates",
  "scripts",
  "tests",
  "--glob",
  "!**/AGENTS.md",
]);
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-011",
  verification_status: "unverified",
  status: "qualified",
  conclusion:
    "No reproducible end-to-end swarm event-to-render benchmark defines or proves the claimed real-time UI status behavior.",
  evidence: [
    {
      relationship: "performance-search",
      proven: search.output.trim().length > 0,
      command: search.command,
      exit_status: search.exit_status,
      matches: search.output.split("\n").filter(Boolean).slice(0, 160),
      note: "Generic test or performance terms are not an end-to-end swarm status benchmark.",
    },
    {
      relationship: "workload-and-slo",
      proven: false,
      missing: [
        "freshness-budget",
        "event-rate",
        "workload-definition",
        "hardware",
        "transport",
        "disconnect-and-stale-policy",
      ],
    },
    {
      relationship: "benchmark-result",
      proven: false,
      missing: ["event-to-render-p50", "event-to-render-p95", "event-to-render-p99", "stale-detection-measurement"],
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-011",
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
    claim_id: "SWARM-CLAIM-011",
    mode: "read-only-performance-boundary-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, search_matches: claim.evidence[0].matches.length, benchmark_proven: false }, null, 2));
