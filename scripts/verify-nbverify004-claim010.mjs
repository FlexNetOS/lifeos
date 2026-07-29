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
  : join(root, "evidence/nbverify/NBVERIFY-004.local-evidence.json");
function run(command, args) {
  try {
    return { command: [command, ...args].join(" "), exit_status: 0, output: execFileSync(command, args, { encoding: "utf8" }) };
  } catch (error) {
    return { command: [command, ...args].join(" "), exit_status: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}
const uiRuntime = run("bun", ["run", "test", "--", "tests/swarm-status.spec.ts"]);
const ownerRuntime = run("/home/flexnetos/.nix-profile/bin/rtk", ["proxy", "cargo", "test", "--manifest-path", "src-tauri/Cargo.toml", "--test", "redb_owner_live"]);
const verified = uiRuntime.exit_status === 0 && ownerRuntime.exit_status === 0;
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-010",
  verification_status: verified ? "verified" : "unverified",
  status: verified ? "verified" : "qualified",
  conclusion: verified
    ? "The Glass reads an owner-published swarm status projection with identity, sequence, freshness, stale, degraded, and unavailable states; the authenticated owner boundary and status derivation tests pass."
    : "The owner-published swarm status boundary is not fully proven because one or more live boundary checks failed.",
  evidence: [
    {
      relationship: "ui-status-runtime",
      proven: uiRuntime.exit_status === 0,
      command: uiRuntime.command,
      exit_status: uiRuntime.exit_status,
    },
    {
      relationship: "canonical-status-flow",
      proven: verified,
      command: ownerRuntime.command,
      exit_status: ownerRuntime.exit_status,
      details: ["OwnerClient", "redb projection", "swarm.status", "swarm.identity", "swarm.updatedAt"],
    },
    {
      relationship: "stale-unavailable-states",
      proven: uiRuntime.exit_status === 0,
      details: ["unavailable", "stale", "degraded", "freshness marker"],
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
    mode: "live-ui-swarm-status-boundary-trace",
    writes_only: outputPath,
    does_not_launch: false,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, ui_runtime_exit: uiRuntime.exit_status, owner_runtime_exit: ownerRuntime.exit_status }, null, 2));
