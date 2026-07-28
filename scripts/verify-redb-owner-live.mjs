import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const receiptPath = join(root, "evidence/redb/owner-live-receipt.json");
const command = [
  "proxy",
  "cargo",
  "test",
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "--test",
  "redb_owner_live",
  "--",
  "--nocapture",
];

const output = execFileSync(rtk, command, {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const combined = output;
const expectedTests = [
  "authenticated_owner_publishes_checksummed_projection_and_ordered_events",
  "owner_republishes_a_commit_after_projection_publish_failure",
];
const missing = expectedTests.filter((name) => !combined.includes(`test ${name} ... ok`));
if (missing.length || !/test result: ok\b/.test(combined)) {
  throw new Error(`redb owner live suite did not prove all expected tests: ${missing.join(", ") || "suite failure"}`);
}

const receipt = {
  schema_version: "lifeos.evidence.redb-owner-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  source: {
    tauri_manifest: "src-tauri/Cargo.toml",
    integration_test: "src-tauri/tests/redb_owner_live.rs",
    owner_crate: "../nu_plugin/crates/flexnetos_redb_owner",
    owner_revision: "c49af6e5a9301296d9ff0133c04acd987363155f",
    owner_worktree: "clean",
  },
  command: `rtk ${command.join(" ")}`,
  tests: expectedTests.map((name) => ({ name, status: "passed" })),
  proven: [
    "authenticated OwnerClient mutation and token rejection",
    "monotonic local sequence and checksummed read-only projection",
    "ordered projection events",
    "crash-after-commit replay on owner restart",
  ],
  output_sha256: createHash("sha256").update(combined).digest("hex"),
};

mkdirSync(join(root, "evidence/redb"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: receiptPath, tests: expectedTests.length, status: "ok" }, null, 2));
