import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const psql = process.env.LIFEOS_PSQL ?? "/home/flexnetos/.nix-profile/bin/psql";
const tenant = "00000000-0000-4000-8000-000000000001";
const identity = "00000000-0000-4000-8000-000000000002";
const grant = "00000000-0000-4000-8000-000000000003";
const currentBootstrap = "00000000-0000-4000-8000-000000000005";
const runTag = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  `postgresql://${process.env.USER ?? "flexnetos"}@localhost/lifeos?host=/home/flexnetos/meta/var/run/postgresql`;
const binding = `'${JSON.stringify({
  tenant_id: tenant,
  identity_id: identity,
  grant_id: grant,
  purpose: "envctl-session-binding",
})}'`;

function sql(statement) {
  const query = [
    "BEGIN",
    `SELECT * FROM lifeos_security.bootstrap_envctl_context('${tenant}','${identity}','${grant}', convert_to(${binding}, 'UTF8'))`,
    `SET LOCAL lifeos.tenant_id='${tenant}'`,
    statement,
    "COMMIT",
  ].join("; ");
  return execFileSync(rtk, ["proxy", psql, databaseUrl, "-v", "ON_ERROR_STOP=1", "-Atqc", query], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  }).trim().split("\n").filter(Boolean).at(-1);
}

function scalar(statement) {
  return sql(`SELECT ${statement}`);
}

function json(statement) {
  return JSON.parse(scalar(statement));
}

function uuid(statement) {
  const value = scalar(statement);
  if (!/^[0-9a-f-]{36}$/.test(value)) throw new Error(`expected UUID, got ${value}`);
  return value;
}

function operation(name) {
  return `blueprint-live-cow-frontdoor:${runTag}:${name}`;
}

const child = uuid(`lifeos_runtime.cow_frontdoor_create_v2(
  '${currentBootstrap}', 'proposal', '${operation("purpose")}',
  '{"required_gates":[],"conflict_classes":["byte"]}'::jsonb,
  '${identity}', '75000000-0000-0000-8000-000000000001',
  '75000000-0000-0000-8000-000000000002', '${operation("create")}')`);
const rootBranch = scalar(`cow_branch_id FROM lifeos_runtime.cow_frontdoor_binding WHERE current_branch_id='${currentBootstrap}'`);
const overlay = json(`lifeos_runtime.append_branch_overlay_v2(
  '${child}', 'lifeos_runtime.canonical_projection'::regclass,
  '{"probe":"${runTag}"}'::jsonb, 'insert', NULL,
  convert_to('{"value":"frontdoor-${runTag}","bytes":true}', 'UTF8'),
  '{"value":"frontdoor-${runTag}","bytes":true}'::jsonb,
  '75000000-0000-0000-8000-000000000003',
  '75000000-0000-0000-8000-000000000004', '${operation("overlay")}')`);
const beforeMerge = json(`jsonb_build_object(
  'child_members', (SELECT count(*) FROM lifeos_runtime.resolved_branch_members_v2('${child}',1)),
  'root_members', (SELECT count(*) FROM lifeos_runtime.resolved_branch_members_v2('${rootBranch}',0))
)`);
if (beforeMerge.child_members !== 1 || beforeMerge.root_members !== 0) {
  throw new Error("front-door proposal leaked its overlay into the root");
}

const gateKinds = ["build", "byte-reconstruction", "security", "static-analysis", "test", "witness-integrity"];
for (const [index, kind] of gateKinds.entries()) {
  const execution = String(41 + index).padStart(12, "0");
  const effect = String(51 + index).padStart(12, "0");
  scalar(`lifeos_runtime.record_merge_gate_v2(
    '${child}', '${kind}', true,
    convert_to('{"gate":"${kind}","status":"passed"}', 'UTF8'),
    '76000000-0000-0000-8000-${execution}',
    '76000000-0000-0000-8000-${effect}', '${operation(`gate:${kind}`)}')`);
}
if (scalar(`lifeos_runtime.branch_gates_satisfied_v2('${child}')`) !== "t") {
  throw new Error("front-door proposal gates did not pass");
}

