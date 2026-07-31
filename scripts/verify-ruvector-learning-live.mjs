import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql";
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");
const receiptPath = resolve("evidence/postgres-ruvector/learning-live-receipt.json");

if (!psql) {
  console.error("No psql executable found. Set LIFEOS_PSQL to the active PostgreSQL frontdoor.");
  process.exit(1);
}

const sql = `
BEGIN;
CREATE TEMP TABLE lifeos_learning_probe (id bigint, emb extensions.ruvector(8));
SELECT extensions.ruvector_enable_learning('lifeos_learning_probe', '{}'::jsonb);
SELECT extensions.ruvector_record_trajectory(
  'lifeos_learning_probe', ARRAY[1.0::real,0,0,0,1,0,0,0],
  ARRAY[1,2]::bigint[], 1000, 50, 10
);
SELECT extensions.ruvector_record_feedback(
  'lifeos_learning_probe', ARRAY[1.0::real,0,0,0,1,0,0,0],
  ARRAY[1]::bigint[], ARRAY[2]::bigint[]
);
SELECT extensions.ruvector_learning_stats('lifeos_learning_probe');
SELECT extensions.ruvector_auto_tune(
  'lifeos_learning_probe', 'speed', ARRAY[1.0::real,0,0,0,1,0,0,0]
);
ROLLBACK;`;

const child = Bun.spawn(
  [psql, "--no-psqlrc", "--no-align", "--tuples-only", databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql],
  { stdout: "pipe", stderr: "pipe" },
);
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
  child.exited,
]);

if (exitCode !== 0) {
  console.error(stderr.trim() || "RuVector learning lifecycle failed.");
  process.exit(exitCode || 1);
}

const lines = stdout.trim().split("\n").map((line) => line.trim()).filter(Boolean);
const enabled = lines.find((line) => line.startsWith("Learning enabled")) ?? "";
const trajectory = lines.find((line) => line.startsWith("Trajectory recorded")) ?? "";
const feedback = lines.find((line) => line.startsWith("Feedback recorded")) ?? "";
const jsonLines = lines.filter((line) => line.startsWith("{"));
const [statsText, autoTuneText] = jsonLines;
const stats = JSON.parse(statsText);
const autoTune = JSON.parse(autoTuneText);
const receipt = {
  schema_version: "lifeos.evidence.ruvector-learning-live.v1",
  database_url: databaseUrl.replace(/password=[^&]+/gi, "password=REDACTED"),
  enabled: enabled.startsWith("Learning enabled"),
  trajectory_recorded: trajectory.startsWith("Trajectory recorded"),
  feedback_recorded: feedback.startsWith("Feedback recorded"),
  feedback_count: Number(stats.trajectories?.with_feedback ?? 0),
  auto_tune_recommendations: Array.isArray(autoTune.recommendations),
};

if (!receipt.enabled || !receipt.trajectory_recorded || !receipt.feedback_recorded ||
    receipt.feedback_count !== 1 || !receipt.auto_tune_recommendations) {
  console.error(JSON.stringify({ status: "failed", receipt }, null, 2));
  process.exit(1);
}

await mkdir(dirname(receiptPath), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, feedback_count: receipt.feedback_count }));
