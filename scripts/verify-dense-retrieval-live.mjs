import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/run/postgresql";
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");
const receiptPath = resolve("evidence/postgres-ruvector/dense-retrieval-live-receipt.json");

if (!psql) {
  console.error("No psql executable found. Set LIFEOS_PSQL to the active PostgreSQL frontdoor.");
  process.exit(1);
}

const query = "'[' || array_to_string(array_fill(1.0::real, ARRAY[384]), ',') || ']'";
const sql = String.raw`
BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  convert_to('{"probe":true}', 'UTF8')
);
SELECT lifeos_semantic.append_embedding_projection(
  'LIFEOS_DENSE_PROBE', 'dense-probe', 384,
  decode(repeat('00000000', 384), 'hex'),
  ${query}, jsonb_build_object('probe', true),
  extract(epoch FROM clock_timestamp())::bigint, false
);
SELECT jsonb_build_object(
  'matched', count(*) = 1,
  'source_object_id', (array_agg(source_object_id))[1],
  'byte_start', min(byte_start),
  'byte_end', min(byte_end),
  'generation', min(generation),
  'rank_positive', min(rank) > 0
)
FROM lifeos_semantic.search_embedding(
  (${query})::extensions.ruvector,
  '00000000-0000-4000-8000-000000000005', 10
);
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
  console.error(stderr.trim() || "Dense retrieval live probe failed.");
  process.exit(exitCode || 1);
}

const jsonLine = stdout.split("\n").map((line) => line.trim()).find((line) => line.startsWith("{"));
const result = jsonLine ? JSON.parse(jsonLine) : {};
const receipt = {
  schema_version: "lifeos.evidence.dense-retrieval-live.v1",
  database: new URL(databaseUrl).pathname.replace(/^\//, "") || "lifeos",
  dimension: 384,
  projection_populated: result.matched === true,
  byte_linked: Number.isInteger(result.byte_start) && Number.isInteger(result.byte_end),
  generation_reconstructable: Number.isInteger(result.generation),
  rank_positive: result.rank_positive === true,
  source_object_id: result.source_object_id ?? null,
};

if (!receipt.projection_populated || !receipt.byte_linked ||
    !receipt.generation_reconstructable || !receipt.rank_positive) {
  console.error(JSON.stringify({ status: "failed", receipt }, null, 2));
  process.exit(1);
}

await mkdir(dirname(receiptPath), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, source_object_id: receipt.source_object_id }));
