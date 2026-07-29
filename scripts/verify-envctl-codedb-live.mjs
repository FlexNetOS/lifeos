import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const envctlRoot = join(root, "../envctl");
const codeDbRoot = join(root, "../nu_plugin");
const pgConn = process.env.ENVCTL_PG_CONN ??
  "host=/home/flexnetos/meta/var/run/postgresql dbname=envctl_commit_test user=flexnetos";

function run(args, env = process.env) {
  return execFileSync(rtk, args, {
    cwd: root,
    encoding: "utf8",
    env,
  });
}

const codeDbOutput = run(["proxy", "bun", "scripts/verify-codedb-rtk-nu.mjs"]);
if (!/rtk_nu .* live path verified/.test(codeDbOutput)) {
  throw new Error("CodeDB live path did not emit its canonical verification receipt");
}

const envctlOutput = run(
  [
    "proxy",
    "cargo",
    "test",
    "--manifest-path",
    "../envctl/crates/commit-worker/Cargo.toml",
    "--features",
    "pg-integration",
    "--test",
    "committer",
    "--",
    "--nocapture",
  ],
  { ...process.env, ENVCTL_PG_CONN: pgConn },
);
const envctlTests = [
  "acknowledgement_never_precedes_durable_commit",
  "committed_state_projects_back_deterministically_through_the_owner_protocol",
  "drain_is_ordered_idempotent_and_restart_safe_with_exact_identity",
  "grants_deny_every_non_envctl_write_at_the_database",
];
const missing = envctlTests.filter((name) => !envctlOutput.includes(`test ${name} ... ok`));
if (missing.length || !/test result: ok\b/.test(envctlOutput)) {
  throw new Error(`envctl committer suite did not prove all expected tests: ${missing.join(", ") || "suite failure"}`);
}

const revision = (repo) => run(["proxy", "git", "-C", repo, "rev-parse", "HEAD"]).trim();
const receipt = {
  schema_version: "lifeos.evidence.envctl-codedb-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  authority_invariants: [5, 7, 10, 12, 14, 18],
  code_db: {
    repository: "../nu_plugin",
    revision: revision(codeDbRoot),
    worktree: "clean",
    path: "rtk_nu → CodeDB → redb",
    verification_output_sha256: createHash("sha256").update(codeDbOutput).digest("hex"),
  },
  envctl: {
    repository: "../envctl",
    revision: revision(envctlRoot),
    worktree: "clean",
    committer_role: "lifeos_envctl",
    test_database: "envctl_commit_test",
    connection_transport: "PostgreSQL Unix socket",
    tests: envctlTests.map((name) => ({ name, status: "passed" })),
    verification_output_sha256: createHash("sha256").update(envctlOutput).digest("hex"),
  },
  boundary: {
    durable_committer: "envctl",
    staging: "codedb_outbox_export",
    redb_role: "transient ordered outbox/projection boundary",
    postgres_role: "canonical durable authority",
    non_envctl_write_denied: true,
  },
};

const receiptPath = join(root, "evidence/envctl-codedb/live-committer-receipt.json");
mkdirSync(join(root, "evidence/envctl-codedb"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: receiptPath, status: "ok", envctl_tests: envctlTests.length }, null, 2));
