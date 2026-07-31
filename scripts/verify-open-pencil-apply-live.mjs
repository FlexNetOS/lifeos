import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql";
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");
const receiptPath = resolve("evidence/postgres-ruvector/open-pencil-apply-live-receipt.json");
const rtk = process.env.LIFEOS_RTK_BIN ?? "/home/flexnetos/.nix-profile/bin/rtk";
const commitConn = process.env.ENVCTL_PG_CONN ??
  "host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql dbname=lifeos user=flexnetos";
const source = "<script>lifeos</script>\n";
const sourceBytes = Buffer.from(source, "utf8");
const sourceBase64 = sourceBytes.toString("base64");
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");

if (!psql) {
  console.error("No psql executable found. Set LIFEOS_PSQL to the active PostgreSQL frontdoor.");
  process.exit(1);
}

const run = (args, env = process.env) => execFileSync(rtk, args, {
  cwd: resolve("."), encoding: "utf8", env,
});

const request = `jsonb_build_object(
  'idempotency_key', 'archbp-open-pencil-probe-v1',
  'relative_path', 'src/Probe.svelte',
  'raw_bytes_base64', '${sourceBase64}',
  'source_sha256', '${sourceSha256}',
  'media_type', 'text/html; charset=utf-8'
)`;
const sql = String.raw`
BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  convert_to('{"probe":true,"kind":"open-pencil-apply"}', 'UTF8')
);
SELECT lifeos_runtime.apply_open_pencil(${request});
SELECT lifeos_runtime.apply_open_pencil(${request});
DO $probe$
BEGIN
  BEGIN
    PERFORM lifeos_runtime.apply_open_pencil(jsonb_set(${request}, '{source_sha256}', to_jsonb(repeat('0', 64)::text)));
    RAISE EXCEPTION 'expected OpenPencil digest rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'OpenPencil Apply source digest does not match raw bytes' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM lifeos_runtime.apply_open_pencil(jsonb_set(${request}, '{relative_path}', to_jsonb('../escape.svelte'::text)));
    RAISE EXCEPTION 'expected OpenPencil path rejection';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'OpenPencil Apply path must be clean and relative' THEN RAISE; END IF;
  END;
END
$probe$;
SELECT jsonb_build_object(
  'ledger', EXISTS (
    SELECT 1 FROM lifeos_runtime.open_pencil_apply
    WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
      AND idempotency_key = 'archbp-open-pencil-probe-v1'
      AND source_sha256 = '${sourceSha256}'
  ),
  'projection', EXISTS (
    SELECT 1 FROM lifeos_runtime.ui_projection
    WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
      AND projection_key = 'open-pencil/src/Probe.svelte'
      AND payload_json->>'idempotency_key' = 'archbp-open-pencil-probe-v1'
  ),
  'round_trip', lifeos_blob.load_object_bytes(ledger.object_id) = decode('${sourceBase64}', 'base64'),
  'source_byte_length', octet_length(decode('${sourceBase64}', 'base64')),
  'stored_byte_length', octet_length(lifeos_blob.load_object_bytes(ledger.object_id)),
  'verified', lifeos_blob.verify_object(ledger.object_id)
)
FROM lifeos_runtime.open_pencil_apply ledger
WHERE ledger.tenant_id = '00000000-0000-4000-8000-000000000001'
  AND ledger.idempotency_key = 'archbp-open-pencil-probe-v1';
ROLLBACK;`;

const child = Bun.spawn(
  [psql, "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", databaseUrl,
    "-v", "ON_ERROR_STOP=1", "-c", sql],
  { stdout: "pipe", stderr: "pipe" },
);
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
]);

if (exitCode !== 0) {
  console.error(stderr.trim() || "OpenPencil Apply live probe failed.");
  process.exit(exitCode || 1);
}

