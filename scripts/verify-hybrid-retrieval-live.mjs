import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/run/postgresql";
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");
const receiptPath = resolve("evidence/postgres-ruvector/hybrid-retrieval-live-receipt.json");
const queryVector = "'[' || array_to_string(array_fill(1.0::real, ARRAY[384]), ',') || ']'";

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
SET LOCAL lifeos.tenant_id='00000000-0000-4000-8000-000000000001';
SELECT lifeos_semantic.append_embedding_projection(
  'LIFEOS_HYBRID_PROBE', 'hybrid-probe', 384,
  decode(repeat('00000000', 384), 'hex'),
  ${queryVector}, jsonb_build_object('probe', true),
  extract(epoch FROM clock_timestamp())::bigint, false
);
INSERT INTO lifeos_semantic.lexical_document (
  branch_id, source_object_id, byte_start, byte_end, fields, terms,
  analyzer, generation, tenant_id
)
SELECT
  '00000000-0000-4000-8000-000000000005', embedding.source_object_id, 0, embedding.byte_end,
  jsonb_build_object('identifier', 'LIFEOS_HYBRID_PROBE'),
  to_tsvector('simple', 'LIFEOS HYBRID PROBE exact identifier'),
  jsonb_build_object('config', 'simple', 'revision', 'probe-v1'), 0,
  '00000000-0000-4000-8000-000000000001'
FROM lifeos_semantic.embedding embedding
WHERE embedding.metadata->>'logical_id' = 'LIFEOS_HYBRID_PROBE'
ORDER BY embedding.generation DESC, embedding.embedding_id DESC
LIMIT 1;
CREATE TEMP TABLE hybrid_probe_results ON COMMIT DROP AS
SELECT result.*
  FROM lifeos_semantic.hybrid_search(
    'LIFEOS HYBRID PROBE', (${queryVector})::extensions.ruvector,
    '00000000-0000-4000-8000-000000000005', 10
  ) AS result;
WITH results AS (
  SELECT result.* FROM hybrid_probe_results AS result
), summary AS (
  SELECT count(*) AS returned, (array_agg(query_id))[1] AS query_id,
         bool_or(lexical_rank IS NOT NULL) AS lexical_present,
         bool_or(dense_rank IS NOT NULL) AS dense_present,
         min(fused_rank) > 0 AS fused_positive
  FROM results
)
SELECT jsonb_build_object(
  'returned', summary.returned > 0,
  'query_id', summary.query_id,
  'lexical_present', summary.lexical_present,
  'dense_present', summary.dense_present,
  'fused_positive', summary.fused_positive,
  'ledger_query', EXISTS (
    SELECT 1 FROM lifeos_semantic.retrieval_query query_row
    WHERE query_row.query_id = summary.query_id
  ),
  'ledger_results', (
    SELECT count(*) FROM lifeos_semantic.retrieval_result result_row
    WHERE result_row.query_id = summary.query_id
  ),
  'tenant', lifeos_security.current_tenant(),
  'visible_queries', (SELECT count(*) FROM lifeos_semantic.retrieval_query),
  'embedding_rows', (
    SELECT count(*) FROM lifeos_semantic.embedding
    WHERE metadata->>'logical_id' = 'LIFEOS_HYBRID_PROBE'
  ),
  'embedding_source_tenant', (
    SELECT source.tenant_id
    FROM lifeos_semantic.embedding embedding
    JOIN lifeos_blob.object source ON source.object_id = embedding.source_object_id
    WHERE embedding.metadata->>'logical_id' = 'LIFEOS_HYBRID_PROBE'
    ORDER BY embedding.generation DESC, embedding.embedding_id DESC
    LIMIT 1
  ),
  'visible_lexical', (SELECT count(*) FROM lifeos_semantic.lexical_document),
  'lexical_direct', (
    SELECT count(*) FROM lifeos_semantic.search_lexical(
      'LIFEOS HYBRID PROBE', '00000000-0000-4000-8000-000000000005', 10
    )
  ),
  'lexical_rows', (
    SELECT count(*) FROM lifeos_semantic.lexical_document
    WHERE fields->>'identifier' = 'LIFEOS_HYBRID_PROBE'
  ),
  'lexical_term_match', (
    SELECT count(*) FROM lifeos_semantic.lexical_document
    WHERE fields->>'identifier' = 'LIFEOS_HYBRID_PROBE'
      AND terms @@ plainto_tsquery('simple', 'LIFEOS HYBRID PROBE')
  ),
  'tenant', lifeos_security.current_tenant(),
  'visible_queries', (SELECT count(*) FROM lifeos_semantic.retrieval_query)
) FROM summary;
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
  console.error(stderr.trim() || "Hybrid retrieval live probe failed.");
  process.exit(exitCode || 1);
}

const jsonLine = stdout.split("\n").map((line) => line.trim()).find((line) => line.startsWith("{"));
const result = jsonLine ? JSON.parse(jsonLine) : {};
const receipt = {
  schema_version: "lifeos.evidence.hybrid-retrieval-live.v1",
  database: new URL(databaseUrl).pathname.replace(/^\//, "") || "lifeos",
  returned: result.returned === true,
  lexical_present: result.lexical_present === true,
  dense_present: result.dense_present === true,
  fused_positive: result.fused_positive === true,
  ledger_query: result.ledger_query === true,
  ledger_results: Number(result.ledger_results ?? 0),
  lexical_direct: Number(result.lexical_direct ?? 0),
  lexical_rows: Number(result.lexical_rows ?? 0),
  lexical_term_match: Number(result.lexical_term_match ?? 0),
  tenant: result.tenant ?? null,
  visible_queries: Number(result.visible_queries ?? 0),
  embedding_rows: Number(result.embedding_rows ?? 0),
  embedding_source_tenant: result.embedding_source_tenant ?? null,
  visible_lexical: Number(result.visible_lexical ?? 0),
  query_id: result.query_id ?? null,
};

if (!receipt.returned || !receipt.lexical_present || !receipt.dense_present ||
    !receipt.fused_positive || !receipt.ledger_query || receipt.ledger_results < 1 ||
    receipt.lexical_direct < 1) {
  console.error(JSON.stringify({ status: "failed", receipt }, null, 2));
  process.exit(1);
}

await mkdir(dirname(receiptPath), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, query_id: receipt.query_id }));
