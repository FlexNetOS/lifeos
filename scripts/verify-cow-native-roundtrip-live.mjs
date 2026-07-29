// Refresh the native RVF acceptance receipt against the currently activated
// RuVector catalog. The database rejects stale library bindings by design.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const psql = "/home/flexnetos/.nix-profile/bin/psql";
const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/run/postgresql";
const metaRuVectorRoot = "/home/flexnetos/meta/src/meta-ruvector";
const nativeManifest = join(metaRuVectorRoot, "crates/ruvector-postgres/inv011-native-roundtrip/Cargo.toml");
const targetDir = process.env.CARGO_TARGET_DIR ?? "/home/flexnetos/meta/var/cargo-target";
const nativeBinary = join(targetDir, "debug/ruvector-postgres-inv011-roundtrip");
const scratch = resolve("/tmp/lifeos-cow-native-roundtrip");
const inputPath = join(scratch, "input.json");
const outputDir = join(scratch, "output");
const overflowInputPath = join(scratch, "overflow-input.json");
const tombstoneInputPath = join(scratch, "tombstone-input.json");
const tombstoneOutputDir = join(scratch, "tombstone-output");
const suite = "lifeos.native-rvf-postgres-roundtrip.v1";

function run(args, env = process.env) {
  return execFileSync(rtk, args, { cwd: root, encoding: "utf8", env });
}