const jsonLines = stdout.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("{"));
const first = jsonLines.at(-3) ? JSON.parse(jsonLines.at(-3)) : {};
const second = jsonLines.at(-2) ? JSON.parse(jsonLines.at(-2)) : {};
const result = jsonLines.at(-1) ? JSON.parse(jsonLines.at(-1)) : {};
const receipt = {
  schema_version: "lifeos.evidence.open-pencil-apply-live.v1",
  database: new URL(databaseUrl).pathname.replace(/^\//, "") || "lifeos",
  applied: first.status === "applied",
  idempotent: second.status === "already_applied" && second.object_id === first.object_id,
  ledger: result.ledger === true,
  projection: result.projection === true,
  round_trip: result.round_trip === true,
  verified: result.verified === true,
  source_byte_length: Number(result.source_byte_length ?? 0),
  stored_byte_length: Number(result.stored_byte_length ?? 0),
  object_id: first.object_id ?? null,
  rejected_bad_digest: true,
  rejected_bad_path: true,
};

// Exercise the actual export → envctl worker boundary with a fresh sequence.
// The SQL setup mirrors CodeDB's versioned `codedb_outbox_export` contract;
// the worker then binds the LifeOS runtime context and invokes the durable
// Apply procedure inside its acknowledged PostgreSQL transaction.
run(["proxy", "psql", commitConn, "-v", "ON_ERROR_STOP=1", "-c",
  "CREATE TABLE IF NOT EXISTS codedb_outbox_export (seq bigint primary key, contract_version text not null, blob_sha256 text not null, job jsonb not null, synced_at timestamptz not null default now()); CREATE TABLE IF NOT EXISTS lifeos_runtime.envctl_committed_records (seq bigint primary key, blob_sha256 text not null, contract_version text not null, job jsonb not null, commit_txid text not null, commit_lsn text not null, generation bigint not null, witness text not null, committed_at timestamptz not null default now());"]);
const sequence = BigInt(run([
  "proxy", "psql", commitConn, "-Atqc",
  "SELECT GREATEST(coalesce((SELECT max(seq) FROM codedb_outbox_export),0), coalesce((SELECT max(seq) FROM lifeos_runtime.envctl_committed_records),0)) + 1",
]).trim() || "0");
const setupSql = `
CREATE TABLE IF NOT EXISTS lifeos_runtime.envctl_committed_records (seq bigint primary key, blob_sha256 text not null, contract_version text not null, job jsonb not null, commit_txid text not null, commit_lsn text not null, generation bigint not null, witness text not null, committed_at timestamptz not null default now());
CREATE TABLE IF NOT EXISTS lifeos_runtime.envctl_reconciliation_cursor (id boolean primary key default true check (id), acknowledged_seq bigint not null, generation bigint not null, last_witness text not null);
INSERT INTO lifeos_runtime.envctl_reconciliation_cursor VALUES (true,0,0,'') ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS codedb_outbox_export (seq bigint primary key, contract_version text not null, blob_sha256 text not null, job jsonb not null, synced_at timestamptz not null default now());
GRANT USAGE ON SCHEMA lifeos_runtime TO lifeos_envctl;
GRANT SELECT, INSERT ON lifeos_runtime.envctl_committed_records TO lifeos_envctl;
GRANT SELECT, UPDATE ON lifeos_runtime.envctl_reconciliation_cursor TO lifeos_envctl;
GRANT SELECT ON codedb_outbox_export TO lifeos_envctl;
WITH payload AS (SELECT '${sourceBase64}'::text AS b64, '${sourceSha256}'::text AS sha)
INSERT INTO codedb_outbox_export (seq, contract_version, blob_sha256, job)
SELECT ${sequence.toString()}, 'codedb.outbox-export.v0', sha,
  jsonb_build_object('schema_version','codedb.embedding-job.v0','blob_sha256',sha,
    'relative_path','src/Probe.svelte','model_name','open-pencil-source',
    'model_revision','lifeos-open-pencil-v1','payload_digest',sha,
    'open_pencil_apply',jsonb_build_object('idempotency_key','archbp-open-pencil-envctl-' || ${sequence.toString()},
      'relative_path','src/Probe.svelte','source_sha256',sha,'raw_bytes_base64',b64,
      'media_type','text/html; charset=utf-8'))
FROM payload ON CONFLICT (seq) DO NOTHING;`;
run(["proxy", "psql", commitConn, "-v", "ON_ERROR_STOP=1", "-c", setupSql]);
const workerEnv = {
  ...process.env,
  LIFEOS_RUNTIME_TENANT_ID: "00000000-0000-4000-8000-000000000001",
  LIFEOS_RUNTIME_IDENTITY_ID: "00000000-0000-4000-8000-000000000002",
  LIFEOS_RUNTIME_GRANT_ID: "00000000-0000-4000-8000-000000000003",
  LIFEOS_RUNTIME_BINDING_JSON: JSON.stringify({
    tenant_id: "00000000-0000-4000-8000-000000000001",
    identity_id: "00000000-0000-4000-8000-000000000002",
    grant_id: "00000000-0000-4000-8000-000000000003",
    purpose: "envctl-session-binding",
  }),
};
const workerOutput = run([
  "proxy", "cargo", "run", "--quiet", "--manifest-path",
  "../envctl/crates/commit-worker/Cargo.toml", "--bin", "envctl-commit-worker", "--",
  "drain", "--conn", commitConn, "--max-batch", "32",
], workerEnv);
const pipelineSql = `BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  convert_to('${workerEnv.LIFEOS_RUNTIME_BINDING_JSON}', 'UTF8'));
SELECT jsonb_build_object(
  'committed', EXISTS (SELECT 1 FROM lifeos_runtime.envctl_committed_records WHERE seq=${sequence.toString()}),
  'ledger', EXISTS (SELECT 1 FROM lifeos_runtime.open_pencil_apply WHERE idempotency_key='archbp-open-pencil-envctl-${sequence.toString()}'),
  'projection', EXISTS (SELECT 1 FROM lifeos_runtime.ui_projection WHERE projection_key='open-pencil/src/Probe.svelte'),
  'verified', lifeos_blob.verify_object((SELECT object_id FROM lifeos_runtime.open_pencil_apply WHERE idempotency_key='archbp-open-pencil-envctl-${sequence.toString()}')),
  'bytes', octet_length(lifeos_blob.load_object_bytes((SELECT object_id FROM lifeos_runtime.open_pencil_apply WHERE idempotency_key='archbp-open-pencil-envctl-${sequence.toString()}'))));
ROLLBACK;`;
const pipelineOutput = run(["proxy", "psql", commitConn, "-v", "ON_ERROR_STOP=1", "-Atqc", pipelineSql]);
const pipelineJson = pipelineOutput.split("\n").map((line) => line.trim()).find((line) => line.startsWith("{"));
const pipeline = pipelineJson ? JSON.parse(pipelineJson) : {};
receipt.envctl_pipeline = {
  committed: pipeline.committed === true,
  ledger: pipeline.ledger === true,
  projection: pipeline.projection === true,
  verified: pipeline.verified === true,
  byte_length: Number(pipeline.bytes ?? 0),
  sequence: sequence.toString(),
  worker_output_sha256: createHash("sha256").update(workerOutput).digest("hex"),
};

if (!receipt.applied || !receipt.idempotent || !receipt.ledger || !receipt.projection ||
    !receipt.round_trip || !receipt.verified || receipt.source_byte_length !== receipt.stored_byte_length ||
    !receipt.object_id?.match(/^[0-9a-f-]{36}$/) ||
    !receipt.envctl_pipeline.committed || !receipt.envctl_pipeline.ledger ||
    !receipt.envctl_pipeline.projection || !receipt.envctl_pipeline.verified ||
    receipt.envctl_pipeline.byte_length !== receipt.source_byte_length) {
  console.error(JSON.stringify({ status: "failed", receipt, stdout }, null, 2));
  process.exit(1);
}

await mkdir(dirname(receiptPath), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, object_id: receipt.object_id }));
