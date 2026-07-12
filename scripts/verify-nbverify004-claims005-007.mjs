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
const rawProofPath = join(
  root,
  "planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-RUNTIME-001.node-authority-proof.raw.json",
);
const packagePath = join(root, "package.json");
const rawProof = JSON.parse(readFileSync(rawProofPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

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

const sourceSearch = run("rg", [
  "-n",
  "-i",
  "ruvnet|agentdb|ruvllm|rvf",
  "src",
  "src-tauri",
]);
const startupMatches = sourceSearch.output
  .split("\n")
  .filter(Boolean)
  .slice(0, 80);
const processSnapshot = run("ps", ["-eo", "pid=,ppid=,comm=,args="]);
const processMatches = processSnapshot.output
  .split("\n")
  .filter((line) => /ruvnet|agentdb|ruvllm|ruvector|rvf|sona|tiny-dancer/i.test(line));
const packageRecord = (name) => {
  const path = join(root, "node_modules", name, "package.json");
  if (!existsSync(path)) return { name, path, proven: false };
  const value = JSON.parse(readFileSync(path, "utf8"));
  return { name, path, proven: true, version: value.version };
};
const ruvllmPackage = packageRecord("@ruvector/ruvllm");
const ruvllmNative = packageRecord("@ruvector/ruvllm-linux-x64-gnu");
const rvfPackage = packageRecord("@ruvector/rvf");
const rvfNodeNative = packageRecord("@ruvector/rvf-node-linux-x64-gnu");
const directRvfPath = join(root, rawProof.rvf.path);
const agentRvfPath = join(root, rawProof.agentdb.path);

const claims = [
  {
    claim_id: "SWARM-CLAIM-005",
    verification_status: "unverified",
    status: "partial",
    conclusion:
      "The LifeOS root contains installed Ruvector/AgentDB capabilities, but no LifeOS/Yazelix startup orchestration source or live Ruvnet agent process proves automatic governed agent startup.",
    evidence: [
      {
        relationship: "startup-orchestration",
        proven: startupMatches.length > 0,
        search: {
          command: sourceSearch.command,
          exit_status: sourceSearch.exit_status,
          matches: startupMatches,
        },
        note:
          "Package declarations and verifier scripts are not automatic product startup orchestration.",
      },
      {
        relationship: "agent-process-search",
        proven: processMatches.length > 0,
        command: processSnapshot.command,
        exit_status: processSnapshot.exit_status,
        matches: processMatches,
        note:
          "A point-in-time absence does not prove the agents can never start; it leaves automatic startup unverified.",
      },
      {
        relationship: "runtime-capability-boundary",
        proven: rawProof.agentdb.learningEnabled === true,
        agentdb_learning_enabled: rawProof.agentdb.learningEnabled,
        note:
          "This is native capability proof only, not startup, lifecycle, authority, or readiness proof.",
      },
    ],
  },
  {
    claim_id: "SWARM-CLAIM-006",
    verification_status: "unverified",
    status: "qualified",
    conclusion:
      "A direct native @ruvector/ruvllm package and its Linux optional binary are installed, and the verifier exercised 51 in-memory adapters; the asserted static engine selection for automatically started agents is not proven.",
    evidence: [
      {
        relationship: "ruvllm-package",
        proven: ruvllmPackage.proven && ruvllmNative.proven,
        direct: ruvllmPackage,
        platform_native: ruvllmNative,
        package_json_sha256: sha256(packagePath),
      },
      {
        relationship: "ruvllm-runtime-proof",
        proven: rawProof.ruvllm.adapterCount === 51,
        adapter_count: rawProof.ruvllm.adapterCount,
        active_adapter: rawProof.ruvllm.activeAdapter,
        note: rawProof.ruvllm.note,
      },
      {
        relationship: "static-engine-boundary",
        proven: false,
        missing: [
          "static-link-or-packaging-definition",
          "automatic-agent-selection",
          "running-agent-process",
        ],
        note:
          "Installed native package and in-memory adapter switching are not equivalent to a static engine used by automatically started agents.",
      },
    ],
  },
  {
    claim_id: "SWARM-CLAIM-007",
    verification_status: "unverified",
    status: "qualified",
    conclusion:
      "The native verifier created and loaded RVF-backed files through NodeBackend, including an AgentDB learning file; no per-agent .rvf discovery, identity, ownership, persistence, recovery, or automatic loading contract is proven.",
    evidence: [
      {
        relationship: "rvf-runtime-proof",
        proven:
          rawProof.rvf.selectedBackend === "NodeBackend" &&
          rawProof.rvf.ingestResult.accepted === 2 &&
          existsSync(directRvfPath),
        backend: rawProof.rvf.selectedBackend,
        path: rawProof.rvf.path,
        path_exists: existsSync(directRvfPath),
        bytes: rawProof.rvf.bytes,
        ingest: rawProof.rvf.ingestResult,
        segments: rawProof.rvf.segments,
      },
      {
        relationship: "agent-rvf-boundary",
        proven:
          rawProof.agentdb.learningEnabled === true &&
          existsSync(agentRvfPath),
        path: rawProof.agentdb.path,
        path_exists: existsSync(agentRvfPath),
        learning_enabled: rawProof.agentdb.learningEnabled,
        segments: rawProof.agentdb.segments,
        witness: rawProof.agentdb.witness,
        note:
          "This is a verifier-owned AgentDB learning artifact, not proof of per-agent Ruvnet .rvf personalities.",
      },
      {
        relationship: "per-agent-loading-contract",
        proven: false,
        missing: [
          "agent-identity-to-rvf-mapping",
          "automatic-discovery",
          "authority-and-mutation-policy",
          "retention-and-recovery-test",
        ],
      },
    ],
  },
];

let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const replaced = (previous.claims ?? []).filter(
  (claim) =>
    !["SWARM-CLAIM-005", "SWARM-CLAIM-006", "SWARM-CLAIM-007"].includes(
      claim.claim_id,
    ),
);
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: {
    root,
    package_json_sha256: sha256(packagePath),
  },
  claims: [...replaced, ...claims],
  collector: {
    claim_ids: ["SWARM-CLAIM-005", "SWARM-CLAIM-006", "SWARM-CLAIM-007"],
    mode: "read-only-installed-runtime-and-source-boundary-trace",
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
      observed_claims: result.claims.map((claim) => claim.claim_id),
      startup_source_match_count: startupMatches.length,
      agent_process_match_count: processMatches.length,
      rvf_backend: rawProof.rvf.selectedBackend,
      ruvllm_adapter_count: rawProof.ruvllm.adapterCount,
    },
    null,
    2,
  ),
);
