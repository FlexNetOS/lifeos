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
const sourceFiles = [
  "src-tauri/src/main.rs",
  "src-tauri/src/lib.rs",
  "crates/lifeos-core/src/mcp/ruvector.rs",
  "crates/lifeos-daemon/src/main.rs",
  "crates/lifeos-daemon/README.md",
  "planning-spine-v0/1.0_VISION/LifeOS Master Plan — Consolidated v1 (2026-07-07).md",
];

function run(command, args) {
  try {
    return {
      command: [command, ...args].join(" "),
      exit_status: 0,
      output: execFileSync(command, args, { encoding: "utf8" }),
    };
  } catch (error) {
    return {
      command: [command, ...args].join(" "),
      exit_status: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}
function sourceEvidence(relativePath) {
  const path = join(root, relativePath);
  return {
    path: relativePath,
    exists: existsSync(path),
    sha256: existsSync(path)
      ? createHash("sha256").update(readFileSync(path)).digest("hex")
      : null,
  };
}

const sourceSearch = run("rg", [
  "-n",
  "-i",
  "ruvnet|agentdb|ruvllm|rvf",
  "src",
  "src-tauri",
]);
const processSnapshot = run("ps", ["-eo", "pid=,ppid=,comm=,args="]);
const agentProcesses = processSnapshot.output
  .split("\n")
  .filter(
    (line) =>
      /ruvnet|agentdb|ruvllm|ruvector|rvf|swarm/i.test(line) &&
      !/rustc|kache|envctl_engine/i.test(line),
  );
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}

const claim = {
  claim_id: "SWARM-CLAIM-005",
  verification_status: "unverified",
  status: "partial",
  conclusion:
    "No automatic governed Ruvnet-agent startup is proven. LifeOS desktop startup and the installed Yazelix workspace are present, but no agent inventory, authority gate, ordering/readiness contract, isolation, shutdown, or restart receipt exists.",
  evidence: [
    {
      relationship: "startup-orchestration",
      proven: false,
      source_files: sourceFiles.map(sourceEvidence),
      search_command: sourceSearch.command,
      search_exit_status: sourceSearch.exit_status,
      source_matches: sourceSearch.output.split("\n").filter(Boolean),
      boundary:
        "Tauri setup initializes the application and storage; Yazelix owns terminal workspace orchestration; neither is proof of Ruvnet-agent startup.",
    },
    {
      relationship: "agent-inventory",
      proven: false,
      agent_ids: [],
      missing: ["declared-agent-identities", "executable-and-config-identities"],
    },
    {
      relationship: "authority-gate",
      proven: false,
      missing: ["governance-policy", "authorization-check", "owner-approval-receipt"],
    },
    {
      relationship: "ordering-readiness",
      proven: false,
      missing: ["dependency-order", "readiness-signal", "timeout-policy"],
    },
    {
      relationship: "failure-isolation",
      proven: false,
      missing: ["per-agent-failure-boundary", "error-routing", "isolation-test"],
    },
    {
      relationship: "shutdown-restart",
      proven: false,
      missing: ["graceful-stop", "restart-policy", "bounded-restart-test"],
    },
    {
      relationship: "agent-process-search",
      proven: false,
      command: processSnapshot.command,
      exit_status: processSnapshot.exit_status,
      matches: agentProcesses,
      note:
        "No Ruvnet/RuvLLM/AgentDB process was visible at this observation point; this does not prove a global negative.",
    },
  ],
};

const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-005",
);
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: {
    root,
    package_json_sha256: createHash("sha256")
      .update(readFileSync(join(root, "package.json")))
      .digest("hex"),
  },
  claims: [...retained, claim],
  collector: {
    claim_id: "SWARM-CLAIM-005",
    mode: "read-only-startup-boundary-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};

await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      claim_id: claim.claim_id,
      status: claim.status,
      startup_source_matches: claim.evidence[0].source_matches.length,
      agent_process_matches: agentProcesses.length,
    },
    null,
    2,
  ),
);
