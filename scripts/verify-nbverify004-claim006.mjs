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
  : join(root, "evidence/nbverify/NBVERIFY-004.local-evidence.json");
const packagePath = join(root, "package.json");
const rawProofPath = join(
  root,
  "evidence/nbverify/NBVERIFY-001.node-authority-proof.raw.json",
);
const rawProof = JSON.parse(readFileSync(rawProofPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function packageEvidence(name) {
  const path = join(root, "node_modules", name, "package.json");
  if (!existsSync(path)) return { name, path, proven: false };
  return { name, path, proven: true, version: JSON.parse(readFileSync(path, "utf8")).version };
}
function run(command, args) {
  try {
    return { command: [command, ...args].join(" "), exit_status: 0, output: execFileSync(command, args, { encoding: "utf8" }) };
  } catch (error) {
    return { command: [command, ...args].join(" "), exit_status: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

const rufloRuntime = run("bun", ["scripts/ruflo-coordinator-lifecycle.mjs"]);
const rufloProofPath = join(root, "node_modules/.cache/lifeos/archbp-014/coordinator-proof.raw.json");
const rufloProof = rufloRuntime.exit_status === 0 && existsSync(rufloProofPath)
  ? JSON.parse(readFileSync(rufloProofPath, "utf8"))
  : {};

const processSnapshot = run("ps", ["-eo", "pid=,ppid=,comm=,args="]);
const agentProcesses = processSnapshot.output
  .split("\n")
  .filter(
    (line) =>
      /ruvnet|agentdb|ruvllm|ruvector|swarm/i.test(line) &&
      !/rustc|kache|envctl_engine/i.test(line),
  );
const ruvllmPackage = packageEvidence("@ruvector/ruvllm");
const nativePackage = packageEvidence("@ruvector/ruvllm-linux-x64-gnu");
const nativeBinary = join(
  root,
  "node_modules/@ruvector/ruvllm-linux-x64-gnu/ruvllm.linux-x64-gnu.node",
);
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}

const claim = {
  claim_id: "SWARM-CLAIM-006",
  verification_status: ruvllmPackage.proven && nativePackage.proven && rufloProof.routingRuntime?.nativeLoaded === true && rufloProof.binding?.agentMemoryBound === true ? "verified" : "unverified",
  status: ruvllmPackage.proven && nativePackage.proven && rufloProof.routingRuntime?.nativeLoaded === true && rufloProof.binding?.agentMemoryBound === true ? "verified" : "qualified",
  conclusion:
    rufloProof.binding?.agentMemoryBound === true
      ? "The installed native RuvLLM engine is exercised by the live Ruflo coordinator and its native embedding is persisted into the bound per-agent RVF memory; the coordinator remains policy-gated and fail-closed."
      : "Native RuvLLM capability is present, but live coordinator usage is not proven.",
  evidence: [
    {
      relationship: "ruvllm-package",
      proven: ruvllmPackage.proven && nativePackage.proven,
      direct: ruvllmPackage,
      platform_native: nativePackage,
      package_json_sha256: sha256(packagePath),
    },
    {
      relationship: "native-capability",
      proven:
        rawProof.runtime.napi === "10" &&
        rawProof.ruvector.implementationType === "native" &&
        existsSync(nativeBinary),
      bun: rawProof.runtime.bun,
      napi: rawProof.runtime.napi,
      implementation: rawProof.ruvector.implementationType,
      features: rawProof.ruvector.backendInfo.features,
      native_binary: nativeBinary,
      native_binary_exists: existsSync(nativeBinary),
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
      proven: rufloRuntime.exit_status === 0 && rufloProof.routingRuntime?.nativeLoaded === true,
      command: rufloRuntime.command,
      exit_status: rufloRuntime.exit_status,
      model: rufloProof.routingRuntime?.model ?? null,
      native_loaded: rufloProof.routingRuntime?.nativeLoaded ?? false,
    },
    {
      relationship: "automatic-agent-usage",
      proven: rufloRuntime.exit_status === 0 && rufloProof.binding?.agentMemoryBound === true,
      command: rufloRuntime.command,
      exit_status: rufloRuntime.exit_status,
      binding: rufloProof.binding ?? null,
      process_snapshot: processSnapshot.command,
      agent_processes: agentProcesses,
      note:
        "Native package capability is not proof that an automatically started Ruvnet agent uses the engine.",
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-006",
);
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: { root, package_json_sha256: sha256(packagePath) },
  claims: [...retained, claim],
  collector: {
    claim_id: "SWARM-CLAIM-006",
    mode: "live-ruflo-native-ruvllm-boundary-trace",
    writes_only: outputPath,
    does_not_launch: false,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, native: claim.evidence[1].proven, automatic_agent_usage: claim.evidence[4].proven }, null, 2));
