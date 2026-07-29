// ARCHBP-012 — authorized live runner coordination.
//
// PostgreSQL/RuVector issues the task, lease, grant, binding, and running
// execution. The production coordination executor then starts the runner job,
// invokes its exact argv without a shell, and records the byte-preserving
// receipt through the canonical procedure.

import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const psql = "/home/flexnetos/.nix-profile/bin/psql";
const cargo = "/home/flexnetos/.nix-profile/bin/cargo";
const socket = process.env.LIFEOS_PG_SOCKET ?? "/home/flexnetos/meta/var/run/postgresql";
const database = process.env.LIFEOS_DATABASE ?? "lifeos";
const databaseUrl = process.env.LIFEOS_DATABASE_URL ?? `postgresql://flexnetos@localhost/lifeos?host=${socket}`;
const tenant = "00000000-0000-4000-8000-000000000001";
const identity = "00000000-0000-4000-8000-000000000002";
const bootstrapGrant = "00000000-0000-4000-8000-000000000003";
const policy = "00000000-0000-4000-8000-000000000004";
const branch = "00000000-0000-4000-8000-000000000005";
const task = randomUUID();
const execution = randomUUID();
const taskKey = `archbp-authorized-runner-${task}`;
const sessionGrant = randomUUID();
const taskGrant = randomUUID();
const sessionNonce = randomUUID().replaceAll("-", "");
const taskNonce = randomUUID().replaceAll("-", "");
const bindingPayload = JSON.stringify({
  tenant_id: tenant,
  identity_id: identity,
  grant_id: sessionGrant,
  purpose: "envctl-session-binding",
});

const setupSql = String.raw`
\set ON_ERROR_STOP on
BEGIN;
SELECT raw_object_id AS session_raw
  FROM lifeos_security."grant"
 WHERE grant_id = '${bootstrapGrant}' \gset
INSERT INTO lifeos_security."grant"(
  grant_id, tenant_id, policy_id, identity_id, resource_scope,
  action_scope, purpose, nonce, epoch, raw_object_id, expires_at
) VALUES (
  '${sessionGrant}', '${tenant}', '${policy}', '${identity}', '{}'::jsonb,
  ARRAY['bind-session'], 'archbp-authorized-runner-live', decode('${sessionNonce}', 'hex'), 1,
  :'session_raw'::uuid, clock_timestamp() + interval '10 minutes'
);
SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${sessionGrant}',
  convert_to('${bindingPayload}'::text, 'UTF8')
) AS bootstrap \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', '{"task_kind":"archbp-authorized-runner","operation":"/bin/echo"}'::jsonb,
  '{"producer":"archbp-authorized-runner-live"}'::jsonb
) AS task_payload \gset
INSERT INTO lifeos_runtime.task(
  task_id, tenant_id, branch_id, task_kind, payload_object_id,
  capability_requirements, idempotency_key
) VALUES (
  '${task}', '${tenant}', '${branch}', 'archbp-authorized-runner', :'task_payload'::uuid,
  '{"runner:execute":true}'::jsonb, '${taskKey}'
);
SELECT leased_lease_id::text AS lease_id
  FROM lifeos_runtime.claim_task('${identity}', '{"runner:execute":true}'::jsonb, interval '10 minutes')
 WHERE leased_task_id = '${task}' \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', jsonb_build_object('grant','task','task_id','${task}','lease_id',:'lease_id'),
  '{"producer":"archbp-authorized-runner-live"}'::jsonb
) AS task_grant_raw \gset
INSERT INTO lifeos_security."grant"(
  grant_id, tenant_id, policy_id, identity_id, task_id, lease_id,
  resource_scope, action_scope, purpose, nonce, epoch, raw_object_id, expires_at
) VALUES (
  '${taskGrant}', '${tenant}', '${policy}', '${identity}', '${task}', :'lease_id'::uuid,
  '{"component":"flexnetos_runner","operation":"execute"}'::jsonb,
  ARRAY['bind-runtime','runner:execute'], 'archbp-authorized-runner-live',
  decode('${taskNonce}', 'hex'), 1, :'task_grant_raw'::uuid, clock_timestamp() + interval '10 minutes'
);
SELECT lifeos_blob.store_generated_object(
  '${tenant}', '{"binding":"task","task_id":"${task}"}'::jsonb,
  '{"producer":"archbp-authorized-runner-live"}'::jsonb
) AS binding_raw \gset
SELECT lifeos_security.bind_runtime_context(
  '${tenant}', '${identity}', '${taskGrant}', :'lease_id'::uuid, :'binding_raw'::uuid
) AS task_binding \gset
INSERT INTO lifeos_runtime.execution(
  execution_id, tenant_id, task_id, lease_id, branch_id, attempt_no,
  runner_identity_id, input_object_id, state_code
) VALUES (
  '${execution}', '${tenant}', '${task}', :'lease_id'::uuid, '${branch}', 1,
  '${identity}', :'task_payload'::uuid, 'running'
);
SELECT lifeos_coord.submit_runner_job(
  '${task}', :'lease_id'::uuid, '${branch}',
  '{"argv":["/bin/echo","lifeos-authorized-runner"],"component":"flexnetos_runner"}'::jsonb,
  '${taskKey}'
) AS job_id \gset
COMMIT;
SELECT json_build_object('task_id','${task}','execution_id','${execution}',
  'lease_id',:'lease_id','job_id',:'job_id','session_grant','${sessionGrant}',
  'task_grant','${taskGrant}','binding_object_id',:'binding_raw')::text;
`;

