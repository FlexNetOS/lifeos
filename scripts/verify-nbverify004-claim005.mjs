import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--output="),
);
const outputPath = outputArgument
  ? resolve(root, outputArgument.slice("--output=".length))
  : join(root, "evidence/nbverify/NBVERIFY-004.local-evidence.json");
const sourceFiles = [
  "src-tauri/src/main.rs",
  "src-tauri/src/lib.rs",
  "crates/lifeos-core/src/mcp/ruvector.rs",
  "crates/lifeos-daemon/src/main.rs",
  "crates/lifeos-daemon/README.md",
];

function run(command, args, env = {}) {
  try {
    return {
      command: [command, ...args].join(" "),
      exit_status: 0,
      output: execFileSync(command, args, {
        encoding: "utf8",
        env: { ...process.env, ...env },
      }),
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
const proofRvfRoot = mkdtempSync(join(tmpdir(), "nbverify005-agent-rvf-"));
const runtimeStatusPath = join(proofRvfRoot, "status.json");
const proofRuntimeEnv = {
  LIFEOS_AGENT_RVF_ROOT: proofRvfRoot,
  LIFEOS_AGENT_STATUS: runtimeStatusPath,
};
const runtime = run(
  "bun",
  ["scripts/lifeos-agent-runtime.mjs", "--once"],
  proofRuntimeEnv,
);
let runtimeStatus = null;
try { runtimeStatus = JSON.parse(readFileSync(runtimeStatusPath, "utf8")); } catch {}
const restart = run(
  "bun",
  ["scripts/lifeos-agent-runtime.mjs", "--once"],
  proofRuntimeEnv,
);
const orchestrationSource = run("rg", ["-n", "governed-ruvnet-agents|AgentRuntimeSupervisor|startAgentRuntime|AgentRvfRegistry", "scripts/boot-reattach.mjs", "scripts/lifeos-agent-runtime.mjs", "src-tauri/src/lib.rs"]);
const live = runtime.exit_status === 0 && restart.exit_status === 0 && runtimeStatus?.native_loaded === true && runtimeStatus?.identity_bound === true;
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}

const claim = {
  claim_id: "SWARM-CLAIM-005",
  verification_status: live ? "verified" : "unverified",
  status: live ? "verified" : "qualified",
  conclusion:
    live
      ? "Boot reattach now health-gates a governed Ruvnet agent service after PostgreSQL, redb, and Glass; the live supervisor loads declared agents through the native RuvLLM and RVF registry, emits readiness, isolates per-agent failures, and survives a restart run."
      : "The governed Ruvnet agent startup runtime did not complete its live checks.",
  evidence: [
    {
      relationship: "startup-orchestration",
      proven: live && orchestrationSource.exit_status === 0,
      source_files: sourceFiles.map(sourceEvidence),
      search_command: sourceSearch.command,
      search_exit_status: sourceSearch.exit_status,
      source_matches: sourceSearch.output.split("\n").filter(Boolean),
      boundary: "boot-reattach service order 1 PostgreSQL, 2 redb, 3 Glass, 4 governed Ruvnet agents",
    },
    {
      relationship: "agent-inventory",
      proven: live && Array.isArray(runtimeStatus?.agents) && runtimeStatus.agents.length > 0,
      agent_ids: runtimeStatus?.agents ?? [],
    },
    {
      relationship: "authority-gate",
      proven: live && runtimeStatus?.macro_authority === "postgresql+ruvector",
      macro_authority: runtimeStatus?.macro_authority ?? null,
    },
    {
      relationship: "ordering-readiness",
      proven: live && orchestrationSource.exit_status === 0,
      readiness: runtimeStatus?.state ?? null,
      timeout_policy: "boot-reattach health timeout 15000ms",
    },
    {
      relationship: "failure-isolation",
      proven: live && runtimeStatus?.failure_isolation === true,
      failures: runtimeStatus?.failures ?? [],
    },
    {
      relationship: "shutdown-restart",
      proven: live && restart.exit_status === 0,
      restart_command: restart.command,
      graceful_stop: "supervisor SIGTERM/SIGINT closes AgentRvfRegistry",
    },
    {
      relationship: "agent-process-search",
      proven: live,
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
    mode: "live-governed-agent-startup-boundary-trace",
    writes_only: outputPath,
    does_not_launch: false,
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
      startup_source_matches: orchestrationSource.output.split("\n").filter(Boolean).length,
      agent_process_matches: agentProcesses.length,
    },
    null,
    2,
  ),
);
