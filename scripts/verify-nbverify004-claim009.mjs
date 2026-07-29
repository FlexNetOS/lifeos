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
  "redb|shared.*state|state.*redb",
  "src",
  "src-tauri",
  "crates",
  "--glob",
  "!**/AGENTS.md",
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
  claim_id: "SWARM-CLAIM-009",
  verification_status: live.exit_status === 0 ? "verified" : "unverified",
  status: live.exit_status === 0 ? "verified" : "owner-decision-pending",
  conclusion:
    live.exit_status === 0
      ? "LifeOS uses the single authenticated redb owner for transient shared state, publishes a checksummed mmap projection, emits ordered events, and replays after a publish failure; PostgreSQL remains the durable authority."
      : "The live redb-owner boundary test did not execute successfully; shared redb remains unverified.",
  evidence: [
    {
      relationship: "redb-implementation-search",
      proven: search.output.trim().length > 0 && live.exit_status === 0,
      command: search.command,
      exit_status: search.exit_status,
      matches: search.output.split("\n").filter(Boolean),
      live_test: live.command,
      live_exit_status: live.exit_status,
      live_output: live.output.split("\n").filter(Boolean).slice(-24),
    },
    {
      relationship: "shared-redb-contract",
      proven: live.exit_status === 0,
      owner_and_writer_count: "one OwnerService writer; LifeOS uses OwnerClient",
      schema_and_locking: "versioned owner protocol with projection slots and checksums",
      snapshot_version: "projection local_seq and generation metadata",
      freshness: "ordered CommitEvent sequence and cursor validation",
      corruption_recovery: "checksum fallback and publish-failure replay",
      postgresql_relationship: "transient redb projection; PostgreSQL remains canonical durable state",
    },
    {
      relationship: "authority-decision",
      proven: live.exit_status === 0,
      decision: "Use redb only as the owner-published transient projection and ordered wakeup plane; never as PostgreSQL authority.",
      owner_boundary: "OwnerService/OwnerClient",
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-009",
);
const packagePath = join(root, "package.json");
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: {
    root,
    package_json_sha256: createHash("sha256").update(readFileSync(packagePath)).digest("hex"),
  },
  claims: [...retained, claim],
  collector: {
    claim_id: "SWARM-CLAIM-009",
    mode: "read-only-redb-authority-and-contract-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, implementation_matches: claim.evidence[0].matches.length }, null, 2));
