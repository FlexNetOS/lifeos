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
  "OwnerClient|OwnerService|ProjectionReader|UnixStream|UnixListener|AF_UNIX|unix.*socket|domain socket|uds",
  "src",
  "src-tauri",
  "crates",
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
const matches = search.output.split("\n").filter(Boolean);
const implementationMatches = matches.filter(
  (line) =>
    /\.(rs|ts|js|vue):\d+:/i.test(line) &&
    !/AGENTS\.md:/i.test(line) &&
    /OwnerClient|OwnerService|ProjectionReader|redb_(events|projection)/i.test(line),
);
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-008",
  verification_status: live.exit_status === 0 ? "verified" : "unverified",
  status: live.exit_status === 0 ? "verified" : "owner-decision-pending",
  conclusion:
    live.exit_status === 0
      ? "LifeOS connects to the authenticated redb owner over its Unix-domain protocol; the live native boundary test proves ordered projection/event delivery and recovery behavior."
      : "The live redb-owner protocol test did not execute successfully; the UDS contract remains unverified.",
  evidence: [
    {
      relationship: "uds-implementation-search",
      proven: implementationMatches.length > 0 && live.exit_status === 0,
      command: search.command,
      exit_status: search.exit_status,
      matches,
      implementation_matches: implementationMatches,
      note: "The source trace is paired with the native live owner-boundary test; source mentions alone are insufficient.",
    },
    {
      relationship: "uds-contract",
      proven: live.exit_status === 0,
      transport: "authenticated Unix-domain owner protocol",
      live_test: live.command,
      live_exit_status: live.exit_status,
      live_output: live.output.split("\n").filter(Boolean).slice(-24),
      contract: ["endpoint-identity", "request-response-schema", "peer-identity", "authorization", "freshness", "audit", "failure-and-recovery"],
    },
    {
      relationship: "owner-decision",
      proven: live.exit_status === 0,
      decision: "LifeOS uses the authenticated redb owner protocol; PostgreSQL remains durable authority and redb remains transient.",
      owner_boundary: "OwnerService/OwnerClient",
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-008",
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
    claim_id: "SWARM-CLAIM-008",
    mode: "read-only-uds-contract-and-owner-decision-trace",
    writes_only: outputPath,
    does_not_launch: true,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, implementation_matches: implementationMatches.length }, null, 2));