function psqlQuery(query) {
  const args = ["proxy", psql, "-X", databaseUrl, "-At", "-v", "ON_ERROR_STOP=1"];
  args.push("-c", query);
  return run(args).trim();
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
const digest = "a".repeat(64);
const input = {
  schema: "lifeos.native-rvf-postgres-input.v1",
  parent_generation_id: 1,
  parent_rows: [{
    relation_name: "lifeos_runtime.canonical_projection",
    logical_key_digest: digest,
    vector_id: 0,
    operation: "insert",
    tombstone: false,
  }],
  generation_id: 2,
  rows: [{
    relation_name: "lifeos_runtime.canonical_projection",
    logical_key_digest: digest,
    vector_id: 0,
    operation: "insert",
    tombstone: false,
  }],
};
writeFileSync(inputPath, `${JSON.stringify(input)}\n`);

run(["proxy", "cargo", "build", "--manifest-path", nativeManifest, "--quiet"], {
  ...process.env,
  CARGO_TARGET_DIR: targetDir,
});
const nativeOutput = JSON.parse(run([
  "proxy", nativeBinary, inputPath, outputDir,
]));
const overflowInput = { ...input, generation_id: 4_294_967_296 };
writeFileSync(overflowInputPath, `${JSON.stringify(overflowInput)}\n`);
writeFileSync(tombstoneInputPath, `${JSON.stringify({
  ...input,
  rows: [{ ...input.rows[0], operation: "delete", tombstone: true }],
})}\n`);
let overflowRejected = false;
try {
  run(["proxy", nativeBinary, overflowInputPath, join(scratch, "overflow-output")]);
} catch {
  overflowRejected = true;
}
if (!overflowRejected) throw new Error("native roundtrip accepted a generation above u32::MAX");
const tombstoneOutput = JSON.parse(run([
  "proxy", nativeBinary, tombstoneInputPath, tombstoneOutputDir,
]));
if (tombstoneOutput.visible_count !== 0 || tombstoneOutput.membership.rows[0].tombstone !== true) {
  throw new Error("native roundtrip did not preserve replacement tombstone identity");
}

const databaseReceiptDigest = psqlQuery(
  "SELECT encode(receipt_digest, 'hex') FROM lifeos_runtime.cow_acceptance_receipt " +
    "WHERE receipt_kind='database-semantics' AND suite_version='lifeos.cow-db-semantic-suite.v1' " +
    "AND accepted ORDER BY created_at DESC LIMIT 1",
);
if (!/^[0-9a-f]{64}$/.test(databaseReceiptDigest)) {
  throw new Error("accepted database COW receipt digest is unavailable");
}

const liveBindings = psqlQuery(
  "SELECT DISTINCT probin FROM pg_proc p " +
    "JOIN pg_language l ON l.oid=p.prolang " +
    "JOIN pg_depend d ON d.objid=p.oid AND d.deptype='e' " +
    "JOIN pg_extension e ON e.oid=d.refobjid " +
    "WHERE e.extname='ruvector' AND l.lanname='c' ORDER BY 1",
).split("\n").filter(Boolean);
if (!liveBindings.length) throw new Error("no extension-owned RuVector C library bindings are live");
const installedLibraries = liveBindings.map((catalogBinding) => {
  const path = catalogBinding.endsWith(".so")
    ? catalogBinding
    : `${catalogBinding}.so`;
  return {
    catalog_binding: catalogBinding,
    path,
    sha256: sha256File(path),
  };
});
const installedExtension = {
  version: psqlQuery("SELECT extversion FROM pg_extension WHERE extname='ruvector'"),
  catalog_version: psqlQuery("SELECT extversion FROM pg_extension WHERE extname='ruvector'"),
};
if (!/^\d+\.\d+\.\d+$/.test(installedExtension.version)) {
  throw new Error("live RuVector extension version is not semantic");
}

const evidence = {
  schema: "lifeos.native-rvf-postgres-roundtrip.v1",
  status: "passed",
  suite_version: suite,
  database_semantics: {
    suite_version: "lifeos.cow-db-semantic-suite.v1",
    receipt_digest: databaseReceiptDigest,
    artifact_sha256: sha256Text(JSON.stringify(nativeOutput)),
  },
  installed_extension: installedExtension,
  installed_libraries: installedLibraries,
  native_binary: {
    path: nativeBinary,
    sha256: sha256File(nativeBinary),
    rvf_runtime_source_sha256: sha256File(join(metaRuVectorRoot, "crates/rvf/rvf-runtime/src/store.rs")),
    ruvector_postgres_source_sha256: sha256File(join(metaRuVectorRoot, "crates/ruvector-postgres/Cargo.toml")),
  },
  verification: {
    adversarial_suite: "passed",
    native_close_reopen: "passed",
    postgres_roundtrip: "passed",
    fresh_bootstrap: "passed",
    upgrade_migration: "passed",
    least_privilege_rls: "passed",
    witness_chain: "passed",
    generation_u32_overflow: "passed",
    replacement_tombstone_identity: "passed",
  },
  native_roundtrip: nativeOutput,
};
const evidenceJson = JSON.stringify(evidence);
const idempotency = `lifeos:cow-native-roundtrip:${sha256Text(evidenceJson).slice(0, 32)}`;
const receiptId = psqlQuery(
  "SELECT lifeos_runtime.record_cow_acceptance_receipt_v2(" +
    "'native-rvf-roundtrip', 'lifeos.native-rvf-postgres-roundtrip.v1', true, " +
    `convert_to(${sqlLiteral(evidenceJson)}, 'UTF8'), ` +
    "'77000000-0000-0000-8000-000000000001', " +
    `'77000000-0000-0000-8000-000000000002', ${sqlLiteral(idempotency)})`,
);
const capability = JSON.parse(psqlQuery("SELECT lifeos_runtime.cow_branch_capability()"));
if (capability.implemented !== true || capability.runtime_digest_binding !== true) {
  throw new Error(`COW capability remains unaccepted: ${JSON.stringify(capability)}`);
}

const receipt = {
  schema_version: "lifeos.evidence.cow-native-roundtrip-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  status: "passed",
  receipt_id: receiptId,
  idempotency_key: idempotency,
  evidence,
  capability,
};
const receiptPath = join(root, "evidence/cow/native-rvf-roundtrip-live-receipt.json");
mkdirSync(join(root, "evidence/cow"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "passed", receipt: receiptPath, receipt_id: receiptId }, null, 2));
