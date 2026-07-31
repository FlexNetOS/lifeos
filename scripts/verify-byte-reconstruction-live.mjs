import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql";
const psql = process.env.LIFEOS_PSQL ?? Bun.which("psql");
const receiptPath = resolve("evidence/postgres-ruvector/byte-reconstruction-live-receipt.json");
const payloadHex = "00ff104c4946454f5300e298830ae280a8c3f09f9880";

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
  convert_to('{"probe":true,"kind":"byte-reconstruction"}', 'UTF8')
);
CREATE TEMP TABLE byte_probe_object ON COMMIT DROP AS
SELECT lifeos_blob.store_bytes(
  '00000000-0000-4000-8000-000000000001',
  decode('${payloadHex}', 'hex'),
  'application/octet-stream',
  jsonb_build_object('probe', true, 'contract', 'everything-every-byte'),
  'byte-reconstruction-probe',
  NULL::uuid
) AS object_id;
SELECT jsonb_build_object(
  'object_id', probe.object_id,
  'verified', lifeos_blob.verify_object(probe.object_id),
  'round_trip', lifeos_blob.load_object_bytes(probe.object_id) = decode('${payloadHex}', 'hex'),
  'source_byte_length', octet_length(decode('${payloadHex}', 'hex')),
  'reconstructed_byte_length', octet_length(lifeos_blob.load_object_bytes(probe.object_id)),
  'sha256_match', encode(object_row.sha256, 'hex') = encode(extensions.digest(decode('${payloadHex}', 'hex'), 'sha256'), 'hex'),
  'shake256_match', encode(object_row.shake256, 'hex') = encode(extensions.ruvector_shake256_256(decode('${payloadHex}', 'hex')), 'hex')
)
FROM byte_probe_object probe
JOIN lifeos_blob.object object_row ON object_row.object_id = probe.object_id;
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
  console.error(stderr.trim() || "Byte reconstruction live probe failed.");
  process.exit(exitCode || 1);
}

const jsonLine = stdout.split("\n").map((line) => line.trim()).find((line) => line.startsWith("{"));
const result = jsonLine ? JSON.parse(jsonLine) : {};
const receipt = {
  schema_version: "lifeos.evidence.byte-reconstruction-live.v1",
  database: new URL(databaseUrl).pathname.replace(/^\//, "") || "lifeos",
  verified: result.verified === true,
  round_trip: result.round_trip === true,
  source_byte_length: Number(result.source_byte_length ?? 0),
  reconstructed_byte_length: Number(result.reconstructed_byte_length ?? 0),
  sha256_match: result.sha256_match === true,
  shake256_match: result.shake256_match === true,
  object_id: result.object_id ?? null,
};

if (!receipt.verified || !receipt.round_trip || !receipt.sha256_match ||
    !receipt.shake256_match || receipt.source_byte_length !== receipt.reconstructed_byte_length ||
    !receipt.object_id?.match(/^[0-9a-f-]{36}$/)) {
  console.error(JSON.stringify({ status: "failed", receipt }, null, 2));
  process.exit(1);
}

await mkdir(dirname(receiptPath), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath, object_id: receipt.object_id }));