const container = uuid(`lifeos_rvf.mirror_branch_membership_v2(
  '${child}', NULL, convert_to('{"container":"frontdoor-${runTag}","generation":1}', 'UTF8'),
  convert_to('{"range":"full"}', 'UTF8'),
  '75000000-0000-0000-8000-000000000005',
  '75000000-0000-0000-8000-000000000006', '${operation("rvf")}')`);
const mergePromotion = uuid(`lifeos_runtime.cow_frontdoor_merge_v2(
  '${child}', '${currentBootstrap}', '{"pointer_name":"frontdoor-live-cow"}'::jsonb,
  '75000000-0000-0000-8000-000000000007',
  '75000000-0000-0000-8000-000000000008', '${operation("merge")}')`);
const promotion = uuid(`lifeos_runtime.cow_frontdoor_promote_v2(
  '${child}', '${currentBootstrap}', '{"pointer_name":"frontdoor-live-cow"}'::jsonb,
  '75000000-0000-0000-8000-000000000009',
  '75000000-0000-0000-8000-000000000010', '${operation("promote")}')`);
const secondPromotion = uuid(`lifeos_runtime.cow_frontdoor_promote_v2(
  '${child}', '${currentBootstrap}', '{"pointer_name":"frontdoor-live-cow"}'::jsonb,
  '75000000-0000-0000-8000-000000000013',
  '75000000-0000-0000-8000-000000000014', '${operation("promote-again")}')`);
const rollback = uuid(`lifeos_runtime.rollback_branch_v2(
  '${tenant}', 'frontdoor-live-cow', '${promotion}',
  '75000000-0000-0000-8000-000000000011',
  '75000000-0000-0000-8000-000000000012', '${operation("rollback")}')`);
const verification = json(`jsonb_build_object(
  'binding_report', lifeos_runtime.cow_frontdoor_binding_report(),
  'capability', lifeos_runtime.cow_branch_capability(),
  'current_bootstrap', '${currentBootstrap}'::uuid,
  'root_branch', '${rootBranch}'::uuid,
  'child_branch', '${child}'::uuid,
  'overlay', '${JSON.stringify(overlay)}'::jsonb,
  'container', '${container}'::uuid,
  'merge_promotion', '${mergePromotion}'::uuid,
  'promotion', '${promotion}'::uuid,
  'second_promotion', '${secondPromotion}'::uuid,
  'rollback', '${rollback}'::uuid,
  'rollback_snapshot_valid', lifeos_runtime.compare_promotion_snapshot_v2(
    (SELECT promotion_id FROM lifeos_runtime.promotion_pre_s16
     WHERE promotion_id='${rollback}'::uuid)
  ),
  'proposal_isolation_before_merge', '${JSON.stringify(beforeMerge)}'::jsonb
)`);

if (verification.capability?.implemented !== true ||
    verification.capability?.rvf_roundtrip !== true ||
    verification.rollback_snapshot_valid !== true) {
  throw new Error(`front-door COW acceptance failed: ${JSON.stringify(verification)}`);
}

const receipt = {
  schema_version: "lifeos.evidence.cow-frontdoor-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  authority_invariants: [1, 2, 9, 10, 11, 12, 14, 15, 18],
  status: "passed",
  execution: "real current-S16 PostgreSQL/RuVector front door to accepted COW v2 lifecycle",
  connection: {
    database: new URL(databaseUrl).pathname.slice(1),
    user: new URL(databaseUrl).username || process.env.USER || "unknown",
    password_recorded: false,
  },
  verification,
};
const receiptPath = join(root, "evidence/cow/frontdoor-live-receipt.json");
mkdirSync(join(root, "evidence/cow"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: receiptPath, status: receipt.status, child, promotion, rollback }, null, 2));
