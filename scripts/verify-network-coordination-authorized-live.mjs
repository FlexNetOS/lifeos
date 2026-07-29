// ARCHBP-011/012 — authorized live network-control execution.
//
// The database issues the task lease and grant, binds the executor session,
// authorizes a harmless loopback `up` operation, and records the real netctl
// output and post-apply status before closing the task and revoking the grant.
// No network state other than the idempotent loopback-up operation is changed.

import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const psql = "/home/flexnetos/.nix-profile/bin/psql";
const socket = process.env.LIFEOS_PG_SOCKET ?? "/home/flexnetos/meta/var/run/postgresql";
const database = process.env.LIFEOS_DATABASE ?? "lifeos";
const netctl = process.env.LIFEOS_NETCTL_BIN ?? "/home/flexnetos/meta/var/cargo-target/debug/netctl";
const tenant = "00000000-0000-4000-8000-000000000001";
const identity = "00000000-0000-4000-8000-000000000002";
const bootstrapGrant = "00000000-0000-4000-8000-000000000003";
const policy = "00000000-0000-4000-8000-000000000004";
const branch = "00000000-0000-4000-8000-000000000005";
const task = randomUUID();
const execution = randomUUID();
const taskKey = `archbp-authorized-network-${task}`;
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

const sql = String.raw`
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
  ARRAY['bind-session'], 'archbp-authorized-network-live', decode('${sessionNonce}', 'hex'), 1,
  :'session_raw'::uuid, clock_timestamp() + interval '10 minutes'
);

SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${sessionGrant}',
  convert_to('${bindingPayload}'::text, 'UTF8')
) AS bootstrap \gset

SELECT lifeos_blob.store_generated_object(
  '${tenant}', '{"task_kind":"archbp-authorized-network","operation":"netctl link set lo up"}'::jsonb,
  '{"producer":"archbp-authorized-network-live"}'::jsonb
) AS task_payload \gset

INSERT INTO lifeos_runtime.task(
  task_id, tenant_id, branch_id, task_kind, payload_object_id, capability_requirements,
  idempotency_key
) VALUES (
  '${task}', '${tenant}', '${branch}', 'archbp-authorized-network', :'task_payload'::uuid,
  '{"network:apply":true}'::jsonb, '${taskKey}'
);

SELECT leased_lease_id::text AS lease_id
  FROM lifeos_runtime.claim_task('${identity}', '{"network:apply":true}'::jsonb, interval '10 minutes')
 WHERE leased_task_id = '${task}' \gset

SELECT lifeos_blob.store_generated_object(
  '${tenant}', jsonb_build_object('grant','task','task_id','${task}','lease_id',:'lease_id'),
  '{"producer":"archbp-authorized-network-live"}'::jsonb
) AS task_grant_raw \gset
INSERT INTO lifeos_security."grant"(
  grant_id, tenant_id, policy_id, identity_id, task_id, lease_id,
  resource_scope, action_scope, purpose, nonce, epoch, raw_object_id, expires_at
) VALUES (
  '${taskGrant}', '${tenant}', '${policy}', '${identity}', '${task}', :'lease_id'::uuid,
  '{"interface":"lo","operation":"link set up"}'::jsonb,
  ARRAY['bind-runtime','network:apply'], 'archbp-authorized-network-live', decode('${taskNonce}', 'hex'), 1,
  :'task_grant_raw'::uuid, clock_timestamp() + interval '10 minutes'
);

SELECT lifeos_blob.store_generated_object(
  '${tenant}', '{"binding":"task","task_id":"${task}"}'::jsonb,
  '{"producer":"archbp-authorized-network-live"}'::jsonb
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
SELECT * FROM lifeos_coord.start_network_plan(:'plan_id'::uuid) \gset plan_

CREATE TEMP TABLE archbp_netctl_output(line text);
\copy archbp_netctl_output FROM PROGRAM '${rtk} proxy ${netctl} --json link set --apply lo up 2>&1; rc=$?; printf "__EXIT__:%s\n" "$rc"; exit 0'
SELECT COALESCE(string_agg(line, E'\n'), '') AS apply_output
  FROM archbp_netctl_output \gset
SELECT COALESCE(((regexp_match(:'apply_output', '__EXIT__:([0-9]+)'))[1])::integer, 1)
  AS apply_exit \gset

CREATE TEMP TABLE archbp_netctl_status(line text);
\copy archbp_netctl_status FROM PROGRAM '${rtk} proxy ${netctl} --json status'
SELECT COALESCE(string_agg(line, E'\n'), '') AS status_output
  FROM archbp_netctl_status \gset

SELECT lifeos_coord.record_network_effect(
  :'plan_id'::uuid,
  CASE WHEN :'apply_exit'::integer = 0 THEN 'succeeded' ELSE 'failed' END,
  :'apply_exit'::integer,
  jsonb_build_object('executor','netctl','apply_output',:'apply_output','post_apply_status',:'status_output'),
  jsonb_build_object('executor','netctl','argv',jsonb_build_array('link','set','--apply','lo','up'),'idempotent',true),
  '${taskKey}:effect'
) AS effect_id \gset

UPDATE lifeos_runtime.task
   SET state_code = CASE WHEN :'apply_exit'::integer = 0 THEN 'completed' ELSE 'failed' END
 WHERE task_id = '${task}';
UPDATE lifeos_runtime.execution
   SET state_code = CASE WHEN :'apply_exit'::integer = 0 THEN 'completed' ELSE 'failed' END,
       completed_at = clock_timestamp()
 WHERE execution_id = '${execution}';
UPDATE lifeos_runtime.lease
   SET acknowledged_at = clock_timestamp()
 WHERE lease_id = :'lease_id'::uuid;
UPDATE lifeos_security."grant"
   SET revoked_at = clock_timestamp()
 WHERE grant_id IN ('${sessionGrant}', '${taskGrant}');
COMMIT;

SELECT json_build_object(
  'task_id', '${task}', 'execution_id', '${execution}', 'lease_id', :'lease_id', 'grant_id', '${taskGrant}',
  'plan_id', :'plan_id', 'effect_id', :'effect_id',
  'apply_exit_code', :'apply_exit'::integer, 'apply_output', :'apply_output',
  'post_apply_status', :'status_output'
)::text;
`;

