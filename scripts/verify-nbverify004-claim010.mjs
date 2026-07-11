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
const uiSearch = run("rg", [
  "-n",
  "-i",
  "swarm|agent team|agent status",
  "src",
  "tests",
  "--glob",
  "!**/AGENTS.md",
]);
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-010",
  verification_status: "unverified",
  status: "qualified",
  conclusion:
    "LifeOS contains agent-team and workflow UI surfaces, but no canonical active-swarm status schema, selected transport projection, agent identity flow, or stale/unavailable state behavior is proven.",
  evidence: [
    {
      relationship: "ui-status-search",
      proven: uiSearch.output.trim().length > 0,
      command: uiSearch.command,
      exit_status: uiSearch.exit_status,
      matches: uiSearch.output.split("\n").filter(Boolean).slice(0, 120),
      note: "UI labels and fixtures are not live workspace status evidence.",
    },
    {
      relationship: "canonical-status-flow",
      proven: false,
      missing: [
        "canonical-agent-status-schema",
        "selected-transport",
        "agent-identity-projection",
        "event-source",
        "LifeOS-runtime-bridge",
      ],
    },
    {
      relationship: "stale-unavailable-states",
      proven: false,
      missing: ["unavailable-state", "stale-state", "disconnect-recovery", "freshness-marker"],
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-010",
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
    claim_id: "SWARM-CLAIM-010",
    mode: "read-only-ui-status-boundary-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, ui_matches: claim.evidence[0].matches.length }, null, 2));
