import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql";
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");

if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  console.error("LIFEOS_DATABASE_URL must be a PostgreSQL connection URL.");
  process.exit(1);
}

if (!psql) {
  console.error("No psql executable found. Set LIFEOS_PSQL to the active PostgreSQL frontdoor.");
  process.exit(1);
}

const migrationFiles = (await readdir(resolve("crates/lifeos-core/migrations")))
  .filter((entry) => /^\d+_.+\.sql$/.test(entry))
  .sort();
const expectedMigrations = migrationFiles.length;
const expectedLatestMigration = Math.max(
  ...migrationFiles.map((entry) => Number(entry.match(/^\d+/)?.[0] ?? 0)),
);
const supportedRuVectorVersions = new Set(["0.3.0", "0.3.1"]);
const approvedRuVectorLibrary = "/home/flexnetos/meta/var/lib/ruvector/ext/ruvector";

const sql = `
WITH ruvector_extension AS (
  SELECT jsonb_build_object('version', extension.extversion, 'schema', namespace.nspname) AS value
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'ruvector'
), migrations AS (
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'latest_version', MAX(version),
    'versions', COALESCE(jsonb_agg(version ORDER BY version), '[]'::jsonb)
  ) AS value
  FROM lifeos_runtime._sqlx_migrations
), witness_entries AS (
  SELECT entry.*, lag(entry.entry_shake256) OVER (
    PARTITION BY entry.chain_id ORDER BY entry.sequence
  ) AS expected_previous
  FROM lifeos_agent.witness_entry entry
), witness AS (
  SELECT jsonb_build_object(
    'chain_count', (SELECT count(*) FROM lifeos_agent.witness_chain),
    'entry_count', (SELECT count(*) FROM lifeos_agent.witness_entry),
    'append_witness', to_regprocedure('lifeos_agent.append_witness(uuid,jsonb,bytea)') IS NOT NULL,
    'shake256', to_regprocedure('extensions.ruvector_shake256_256(bytea)') IS NOT NULL,
    'broken_links', (SELECT count(*) FROM witness_entries
      WHERE sequence > 1 AND previous_shake256 IS DISTINCT FROM expected_previous),
    'head_mismatches', (SELECT count(*) FROM lifeos_agent.witness_chain chain
      WHERE chain.head_sequence <> COALESCE((SELECT max(entry.sequence)
        FROM lifeos_agent.witness_entry entry WHERE entry.chain_id = chain.chain_id), 0)
        OR (chain.head_sequence > 0 AND chain.head_shake256 IS DISTINCT FROM (SELECT entry.entry_shake256
          FROM lifeos_agent.witness_entry entry
          WHERE entry.chain_id = chain.chain_id ORDER BY entry.sequence DESC LIMIT 1)))
  ) AS value
)
SELECT jsonb_build_object(
  'server_version', current_setting('server_version'),
  'search_path', current_setting('search_path'),
  'ruvector', (SELECT value FROM ruvector_extension),
  'migrations', (SELECT value FROM migrations),
  'witness', (SELECT value FROM witness),
  'compatibility', jsonb_build_object(
    'vector_avg_final', extensions.vector_avg_final(
      ARRAY[4.0::real, 6.0::real], 2
    ) = ARRAY[2.0::real, 3.0::real],
    'auto_tune_bridge',
      to_regprocedure('extensions.ruvector_auto_tune(text,text,real[])') IS NOT NULL
      AND to_regprocedure('extensions.ruvector_auto_tune_jsonb_native(text,text,jsonb)') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM pg_proc function_row
        JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
        JOIN pg_language language_row ON language_row.oid = function_row.prolang
        WHERE namespace_row.nspname = 'extensions'
          AND function_row.proname = 'ruvector_auto_tune'
          AND language_row.lanname = 'sql'
      ),
    'trajectory_writer',
      to_regprocedure('extensions.ruvector_record_trajectory(text,real[],bigint[],bigint,integer,integer)') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM pg_proc function_row
        JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
        JOIN pg_language language_row ON language_row.oid = function_row.prolang
        WHERE namespace_row.nspname = 'extensions'
          AND function_row.proname = 'ruvector_record_trajectory'
          AND language_row.lanname = 'c'
      ),
    'learning_library_paths', (
      SELECT COUNT(*) = 7 AND bool_and(function_row.probin = '${approvedRuVectorLibrary}')
      FROM pg_proc function_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
      WHERE namespace_row.nspname = 'extensions'
        AND function_row.proname = ANY (ARRAY[
          'ruvector_enable_learning',
          'ruvector_record_feedback',
          'ruvector_learning_stats',
          'ruvector_extract_patterns',
          'ruvector_get_search_params',
          'ruvector_clear_learning',
          'ruvector_record_trajectory'
        ])
    )
  ),
  'required_schemas', jsonb_build_array(
    to_regnamespace('lifeos_blob') IS NOT NULL,
    to_regnamespace('lifeos_security') IS NOT NULL,
    to_regnamespace('lifeos_runtime') IS NOT NULL,
    to_regnamespace('lifeos_semantic') IS NOT NULL,
    to_regnamespace('lifeos_agentdb') IS NOT NULL
  )
);`;

