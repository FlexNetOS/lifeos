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
  : join(
      root,
      "planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-004.local-evidence.json",
    );
const rawProofPath = join(
  root,
  "planning-spine-v0/generated/notebooklm_claim_verification/NBVERIFY-RUNTIME-001.node-authority-proof.raw.json",
);
const rawProof = JSON.parse(readFileSync(rawProofPath, "utf8"));
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
function relativeProofPath(relativePath) {
  const path = join(root, relativePath);
  return { path: relativePath, exists: existsSync(path), absolute: path };
}

const direct = relativeProofPath(rawProof.rvf.path);
const agentdb = relativeProofPath(rawProof.agentdb.path);
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
  verification_status: "unverified",
  status: "qualified",
  conclusion:
    "The real Bun verifier produced and loaded RVF-backed files through NodeBackend, including an AgentDB learning artifact; no per-agent Ruvnet .rvf discovery, identity, authority, retention, or recovery contract is proven.",
  evidence: [
    {
      relationship: "rvf-runtime-proof",
      proven:
        rawProof.rvf.selectedBackend === "NodeBackend" &&
        rawProof.rvf.ingestResult.accepted === 2 &&
        direct.exists,
      package: {
        direct: { path: packagePath, proven: existsSync(packagePath) },
        native: { path: nativePackagePath, proven: existsSync(nativePackagePath) },
      },
      backend: rawProof.rvf.selectedBackend,
      artifact: direct,
      bytes: rawProof.rvf.bytes,
      ingest: rawProof.rvf.ingestResult,
      segments: rawProof.rvf.segments,
    },
    {
      relationship: "agent-rvf-boundary",
      proven: rawProof.agentdb.learningEnabled === true && agentdb.exists,
      artifact: agentdb,
      learning_enabled: rawProof.agentdb.learningEnabled,
      segments: rawProof.agentdb.segments,
      witness: rawProof.agentdb.witness,
      note:
        "This artifact is verifier-owned under node-authority cache, not an identified per-agent cognitive-state directory.",
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
    mode: "read-only-real-bun-rvf-boundary-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    { claim_id: claim.claim_id, status: claim.status, rvf_backend: claim.evidence[0].backend, rvf_artifacts: claim.evidence[2].rvf_files_found.length },
    null,
    2,
  ),
);
