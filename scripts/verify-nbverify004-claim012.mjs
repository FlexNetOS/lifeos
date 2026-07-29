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
      "evidence/nbverify/NBVERIFY-004.local-evidence.json",
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
  "canonical.*authority|single.writer|dual.write|split.brain|no.overlap|consistency",
  "src",
  "src-tauri",
  "crates",
  "--glob",
  "!**/AGENTS.md",
  "--glob",
  "!**/generated/**",
]);
const live = run("/home/flexnetos/.nix-profile/bin/rtk", [
  "proxy",
  "cargo",
  "test",
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "--test",
  "redb_owner_live",
]);
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-012",
  verification_status: live.exit_status === 0 ? "verified" : "unverified",
  status: live.exit_status === 0 ? "verified" : "owner-decision-pending",
  conclusion:
    live.exit_status === 0
      ? "The authenticated redb owner protocol is the sole transient writer and projection publisher; ordered events, checksummed snapshots, and restart replay establish the no-overlap and split-brain recovery boundary while PostgreSQL remains durable authority."
      : "The live redb-owner boundary test did not execute successfully; the authority and recovery contract remain unverified.",
  evidence: [
    {
      relationship: "authority-search",
      proven: search.output.trim().length > 0 && live.exit_status === 0,
      command: search.command,
      exit_status: search.exit_status,
      matches: search.output.split("\n").filter(Boolean).slice(0, 160),
      live_test: live.command,
      live_exit_status: live.exit_status,
      live_output: live.output.split("\n").filter(Boolean).slice(-24),
      note: "The source trace is paired with the native live owner-boundary test.",
    },
    {
      relationship: "no-overlap-contract",
      proven: live.exit_status === 0,
      canonical_writer: "single flexnetos-redb-owner OwnerService",
      transport: "authenticated Unix-domain OwnerClient protocol",
      snapshot_version: "checksummed projection local_seq and slot generation",
      consistency_model: "ordered CommitEvent sequence with gap validation",
      dual_write_prevention: "LifeOS has no writable redb handle; PostgreSQL remains durable authority",
    },
    {
      relationship: "split-brain-recovery",
      proven: live.exit_status === 0,
      conflict_detection: "invalid owner token is rejected",
      reconciliation: "ordered event stream and projection cursor",
      recovery_test: "owner_republishes_a_commit_after_projection_publish_failure",
      owner_approval: "OwnerService token authorization",
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-012",
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
    claim_id: "SWARM-CLAIM-012",
    mode: "live-authority-and-consistency-boundary-trace",
    writes_only: outputPath,
    does_not_launch: false,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, authority_matches: claim.evidence[0].matches.length }, null, 2));