const child = Bun.spawn(
  [psql, "--no-psqlrc", "--no-align", "--tuples-only", databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql],
  { stdout: "pipe", stderr: "pipe" }
);
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
]);

if (exitCode !== 0) {
  console.error(stderr.trim() || "PostgreSQL/RuVector verification query failed.");
  process.exit(exitCode || 1);
}

let receipt;
try {
  receipt = JSON.parse(stdout.trim());
} catch {
  console.error("PostgreSQL/RuVector verification returned invalid JSON.");
  process.exit(1);
}

const failures = [];
if (receipt.ruvector?.schema !== "extensions") failures.push("ruvector is not installed in schema extensions");
if (!supportedRuVectorVersions.has(receipt.ruvector?.version)) {
  failures.push(`unsupported ruvector version ${receipt.ruvector?.version ?? "none"}`);
}
if (receipt.migrations?.count !== expectedMigrations) {
  failures.push(`expected ${expectedMigrations} migrations, found ${receipt.migrations?.count ?? "none"}`);
}
if (receipt.migrations?.latest_version !== expectedLatestMigration) {
  failures.push(`expected latest migration ${expectedLatestMigration}, found ${receipt.migrations?.latest_version ?? "none"}`);
}
if (!Array.isArray(receipt.required_schemas) || receipt.required_schemas.some((present) => !present)) {
  failures.push("one or more required LifeOS schemas are absent");
}
if (!receipt.witness?.append_witness || !receipt.witness?.shake256) {
  failures.push("the canonical witness append or SHAKE-256 function is absent");
}
if (receipt.witness?.broken_links !== 0 || receipt.witness?.head_mismatches !== 0) {
  failures.push("the live witness chain has broken links or head mismatches");
}
if (receipt.compatibility?.vector_avg_final !== true) {
  failures.push("RuVector vector_avg_final compatibility repair is not active");
}
if (receipt.compatibility?.auto_tune_bridge !== true) {
  failures.push("RuVector auto_tune real[] to native JSONB bridge is not active");
}
if (receipt.compatibility?.trajectory_writer !== true) {
  failures.push("RuVector trajectory writer binding is not active");
}
if (receipt.compatibility?.learning_library_paths !== true) {
  failures.push(`RuVector learning bindings are not normalized to ${approvedRuVectorLibrary}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", failures, receipt }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      server_version: receipt.server_version,
      search_path: receipt.search_path,
      ruvector: receipt.ruvector,
      migrations: receipt.migrations,
      witness: receipt.witness,
      compatibility: receipt.compatibility,
      required_schemas: receipt.required_schemas,
    },
    null,
    2
  )
);
