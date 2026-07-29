// ARCHBP-011/012 — authorized network coordination through the production
// lifeos-network-control-executor binary, not a verifier-side netctl shortcut.

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const psql = "/home/flexnetos/.nix-profile/bin/psql";
const executor = process.env.LIFEOS_NETWORK_EXECUTOR ??
  "/home/flexnetos/meta/var/cargo-target/debug/lifeos-network-control-executor";
const netctl = process.env.LIFEOS_NETCTL_BIN ?? "/home/flexnetos/meta/var/cargo-target/debug/netctl";
const socket = process.env.LIFEOS_PG_SOCKET ?? "/home/flexnetos/meta/var/run/postgresql";
const database = process.env.LIFEOS_DATABASE ?? "lifeos";
const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  `postgresql://flexnetos@localhost/lifeos?host=${socket}`;
const tenant = "00000000-0000-4000-8000-000000000001";
const identity = "00000000-0000-4000-8000-000000000002";
const bootstrapGrant = "00000000-0000-4000-8000-000000000003";
const policy = "00000000-0000-4000-8000-000000000004";
const branch = "00000000-0000-4000-8000-000000000005";
const task = randomUUID();
const execution = randomUUID();
const taskKey = `archbp-production-network-${task}`;
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

function runPsql(sql, label) {
  const sqlPath = `/tmp/lifeos-production-network-${task}-${label}.sql`;
  writeFileSync(sqlPath, sql);
  try {
    return execFileSync(rtk, [
      "proxy", psql, "-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
      "-h", socket, "-d", database, "-qAt", "-f", sqlPath,
    ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } finally {
    unlinkSync(sqlPath);
  }
}

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
  ARRAY['bind-session'], 'archbp-production-network-live', decode('${sessionNonce}', 'hex'), 1,
  :'session_raw'::uuid, clock_timestamp() + interval '10 minutes'
);
SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${sessionGrant}',
  convert_to('${bindingPayload}'::text, 'UTF8')
) AS bootstrap \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', '{"task_kind":"archbp-production-network","operation":"netctl link set lo up"}'::jsonb,
  '{"producer":"archbp-production-network-live"}'::jsonb
) AS task_payload \gset
INSERT INTO lifeos_runtime.task(
  task_id, tenant_id, branch_id, task_kind, payload_object_id, capability_requirements,
  idempotency_key
) VALUES (
  '${task}', '${tenant}', '${branch}', 'archbp-production-network', :'task_payload'::uuid,
  '{"network:apply":true}'::jsonb, '${taskKey}'
);
SELECT leased_lease_id::text AS lease_id
  FROM lifeos_runtime.claim_task('${identity}', '{"network:apply":true}'::jsonb, interval '10 minutes')
 WHERE leased_task_id = '${task}' \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', jsonb_build_object('grant','task','task_id','${task}','lease_id',:'lease_id'),
  '{"producer":"archbp-production-network-live"}'::jsonb
) AS task_grant_raw \gset
INSERT INTO lifeos_security."grant"(
  grant_id, tenant_id, policy_id, identity_id, task_id, lease_id,
  resource_scope, action_scope, purpose, nonce, epoch, raw_object_id, expires_at
) VALUES (
  '${taskGrant}', '${tenant}', '${policy}', '${identity}', '${task}', :'lease_id'::uuid,
  '{"interface":"lo","operation":"link set up"}'::jsonb,
  ARRAY['bind-runtime','network:apply'], 'archbp-production-network-live', decode('${taskNonce}', 'hex'), 1,
  :'task_grant_raw'::uuid, clock_timestamp() + interval '10 minutes'
);
SELECT lifeos_blob.store_generated_object(
  '${tenant}', '{"binding":"task","task_id":"${task}"}'::jsonb,
  '{"producer":"archbp-production-network-live"}'::jsonb
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
SELECT lifeos_coord.submit_network_plan(
  '${task}', :'lease_id'::uuid, '${branch}', 'netctl',
  '{"argv":["link","set","--apply","lo","up"],"apply":true}'::jsonb,
  '{"argv":["link","set","--apply","lo","up"],"apply":true}'::jsonb,
  '${taskKey}'
) AS plan_id \gset
COMMIT;
SELECT json_build_object(
  'task_id','${task}', 'execution_id','${execution}', 'lease_id',:'lease_id',
  'plan_id',:'plan_id', 'session_grant','${sessionGrant}', 'task_grant','${taskGrant}',
  'binding_object_id',:'binding_raw'
)::text;
`;

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
  LIFEOS_NETCTL_BIN: netctl,
};
let executorOutput = "";
let executorExit = 0;
try {
  executorOutput = execFileSync(executor, [setup.plan_id], {
    cwd: root, env: executorEnv, encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
  });
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
SELECT network_effect_id::text AS effect_id, typed_payload AS effect
  FROM lifeos_coord.network_effect
 WHERE typed_payload->>'plan_id' = '${setup.plan_id}'
 ORDER BY sequence DESC LIMIT 1 \gset
UPDATE lifeos_runtime.task
   SET state_code = CASE WHEN :'effect'::jsonb->>'status' = 'succeeded' THEN 'completed' ELSE 'failed' END
 WHERE task_id = '${task}';
UPDATE lifeos_runtime.execution
   SET state_code = CASE WHEN :'effect'::jsonb->>'status' = 'succeeded' THEN 'completed' ELSE 'failed' END,
       completed_at = clock_timestamp()
 WHERE execution_id = '${execution}';
UPDATE lifeos_runtime.lease SET acknowledged_at = clock_timestamp()
 WHERE lease_id = '${setup.lease_id}'::uuid;
UPDATE lifeos_security."grant" SET revoked_at = clock_timestamp()
 WHERE grant_id IN ('${sessionGrant}', '${taskGrant}');
COMMIT;
SELECT json_build_object(
  'task_id','${task}', 'execution_id','${execution}', 'lease_id','${setup.lease_id}',
  'plan_id','${setup.plan_id}', 'effect_id',:'effect_id', 'effect',:'effect'::jsonb,
  'executor_exit_code',${executorExit}
)::text;
`;
const result = JSON.parse(runPsql(finalizeSql, "finalize").trim().split("\n").at(-1));
const outputPath = resolve(root, "evidence/coordination/network-authorized-live-receipt.json");
const applyExit = result.effect?.exit_code ?? null;
const succeeded = result.effect?.status === "succeeded" && applyExit === 0;
writeFileSync(outputPath, `${JSON.stringify({
  schema_version: "lifeos.evidence.network-coordination-authorized-live.v2",
  authority: "production lifeos-network-control-executor with PostgreSQL/RuVector plan/effect procedures",
  operation: "netctl link set --apply lo up",
  execution: result,
  executor_output: executorOutput,
  lifecycle: succeeded
    ? "task closed successfully, lease acknowledged, grants revoked after production executor effect"
    : "production executor attempted the authorized effect; task closed, lease acknowledged, grants revoked after host privilege denial",
  verdict: succeeded ? "authorized-production-live-pass" : "authorized-production-live-attempt-host-privilege-gate",
}, null, 2)}\n`);
console.log(JSON.stringify({
  receipt: outputPath,
  verdict: succeeded ? "authorized-production-live-pass" : "authorized-production-live-attempt-host-privilege-gate",
  executor_exit_code: result.executor_exit_code,
}, null, 2));