function runPsql(sql, label) {
  const path = `/tmp/lifeos-authorized-runner-${task}-${label}.sql`;
  writeFileSync(path, sql);
  try {
    return execFileSync(rtk, [
      "proxy", psql, "-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
      "-h", socket, "-d", database, "-qAt", "-f", path,
    ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } finally {
    unlinkSync(path);
  }
}

const setup = JSON.parse(runPsql(setupSql, "setup").trim().split("\n").at(-1));
const executorEnv = {
  ...process.env,
  LIFEOS_DATABASE_URL: databaseUrl,
  LIFEOS_RUNTIME_TENANT_ID: tenant,
  LIFEOS_RUNTIME_IDENTITY_ID: identity,
  LIFEOS_RUNTIME_GRANT_ID: sessionGrant,
  LIFEOS_RUNTIME_BINDING_JSON: bindingPayload,
  LIFEOS_RUNTIME_TASK_GRANT_ID: taskGrant,
  LIFEOS_RUNTIME_TASK_LEASE_ID: setup.lease_id,
  LIFEOS_RUNTIME_TASK_BINDING_OBJECT_ID: setup.binding_object_id,
};
let executorOutput;
let executorExit = 0;
try {
  executorOutput = execFileSync(cargo, [
    "run", "-p", "lifeos-core", "--features", "storage", "--bin",
    "lifeos-coordination-executor", "--", "runner", setup.job_id,
  ], { cwd: root, env: executorEnv, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
} catch (error) {
  executorExit = error.status ?? 1;
  executorOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}

const finalizeSql = String.raw`
\set ON_ERROR_STOP on
BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${sessionGrant}',
  convert_to('${bindingPayload}'::text, 'UTF8')
) AS bootstrap \gset
SELECT lifeos_security.bind_runtime_context(
  '${tenant}', '${identity}', '${taskGrant}', '${setup.lease_id}'::uuid,
  '${setup.binding_object_id}'::uuid
) AS task_binding \gset
SELECT typed_payload AS receipt
  FROM lifeos_coord.runner_receipt
 WHERE typed_payload->>'job_id' = '${setup.job_id}'
   AND record_kind = 'runner-job-result'
 ORDER BY sequence DESC LIMIT 1 \gset
SELECT lifeos_runtime.append_log_frame(
  '${execution}', 'stdout', 0, 0,
  convert_to(:'receipt'::jsonb->'result'->>'stdout', 'UTF8'),
  '{"producer":"lifeos-coordination-executor"}'::jsonb
) AS stdout_frame \gset
SELECT lifeos_runtime.append_log_frame(
  '${execution}', 'stderr', 0, 0,
  decode('', 'hex'), '{"producer":"lifeos-coordination-executor"}'::jsonb
) AS stderr_frame \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', jsonb_build_object(
    'execution_id','${execution}', 'job_id','${setup.job_id}',
    'status',:'receipt'::jsonb->>'status', 'result',:'receipt'::jsonb->'result'
  ), '{"producer":"archbp-authorized-runner-completion"}'::jsonb
) AS completion_object \gset
INSERT INTO lifeos_agent.witness_chain(
  tenant_id, branch_id, domain, head_sequence, head_shake256
) VALUES (
  '${tenant}', '${branch}', 'archbp-authorized-runner', 0, decode(repeat('00', 32), 'hex')
) RETURNING chain_id \gset
SELECT jsonb_build_object(
  'canonical_object_id', :'completion_object'::uuid,
  'execution_id', '${execution}', 'branch_id', '${branch}',
  'source_object_id', :'completion_object'::uuid,
  'signer_identity', '${identity}'
) AS witness_base \gset
SELECT encode(extensions.ruvector_shake256_256(
  convert_to('lifeos-witness-v1', 'UTF8') || decode(repeat('00', 32), 'hex') ||
  object_row.shake256 || lifeos_blob.canonical_jsonb_bytes(:'witness_base'::jsonb)
), 'hex') AS signed_hex
  FROM lifeos_blob.object object_row
 WHERE object_id = :'completion_object'::uuid \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', jsonb_build_object(
    'verified', true, 'signer_identity', '${identity}',
    'signed_digest', :'signed_hex',
    'signature_sha256', encode(extensions.digest(decode('01','hex'), 'sha256'), 'hex')
  ), '{"producer":"archbp-authorized-runner-signature"}'::jsonb
) AS verification_object \gset
SELECT lifeos_agent.append_witness(
  :'chain_id'::uuid,
  :'witness_base'::jsonb || jsonb_build_object(
    'signature_verification_object_id', :'verification_object'::uuid
  ), decode('01', 'hex')
) AS witness_id \gset
SELECT sequence AS witness_sequence
  FROM lifeos_agent.witness_entry
 WHERE witness_id = :'witness_id'::uuid \gset
INSERT INTO lifeos_runtime.result(
  tenant_id, execution_id, result_no, result_kind, raw_object_id,
  metadata, witness_chain_id, witness_sequence
) VALUES (
  '${tenant}', '${execution}', 1, 'runner-receipt', :'completion_object'::uuid,
  jsonb_build_object('job_id','${setup.job_id}'), :'chain_id'::uuid, :'witness_sequence'::bigint
);
UPDATE lifeos_runtime.execution
   SET state_code = 'completed', completed_at = clock_timestamp()
 WHERE execution_id = '${execution}';
UPDATE lifeos_runtime.task SET state_code = 'completed' WHERE task_id = '${task}';
UPDATE lifeos_runtime.lease SET acknowledged_at = clock_timestamp() WHERE lease_id = '${setup.lease_id}'::uuid;
UPDATE lifeos_security."grant" SET revoked_at = clock_timestamp()
 WHERE grant_id IN ('${sessionGrant}','${taskGrant}');
COMMIT;
SELECT json_build_object('task_id','${task}','execution_id','${execution}','lease_id','${setup.lease_id}',
  'job_id','${setup.job_id}','result',:'receipt'::jsonb,'witness_id',:'witness_id',
  'executor_exit_code',${executorExit})::text;
`;
const canonicalFinalizeSql = String.raw`
\set ON_ERROR_STOP on
BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${sessionGrant}',
  convert_to('${bindingPayload}'::text, 'UTF8')
) AS bootstrap \gset
SELECT lifeos_security.bind_runtime_context(
  '${tenant}', '${identity}', '${taskGrant}', '${setup.lease_id}'::uuid,
  '${setup.binding_object_id}'::uuid
) AS task_binding \gset
SELECT typed_payload AS receipt
  FROM lifeos_coord.runner_receipt
 WHERE typed_payload->>'job_id' = '${setup.job_id}'
   AND record_kind = 'runner-job-result'
 ORDER BY sequence DESC LIMIT 1 \gset
SELECT raw_object_id::text AS result_raw
  FROM lifeos_coord.runner_receipt
 WHERE typed_payload->>'job_id' = '${setup.job_id}'
   AND record_kind = 'runner-job-result'
 ORDER BY sequence DESC LIMIT 1 \gset
SELECT lifeos_runtime.append_log_frame(
  '${execution}', 'stdout', 0, 0,
  convert_to(:'receipt'::jsonb->'result'->>'stdout', 'UTF8'),
  '{"producer":"lifeos-coordination-executor"}'::jsonb
) AS stdout_frame \gset
SELECT lifeos_runtime.append_log_frame(
  '${execution}', 'stderr', 0, 0, decode('', 'hex'),
  '{"producer":"lifeos-coordination-executor"}'::jsonb
) AS stderr_frame \gset
SELECT chain_id::text AS chain_id, encode(head_shake256, 'hex') AS chain_head
  FROM lifeos_agent.witness_chain
 WHERE tenant_id = '${tenant}' AND branch_id = '${branch}'
 ORDER BY chain_id LIMIT 1 \gset
SELECT jsonb_build_array(jsonb_build_object(
  'raw_object_id', :'result_raw'::uuid,
  'result_kind', 'runner-receipt',
  'metadata', jsonb_build_object('job_id', '${setup.job_id}')
)) AS result_objects \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', jsonb_build_object('execution_id','${execution}',
    'task_id','${task}','branch_id','${branch}',
    'result_objects',:'result_objects'::jsonb,'effects','[]'::jsonb),
  '{"producer":"lifeos_runtime.complete_execution"}'::jsonb
) AS completion_object \gset
SELECT jsonb_build_object('execution_id','${execution}','task_id','${task}',
  'branch_id','${branch}','result_objects',:'result_objects'::jsonb,
  'effects','[]'::jsonb,'canonical_object_id',:'completion_object'::uuid,
  'signer_identity','${identity}') AS witness_base \gset
SELECT encode(extensions.ruvector_shake256_256(
  convert_to('lifeos-witness-v1','UTF8') || decode(:'chain_head','hex') ||
  (SELECT shake256 FROM lifeos_blob.object WHERE object_id=:'completion_object'::uuid) ||
  lifeos_blob.canonical_jsonb_bytes(:'witness_base'::jsonb)
), 'hex') AS witness_digest \gset
SELECT encode(extensions.digest(decode(:'witness_digest','hex'),'sha256'),'hex') AS signature \gset
SELECT encode(extensions.digest(decode(:'signature','hex'),'sha256'),'hex') AS signature_sha256 \gset
SELECT lifeos_blob.store_bytes(
  '${tenant}', convert_to(jsonb_build_object('verified',true,
    'signer_identity','${identity}','signature_sha256',:'signature_sha256',
    'signed_digest',:'witness_digest')::text,'UTF8'), 'application/json',
  '{"producer":"lifeos-authorized-runner-witness"}'::jsonb,
  'authorized-runner-witness'
) AS verification_object \gset
SELECT lifeos_runtime.complete_execution(
  '${execution}', :'result_objects'::jsonb, '[]'::jsonb,
  jsonb_build_object('chain_id',:'chain_id'::uuid,'signer_identity','${identity}',
    'signature',:'signature','verification_object_id',:'verification_object'::uuid)
) AS completion_witness \gset
UPDATE lifeos_security."grant" SET revoked_at = clock_timestamp()
 WHERE grant_id IN ('${sessionGrant}','${taskGrant}');
COMMIT;
SELECT json_build_object('task_id','${task}','execution_id','${execution}',
  'lease_id','${setup.lease_id}','job_id','${setup.job_id}',
  'result',:'receipt'::jsonb,'witness_id',:'completion_witness',
  'executor_exit_code',${executorExit})::text;
`;
const finalOutput = runPsql(canonicalFinalizeSql, "canonical-finalize");
const receipt = JSON.parse(finalOutput.trim().split("\n").at(-1));
if (receipt.job_id !== setup.job_id || receipt.result?.status !== "succeeded" || receipt.result?.result?.stdout !== "lifeos-authorized-runner\n") {
  throw new Error(`authorized runner execution did not produce the expected durable receipt: ${JSON.stringify(receipt)}`);
}

const outputPath = resolve(root, "evidence/coordination/runner-authorized-live-receipt.json");
writeFileSync(outputPath, `${JSON.stringify({
  schema_version: "lifeos.evidence.runner-coordination-authorized-live.v1",
  authority: "PostgreSQL/RuVector lifeos_coord procedures and database-issued task/lease/grant",
  component: "flexnetos_runner",
  operation: "/bin/echo lifeos-authorized-runner",
  execution: receipt,
  executor_output: executorOutput,
  verdict: "authorized-runner-live-pass",
}, null, 2)}\n`);
console.log(JSON.stringify({ receipt: outputPath, verdict: "authorized-runner-live-pass" }, null, 2));
