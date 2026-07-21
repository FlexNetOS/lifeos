import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL;
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");

if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  console.error("LIFEOS_DATABASE_URL must be a PostgreSQL connection URL.");
  process.exit(1);
}

if (!psql) {
  console.error("No psql executable found. Set LIFEOS_PSQL to the active PostgreSQL frontdoor.");
  process.exit(1);
}

const expectedMigrations = (await readdir(resolve("crates/lifeos-core/migrations")))
  .filter((entry) => /^\d+_.+\.sql$/.test(entry))
  .length;

const sql = `
WITH ruvector_extension AS (
  SELECT jsonb_build_object('version', extension.extversion, 'schema', namespace.nspname) AS value
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'ruvector'
), migrations AS (
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'versions', COALESCE(jsonb_agg(version ORDER BY version), '[]'::jsonb)
  ) AS value
  FROM lifeos_runtime._sqlx_migrations
)
SELECT jsonb_build_object(
  'server_version', current_setting('server_version'),
  'search_path', current_setting('search_path'),
  'ruvector', (SELECT value FROM ruvector_extension),
  'migrations', (SELECT value FROM migrations),
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
if (receipt.ruvector?.version !== "0.3.0") failures.push("ruvector version is not 0.3.0");
if (receipt.migrations?.count !== expectedMigrations) {
  failures.push(`expected ${expectedMigrations} migrations, found ${receipt.migrations?.count ?? "none"}`);
}
if (!Array.isArray(receipt.required_schemas) || receipt.required_schemas.some((present) => !present)) {
  failures.push("one or more required LifeOS schemas are absent");
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
      required_schemas: receipt.required_schemas,
    },
    null,
    2
  )
);
