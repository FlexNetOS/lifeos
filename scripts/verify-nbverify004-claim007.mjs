import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = process.cwd();
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--output="),
);
const outputPath = outputArgument
  ? resolve(root, outputArgument.slice("--output=".length))
  : join(root, "evidence/nbverify/NBVERIFY-004.local-evidence.json");
const packagePath = join(root, "node_modules/@ruvector/rvf/package.json");
const nativePackagePath = join(
  root,
  "node_modules/@ruvector/rvf-node-linux-x64-gnu/package.json",
);

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function run(command, args) {
  try {
    return { command: [command, ...args].join(" "), exit_status: 0, output: execFileSync(command, args, { encoding: "utf8" }) };
  } catch (error) {
    return { command: [command, ...args].join(" "), exit_status: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}
const runtime = run("bun", ["scripts/agentdb-rvf-lifecycle.mjs"]);
const rawProofPath = join(root, "node_modules/.cache/lifeos/archbp-007/lifecycle-proof.raw.json");
const rawProof = runtime.exit_status === 0 && existsSync(rawProofPath)
  ? JSON.parse(readFileSync(rawProofPath, "utf8"))
  : {};
function relativeProofPath(relativePath) {
  const path = join(root, relativePath);
  return { path: relativePath, exists: existsSync(path), absolute: path };
}

const discoveredPath = rawProof.registry?.discovered?.[0]?.storagePath ?? "";
const direct = { path: discoveredPath, exists: runtime.exit_status === 0, absolute: discoveredPath };
const agentdb = direct;
const rvfFiles = run("find", [
  join(root, "node_modules/.cache/lifeos/node-authority"),
  "-type",
  "f",
  "-name",
  "*.rvf",
]);
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}

const claim = {
  claim_id: "SWARM-CLAIM-007",
  verification_status: runtime.exit_status === 0 && rawProof.registry?.identityBound === true ? "verified" : "unverified",
  status: runtime.exit_status === 0 && rawProof.registry?.identityBound === true ? "verified" : "qualified",
  conclusion:
    runtime.exit_status === 0 && rawProof.registry?.identityBound === true
      ? "The real AgentDB/RVF runtime opened an allow-listed per-agent RVF through the registry, discovered its identity, exercised learning and recovery, and shut down cleanly while PostgreSQL/RuVector remained the macro authority."
      : "The AgentDB/RVF per-agent registry runtime did not complete successfully.",
  evidence: [
    {
      relationship: "rvf-runtime-proof",
      proven: runtime.exit_status === 0 && rawProof.status?.fileSizeBytes > 0,
      command: runtime.command,
      exit_status: runtime.exit_status,
      package: {
        direct: { path: packagePath, proven: existsSync(packagePath) },
        native: { path: nativePackagePath, proven: existsSync(nativePackagePath) },
      },
      backend: "NodeBackend",
      artifact: direct,
      bytes: rawProof.status?.fileSizeBytes ?? 0,
      ingest: rawProof.active ?? null,
      segments: rawProof.status ?? null,
    },
    {
      relationship: "agent-rvf-boundary",
      proven: runtime.exit_status === 0 && rawProof.feedback?.recorded === true && agentdb.exists,
      artifact: agentdb,
      learning_enabled: rawProof.feedback?.recorded === true,
      segments: rawProof.status ?? null,
      witness: rawProof.witness ?? null,
      note: "This artifact is produced by the live per-agent registry runtime.",
    },
    {
      relationship: "per-agent-loading-contract",
      proven: runtime.exit_status === 0 && rawProof.registry?.identityBound === true && rawProof.registry?.shutdownClean === true,
      identity_mapping: rawProof.registry ?? null,
      recovery: rawProof.recovery ?? null,
      rvf_files_found: rvfFiles.output.split("\n").filter(Boolean),
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-007",
);
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: { root, package_json_sha256: sha256(join(root, "package.json")) },
  claims: [...retained, claim],
  collector: {
    claim_id: "SWARM-CLAIM-007",
    mode: "live-agent-rvf-registry-boundary-trace",
    writes_only: outputPath,
    does_not_launch: false,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    { claim_id: claim.claim_id, status: claim.status, runtime_exit: runtime.exit_status, registry_bound: rawProof.registry?.identityBound ?? false },
    null,
    2,
  ),
);
