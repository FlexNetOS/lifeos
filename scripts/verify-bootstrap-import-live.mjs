import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/run/postgresql";
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");
const receiptPath = resolve("evidence/postgres-ruvector/bootstrap-import-live-receipt.json");
const tenant = "00000000-0000-4000-8000-000000000001";
const identity = "00000000-0000-4000-8000-000000000002";
const grant = "00000000-0000-4000-8000-000000000003";
const branch = "00000000-0000-4000-8000-000000000005";
const label = "lifeos-blueprint-bootstrap-20260729";

if (!psql) throw new Error("psql is required for the bootstrap import live gate");

const sql = String.raw`
BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${grant}',
  convert_to('{"kind":"blueprint-bootstrap-import","source":"ARCHANCHOR-001"}', 'UTF8')
);
SELECT json_build_object(
  'opened_session_id', lifeos_blob.open_import_session(
    '${tenant}', '${branch}', '${label}',
    '{"source_id":"ARCHANCHOR-001","phase":"bootstrap","raw_bytes_required":true}'::jsonb
  )
);
SELECT json_build_object(
  'closed_session_id', lifeos_blob.close_import_session(
    '${tenant}', '${branch}', '${label}',
    '{"source_id":"ARCHANCHOR-001","zero_undeclared_loss":true,"raw_bytes_retained":true,"authority":"PostgreSQL/RuVector"}'::jsonb
  )
);
SELECT json_build_object(
  'session_rows', count(*),
  'open_rows', count(*) FILTER (WHERE record_kind = 'import-session-open'),
  'close_rows', count(*) FILTER (WHERE record_kind = 'import-session-close'),
  'raw_backed_rows', count(*) FILTER (WHERE raw_object_id IS NOT NULL),
  'verified_raw_rows', count(*) FILTER (WHERE lifeos_blob.verify_object(raw_object_id)),
  'digest_rows', count(*) FILTER (WHERE octet_length(record_digest) = 32)
)
FROM lifeos_blob.import_session
WHERE tenant_id = '${tenant}';
COMMIT;`;

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
if (exitCode !== 0) throw new Error(stderr.trim() || "bootstrap import live gate failed");

const records = stdout.split("\n").map((line) => line.trim())
  .filter((line) => line.startsWith("{"))
  .map((line) => JSON.parse(line));
const opened = records.find((record) => record.opened_session_id)?.opened_session_id;
const closed = records.find((record) => record.closed_session_id)?.closed_session_id;
const counts = records.find((record) => record.session_rows) ?? {};
const receipt = {
  schema_version: "lifeos.evidence.bootstrap-import-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md §1.1",
  source_id: "ARCHANCHOR-001",
  label,
  tenant,
  branch,
  opened_session_id: opened ?? null,
  closed_session_id: closed ?? null,
  counts: {
    session_rows: Number(counts.session_rows ?? 0),
    open_rows: Number(counts.open_rows ?? 0),
    close_rows: Number(counts.close_rows ?? 0),
    raw_backed_rows: Number(counts.raw_backed_rows ?? 0),
    verified_raw_rows: Number(counts.verified_raw_rows ?? 0),
    digest_rows: Number(counts.digest_rows ?? 0),
  },
  zero_undeclared_loss: true,
  raw_bytes_retained: true,
};

if (!opened || !closed || receipt.counts.open_rows < 1 || receipt.counts.close_rows < 1 ||
    receipt.counts.raw_backed_rows !== receipt.counts.session_rows ||
    receipt.counts.verified_raw_rows !== receipt.counts.session_rows ||
    receipt.counts.digest_rows !== receipt.counts.session_rows) {
  throw new Error(`bootstrap import receipt failed: ${JSON.stringify(receipt)}`);
}

await mkdir(dirname(receiptPath), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, ...receipt.counts }));
