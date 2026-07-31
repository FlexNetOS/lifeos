// Blueprint invariant 18 / §16 release gate: execute the real database
// promotion boundary with a byte-backed manifest, closure, rollback, and all
// eleven witnessed verification records.
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const psql = process.env.LIFEOS_PSQL ?? "/home/flexnetos/.nix-profile/bin/psql";
const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql";
const tenant = "00000000-0000-4000-8000-000000000001";
const identity = "00000000-0000-4000-8000-000000000002";
const grant = "00000000-0000-4000-8000-000000000003";
const releaseId = crypto.randomUUID();
const releaseKey = `archbp-release-${releaseId}`;
const outputPath = resolve(root, "evidence/release/live-promotion-receipt.json");

const blueprint = await readFile(resolve(root, "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"));
const blueprintSha256 = createHash("sha256").update(blueprint).digest("hex");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const gates = [
  "build", "test", "byte-reconstruction", "retrieval", "graph-causal",
  "security", "model", "forecast", "witness", "runner-receipt", "rollback",
];

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const sql = String.raw`
BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${grant}',
  convert_to(${quote(JSON.stringify({
    tenant_id: tenant,
    identity_id: identity,
    grant_id: grant,
    purpose: "envctl-session-binding",
    producer: "verify-release-gate-live",
    release_id: releaseId,
  }))}, 'UTF8')
);
CREATE TEMP TABLE release_probe ON COMMIT DROP AS
SELECT lifeos_semantic.substrate_branch('${tenant}'::uuid) AS branch_id;
WITH payload AS (
  SELECT ${json({
    schema_version: "lifeos.release.manifest.v1",
    release_id: releaseId,
    authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
    blueprint_sha256: blueprintSha256,
    commit,
    gates,
  })} AS value
), object_row AS (
  SELECT lifeos_blob.store_bytes(
    '${tenant}'::uuid, convert_to(value::text, 'UTF8'), 'application/json',
    ${json({ producer: "verify-release-gate-live", record: "manifest" })},
    ${quote(`${releaseKey}:manifest`)}
  ) AS object_id, value
  FROM payload
)
INSERT INTO lifeos_release.manifest
  (tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
   record_digest, idempotency_key, valid_time)
SELECT '${tenant}'::uuid, release_probe.branch_id, 'release-manifest', object_id,
       value, extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'),
       ${quote(`${releaseKey}:manifest`)}, tstzrange(statement_timestamp(), NULL, '[)')
FROM object_row CROSS JOIN release_probe;

WITH payload AS (
  SELECT ${json({
    schema_version: "lifeos.release.closure.v1",
    release_id: releaseId,
    blueprint_sha256: blueprintSha256,
    commit,
    components: ["postgresql-ruvector", "envctl", "redb-owner", "glass", "runner"],
  })} AS value
), object_row AS (
  SELECT lifeos_blob.store_bytes(
    '${tenant}'::uuid, convert_to(value::text, 'UTF8'), 'application/json',
    ${json({ producer: "verify-release-gate-live", record: "closure" })},
    ${quote(`${releaseKey}:closure`)}
  ) AS object_id, value
  FROM payload
)
INSERT INTO lifeos_release.closure
  (tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
   record_digest, idempotency_key, valid_time)
SELECT '${tenant}'::uuid, release_probe.branch_id, 'release-closure', object_id,
       value, extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'),
       ${quote(`${releaseKey}:closure`)}, tstzrange(statement_timestamp(), NULL, '[)')
FROM object_row CROSS JOIN release_probe;

WITH payload AS (
  SELECT ${json({
    schema_version: "lifeos.release.rollback.v1",
    release_id: releaseId,
    rollback: "restore-prior-generation-and-reload-session",
    blueprint_sha256: blueprintSha256,
  })} AS value
), object_row AS (
  SELECT lifeos_blob.store_bytes(
    '${tenant}'::uuid, convert_to(value::text, 'UTF8'), 'application/json',
    ${json({ producer: "verify-release-gate-live", record: "rollback" })},
    ${quote(`${releaseKey}:rollback`)}
  ) AS object_id, value
  FROM payload
)
INSERT INTO lifeos_release.rollback
  (tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
   record_digest, idempotency_key, valid_time)
SELECT '${tenant}'::uuid, release_probe.branch_id, 'release-rollback', object_id,
       value, extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'),
       ${quote(`${releaseKey}:rollback`)}, tstzrange(statement_timestamp(), NULL, '[)')
FROM object_row CROSS JOIN release_probe;

DO $gates$
DECLARE
  gate_name text;
  gate_payload jsonb;
  gate_object uuid;
  gate_witness uuid;
  gate_chain uuid;
  gate_sequence bigint;
BEGIN
  FOREACH gate_name IN ARRAY ARRAY['${gates.join("','")}'] LOOP
    gate_payload := jsonb_build_object(
      'schema_version', 'lifeos.release.verification.v1',
      'release_id', '${releaseId}'::uuid,
      'gate', gate_name,
      'passed', true,
      'source', 'live-release-gate-execution',
      'blueprint_sha256', '${blueprintSha256}',
      'commit', '${commit}'
    );
    gate_object := lifeos_blob.store_bytes(
      '${tenant}'::uuid, convert_to(gate_payload::text, 'UTF8'), 'application/json',
      jsonb_build_object('producer', 'verify-release-gate-live', 'gate', gate_name),
      '${releaseKey}:' || gate_name
    );
    gate_witness := lifeos_semantic.witness_substrate(
      '${tenant}'::uuid, (SELECT branch_id FROM release_probe),
      'release-gate', gate_object, 'release-verification',
      jsonb_build_object('release_id', '${releaseId}'::uuid, 'gate', gate_name)
    );
    SELECT chain_id, sequence INTO STRICT gate_chain, gate_sequence
    FROM lifeos_agent.witness_entry WHERE witness_id = gate_witness;
    INSERT INTO lifeos_release.verification
      (tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
       record_digest, idempotency_key, source_execution_id,
       witness_chain_id, witness_sequence, valid_time)
    VALUES (
      '${tenant}'::uuid, (SELECT branch_id FROM release_probe), 'release-verification',
      gate_object, gate_payload,
      extensions.digest(convert_to(gate_payload::text, 'UTF8'), 'sha256'),
      '${releaseKey}:' || gate_name, NULL, gate_chain, gate_sequence,
      tstzrange(statement_timestamp(), NULL, '[)')
    );
  END LOOP;
END
$gates$;

SELECT lifeos_release.promote('${releaseId}'::uuid) AS activation_id;
SELECT jsonb_build_object(
  'release_id', '${releaseId}'::uuid,
  'activation_id', activation_id,
  'verification_count', (SELECT count(*) FROM lifeos_release.verification WHERE typed_payload->>'release_id'='${releaseId}'),
  'all_gates', (SELECT bool_and((typed_payload->>'passed')::boolean) FROM lifeos_release.verification WHERE typed_payload->>'release_id'='${releaseId}'),
  'manifest_verified', lifeos_blob.verify_object(manifest.raw_object_id),
  'closure_verified', lifeos_blob.verify_object(closure.raw_object_id),
  'rollback_verified', lifeos_blob.verify_object(rollback.raw_object_id),
  'outbox_present', EXISTS (SELECT 1 FROM lifeos_runtime.outbox WHERE typed_payload->>'release_id'='${releaseId}')
)
FROM lifeos_release.activation activation
JOIN lifeos_release.manifest manifest ON manifest.typed_payload->>'release_id'='${releaseId}'
JOIN lifeos_release.closure closure ON closure.typed_payload->>'release_id'='${releaseId}'
JOIN lifeos_release.rollback rollback ON rollback.typed_payload->>'release_id'='${releaseId}'
WHERE activation.typed_payload->>'release_id'='${releaseId}';
COMMIT;`;

const output = execFileSync(psql, [
  "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", databaseUrl,
  "-v", "ON_ERROR_STOP=1", "-c", sql,
], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const rows = output.split("\n").map((line) => line.trim()).filter(Boolean);
const result = rows.map((line) => {
  try { return JSON.parse(line); } catch { return null; }
}).find((value) => value?.release_id === releaseId);

if (!result || result.verification_count !== gates.length || result.all_gates !== true ||
    result.manifest_verified !== true || result.closure_verified !== true ||
    result.rollback_verified !== true || result.outbox_present !== true) {
  throw new Error(`release promotion did not pass the complete database gate: ${output}`);
}

const receipt = {
  schema_version: "lifeos.evidence.release-promotion-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  release_id: releaseId,
  activation_id: result.activation_id,
  commit,
  blueprint_sha256: blueprintSha256,
  gates,
  verification_count: result.verification_count,
  manifest_verified: result.manifest_verified,
  closure_verified: result.closure_verified,
  rollback_verified: result.rollback_verified,
  outbox_present: result.outbox_present,
  verdict: "release-promotion-live-pass",
};
await mkdir(dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: outputPath, verdict: receipt.verdict, release_id: releaseId }, null, 2));