const sqlPath = `/tmp/lifeos-authorized-network-${task}.sql`;
writeFileSync(sqlPath, sql);
let output;
try {
  output = execFileSync(rtk, [
    "proxy", psql, "-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
    "-h", socket, "-d", database, "-qAt", "-f", sqlPath,
  ], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
} finally {
  unlinkSync(sqlPath);
}

const marker = output.trim().split("\n").at(-1);
const receipt = JSON.parse(marker);
if (receipt.task_id !== task || receipt.execution_id !== execution || receipt.plan_id === undefined || receipt.effect_id === undefined || typeof receipt.apply_exit_code !== "number") {
  throw new Error(`authorized network execution returned an invalid receipt: ${marker}`);
}
const outputPath = resolve(root, "evidence/coordination/network-authorized-live-receipt.json");
const { writeFileSync: writeReceipt } = await import("node:fs");
writeReceipt(outputPath, `${JSON.stringify({
  schema_version: "lifeos.evidence.network-coordination-authorized-live.v1",
  authority: "PostgreSQL/RuVector lifeos_coord procedures and database-issued task/lease/grant",
  operation: "netctl link set --apply lo up",
  execution: receipt,
  lifecycle: receipt.apply_exit_code === 0
    ? "task closed successfully, lease acknowledged, grants revoked after effect"
    : "task closed as failed, lease acknowledged, grants revoked after host privilege denial",
  verdict: receipt.apply_exit_code === 0 ? "authorized-live-pass" : "authorized-live-attempt-host-privilege-gate",
}, null, 2)}\n`);
console.log(JSON.stringify({
  receipt: outputPath,
  verdict: receipt.apply_exit_code === 0 ? "authorized-live-pass" : "authorized-live-attempt-host-privilege-gate",
}, null, 2));
