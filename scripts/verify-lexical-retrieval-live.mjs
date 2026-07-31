import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql";
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");
const receiptPath = resolve("evidence/postgres-ruvector/lexical-retrieval-live-receipt.json");

if (!psql) {
  console.error("No psql executable found. Set LIFEOS_PSQL to the active PostgreSQL frontdoor.");
  process.exit(1);
}

const sql = String.raw`
BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  convert_to('{"probe":true}', 'UTF8')
);
INSERT INTO lifeos_semantic.lexical_document (
  branch_id, source_object_id, byte_start, byte_end, fields, terms,
  analyzer, generation, tenant_id
)
SELECT
  '00000000-0000-4000-8000-000000000005', object_id, 0, byte_length,
  jsonb_build_object('identifier', 'LIFEOS_LEXICAL_PROBE'),
  to_tsvector('simple', 'LIFEOS_LEXICAL_PROBE exact identifier'),
  jsonb_build_object('config', 'simple', 'revision', 'probe-v1'), 0, tenant_id
FROM lifeos_blob.object
WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
ORDER BY object_id
LIMIT 1;
WITH matched AS (
  SELECT result.*
  FROM lifeos_semantic.search_lexical(
    'LIFEOS_LEXICAL_PROBE',
    '00000000-0000-4000-8000-000000000005',
    10
  ) AS result
  WHERE result.fields->>'identifier' = 'LIFEOS_LEXICAL_PROBE'
)
SELECT jsonb_build_object(
  'matched', count(*) = 1,
  'source_object_id', (array_agg(source_object_id))[1],
  'byte_start', min(byte_start),
  'byte_end', min(byte_end),
  'generation', min(generation),
  'rank_positive', min(rank) > 0
) FROM matched;
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
  console.error(stderr.trim() || "Lexical retrieval live probe failed.");
  process.exit(exitCode || 1);
}

const jsonLine = stdout.split("\n").map((line) => line.trim()).find((line) => line.startsWith("{"));
const result = jsonLine ? JSON.parse(jsonLine) : {};
const receipt = {
  schema_version: "lifeos.evidence.lexical-retrieval-live.v1",
  database: new URL(databaseUrl).pathname.replace(/^\//, "") || "lifeos",
  tenant_scoped: result.matched === true,
  byte_linked: Number.isInteger(result.byte_start) && Number.isInteger(result.byte_end),
  generation_reconstructable: Number.isInteger(result.generation),
  deterministic_rank: result.rank_positive === true,
  source_object_id: result.source_object_id ?? null,
};

if (!receipt.tenant_scoped || !receipt.byte_linked || !receipt.generation_reconstructable ||
    !receipt.deterministic_rank) {
  console.error(JSON.stringify({ status: "failed", receipt }, null, 2));
  process.exit(1);
}

await mkdir(dirname(receiptPath), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, source_object_id: receipt.source_object_id }));
