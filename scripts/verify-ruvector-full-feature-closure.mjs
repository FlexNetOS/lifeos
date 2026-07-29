import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const lifeosRoot = resolve(".");
const ruvectorRoot = "/home/flexnetos/meta/src/meta-ruvector";
const envctlRoot = "/home/flexnetos/meta/src/envctl";
const receiptPath = resolve("evidence/ruvector/full-feature-closure-receipt.json");
const expectedRuVectorCommit = "29b78bdce";
const expectedEnvctlCommit = "e67b99a5";
const profileRoot = "/home/flexnetos/.nix-profile";
const approvedSqlPath = `${profileRoot}/share/postgresql/extension/ruvector--0.3.1.sql`;
const approvedLibraryPath = `${profileRoot}/lib/ruvector.so`;

function runGit(root, ...args) {
  return execFileSync(rtk, ["proxy", "git", "-C", root, ...args], {
    cwd: lifeosRoot,
    encoding: "utf8",
  }).trim();
}

function runCargoTree() {
  return execFileSync(rtk, [
    "proxy", "cargo", "tree",
    "--manifest-path", "crates/ruvector-postgres/Cargo.toml",
    "--features", "pg17,all-features-v3",
    "--no-default-features", "-e", "features",
  ], { cwd: ruvectorRoot, encoding: "utf8" });
}

function runPsql(sql) {
  return execFileSync(rtk, [
    "proxy", "psql", "-X", "-q", "-h", "/home/flexnetos/meta/var/run/postgresql",
    "-d", "lifeos", "-At", "-c", sql,
  ], { cwd: lifeosRoot, encoding: "utf8" }).trim();
}

async function fileReceipt(path) {
  const bytes = await readFile(path);
  return {
    path,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const ruVectorCommit = runGit(ruvectorRoot, "rev-parse", "HEAD");
const envctlCommit = runGit(envctlRoot, "rev-parse", "HEAD");
const envctlBaseIsAncestor = runGit(envctlRoot, "merge-base", "--is-ancestor", expectedEnvctlCommit, envctlCommit) === "";
const tree = runCargoTree();
const treeLines = tree.split("\n").filter(Boolean);
const approvedSql = await readFile(approvedSqlPath, "utf8");
const sqlFunctionCount = (approvedSql.match(/CREATE\s+(?:OR REPLACE\s+)?FUNCTION/g) ?? []).length;
const invalidDefaultTokens = [...approvedSql.matchAll(/DEFAULT\s+(auto|dot|validation|parameter_change|JsonB\(|DEFAULT_CURVATURE)\b/g)].map((match) => match[0]);
const liveExtVersion = runPsql("SELECT extversion FROM pg_extension WHERE extname='ruvector'");
const liveOwnedFunctions = Number(runPsql("SELECT count(*) FROM pg_proc p JOIN pg_depend d ON d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e' JOIN pg_extension e ON e.oid=d.refobjid WHERE e.extname='ruvector' AND p.prokind='f'"));
const receipt = {
  schema_version: "lifeos.evidence.ruvector-full-feature-closure.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  features: ["pg17", "all-features-v3"],
  ruvector: {
    repository: ruvectorRoot,
    commit: ruVectorCommit,
    dependency_manifest: "crates/ruvector-postgres/Cargo.toml",
    lockfile: "crates/ruvector-postgres/Cargo.lock",
  },
  envctl: {
    repository: envctlRoot,
    commit: envctlCommit,
    vendored_manifest: "third_party/ruvector-postgres-2.0.5/Cargo.toml",
  },
  dependency_policy: {
    fastembed_features: ["hf-hub-rustls-tls", "image-models", "ort-load-dynamic"],
    openssl_sys_present: treeLines.some((line) => /openssl-sys/.test(line)),
    native_tls_present: treeLines.some((line) => /native-tls/.test(line)),
    rustls_present: treeLines.some((line) => /rustls/.test(line)),
  },
  approved_artifact: {
    profile_root: profileRoot,
    sql: await fileReceipt(approvedSqlPath),
    library: await fileReceipt(approvedLibraryPath),
    sql_function_count: sqlFunctionCount,
    invalid_default_tokens: invalidDefaultTokens,
  },
  live_activation: {
    database: "lifeos",
    extension_version: liveExtVersion,
    extension_owned_functions: liveOwnedFunctions,
  },
  cargo_tree_lines: treeLines.length,
};

const failures = [];
if (!ruVectorCommit.startsWith(expectedRuVectorCommit)) {
  failures.push(`RuVector is ${ruVectorCommit}; expected ${expectedRuVectorCommit}`);
}
if (!envctlBaseIsAncestor) {
  failures.push(`envctl is ${envctlCommit}; expected a descendant of ${expectedEnvctlCommit}`);
}
if (receipt.dependency_policy.openssl_sys_present) {
  failures.push("all-features-v3 dependency graph still contains openssl-sys");
}
if (receipt.dependency_policy.native_tls_present) {
  failures.push("all-features-v3 dependency graph still contains native-tls");
}
if (!receipt.dependency_policy.rustls_present) {
  failures.push("all-features-v3 dependency graph does not contain rustls");
}
if (sqlFunctionCount < 314) {
  failures.push(`approved full-feature SQL exposes ${sqlFunctionCount} functions; expected at least 314`);
}
if (invalidDefaultTokens.length) {
  failures.push(`approved full-feature SQL contains invalid default tokens: ${invalidDefaultTokens.join(", ")}`);
}
if (liveExtVersion !== "0.3.1") {
  failures.push(`live ruvector extension is ${liveExtVersion}; expected 0.3.1`);
}
if (liveOwnedFunctions < 314) {
  failures.push(`live ruvector extension owns ${liveOwnedFunctions} functions; expected at least 314`);
}

await mkdir(dirname(receiptPath), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures, receipt }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, commits: {
  ruvector: ruVectorCommit,
  envctl: envctlCommit,
}, dependency_policy: receipt.dependency_policy }, null, 2));
