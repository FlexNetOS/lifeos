import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const psql = process.env.LIFEOS_PSQL ?? "/home/flexnetos/.nix-profile/bin/psql";
const tenant = "00000000-0000-4000-8000-000000000001";
const identity = "00000000-0000-4000-8000-000000000002";
const grant = "00000000-0000-4000-8000-000000000003";
const runTag = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  `postgresql://${process.env.USER ?? "flexnetos"}@localhost/lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql`;
const binding = `'{"tenant_id":"${tenant}","identity_id":"${identity}","grant_id":"${grant}","purpose":"envctl-session-binding"}'`;

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
  return `blueprint-live-cow:${runTag}:${name}`;
}

function createChild(rootBranch, suffix) {
  return uuid(`lifeos_runtime.create_branch_v2('${rootBranch}','proposal','${operation(`child-${suffix}`)}', '{"required_gates":[],"conflict_classes":["byte"]}'::jsonb, '{"runtime":"lifeos","test":"live"}'::jsonb, 'codex-live-cow', '71000000-0000-0000-8000-00000000${suffix === "one" ? "0003" : "0009"}', '71000000-0000-0000-8000-00000000${suffix === "one" ? "0004" : "0010"}', '${operation(`child:${suffix}:v1`)}')`);
}

function appendOverlay(branch, suffix) {
  const key = `blueprint-live-cow-${suffix}`;
  const execution = suffix === "one" ? "71000000-0000-0000-8000-000000000005" : "71000000-0000-0000-8000-000000000011";
  const effect = suffix === "one" ? "71000000-0000-0000-8000-000000000006" : "71000000-0000-0000-8000-000000000012";
  return json(`lifeos_runtime.append_branch_overlay_v2('${branch}','lifeos_runtime.canonical_projection'::regclass,'{"probe":"${key}"}'::jsonb,'insert',NULL,convert_to('{"value":"${key}","bytes":true}', 'UTF8'),'{"value":"${key}","bytes":true}'::jsonb,'${execution}','${effect}','${operation(`overlay:${suffix}:v1`)}')`);
}

function mirror(branch, suffix) {
  const execution = suffix === "one" ? "71000000-0000-0000-8000-000000000007" : "71000000-0000-0000-8000-000000000013";
  const effect = suffix === "one" ? "71000000-0000-0000-8000-000000000008" : "71000000-0000-0000-8000-000000000014";
  return uuid(`lifeos_rvf.mirror_branch_membership_v2('${branch}',NULL,convert_to('{"container":"${suffix}","generation":1}', 'UTF8'),convert_to('{"range":"full"}', 'UTF8'),'${execution}','${effect}','${operation(`rvf:${suffix}:v1`)}')`);
}

function recordGates(branch, suffix) {
  const gateExecutionBase = suffix === "one" ? 21 : 31;
  const kinds = ["build", "byte-reconstruction", "security", "static-analysis", "test", "witness-integrity"];
  for (const [index, kind] of kinds.entries()) {
    const n = String(gateExecutionBase + index).padStart(12, "0");
    const effect = String(gateExecutionBase + 11 + index).padStart(12, "0");
    const idempotency = kind.replaceAll("-", "");
    scalar(`lifeos_runtime.record_merge_gate_v2('${branch}','${kind}',true,convert_to('{"gate":"${kind}","status":"passed"}','UTF8'),'72000000-0000-0000-8000-${n}','72000000-0000-0000-8000-${effect}','${operation(`gate:${suffix}:${idempotency}:v1`)}')`);
  }
  if (scalar(`lifeos_runtime.branch_gates_satisfied_v2('${branch}')`) !== "t") {
    throw new Error(`merge gates did not pass for ${suffix}`);
  }
}

const rootBranch = uuid(`lifeos_runtime.create_root_branch_v2('${tenant}','bootstrap','${operation("root")}', '{"required_gates":[],"conflict_classes":["byte"]}'::jsonb, '{"runtime":"lifeos","test":"live"}'::jsonb, 'codex-live-cow', '71000000-0000-0000-8000-000000000001', '71000000-0000-0000-8000-000000000002', '${operation("root:v1")}')`);
const firstChild = createChild(rootBranch, "one");
const firstOverlay = appendOverlay(firstChild, "one");
const firstContainer = mirror(firstChild, "one");
const beforeMerge = json(`jsonb_build_object('child_members', (SELECT count(*) FROM lifeos_runtime.resolved_branch_members_v2('${firstChild}',1)), 'root_members', (SELECT count(*) FROM lifeos_runtime.resolved_branch_members_v2('${rootBranch}',0)))`);
if (beforeMerge.child_members !== 1 || beforeMerge.root_members !== 0) throw new Error("COW overlay was visible outside the proposal branch");
recordGates(firstChild, "one");
const firstMerge = json(`lifeos_runtime.merge_branch_v2('${firstChild}','${rootBranch}','73000000-0000-0000-8000-000000000001','73000000-0000-0000-8000-000000000002','${operation("merge:one:v1")}')`);
const firstPromotion = uuid(`lifeos_runtime.promote_branch_v2('${tenant}','blueprint-live-cow','${firstChild}','73000000-0000-0000-8000-000000000003','73000000-0000-0000-8000-000000000004','${operation("promote:one:v1")}')`);

const secondChild = createChild(rootBranch, "two");
const secondOverlay = appendOverlay(secondChild, "two");
const secondContainer = mirror(secondChild, "two");
recordGates(secondChild, "two");
const secondMerge = json(`lifeos_runtime.merge_branch_v2('${secondChild}','${rootBranch}','73000000-0000-0000-8000-000000000005','73000000-0000-0000-8000-000000000006','${operation("merge:two:v1")}')`);
const secondPromotion = uuid(`lifeos_runtime.promote_branch_v2('${tenant}','blueprint-live-cow','${secondChild}','73000000-0000-0000-8000-000000000007','73000000-0000-0000-8000-000000000008','${operation("promote:two:v1")}')`);
const rollbackPromotion = uuid(`lifeos_runtime.rollback_branch_v2('${tenant}','blueprint-live-cow','${firstPromotion}','73000000-0000-0000-8000-000000000009','73000000-0000-0000-8000-000000000010','${operation("rollback:v1")}')`);

const verification = json(`jsonb_build_object(
  'capability', lifeos_runtime.cow_branch_capability(),
  'root_branch', '${rootBranch}'::uuid,
  'first_child', '${firstChild}'::uuid,
  'second_child', '${secondChild}'::uuid,
  'first_overlay', '${JSON.stringify(firstOverlay)}'::jsonb,
  'second_overlay', '${JSON.stringify(secondOverlay)}'::jsonb,
  'first_container', '${firstContainer}'::uuid,
  'second_container', '${secondContainer}'::uuid,
  'first_merge', '${JSON.stringify(firstMerge)}'::jsonb,
  'second_merge', '${JSON.stringify(secondMerge)}'::jsonb,
  'first_promotion', '${firstPromotion}'::uuid,
  'second_promotion', '${secondPromotion}'::uuid,
  'rollback_promotion', '${rollbackPromotion}'::uuid,
  'rollback_snapshot_valid', lifeos_runtime.compare_promotion_snapshot_v2('${rollbackPromotion}'),
  'active_snapshot', (SELECT to_jsonb(snapshot) FROM lifeos_runtime.active_branch_snapshot_v2('${tenant}','blueprint-live-cow') snapshot),
  'proposal_isolation_before_merge', '${JSON.stringify(beforeMerge)}'::jsonb,
  'branch_overlay_count', (SELECT count(*) FROM lifeos_runtime.branch_overlay_pre_s16 WHERE branch_id IN ('${firstChild}','${secondChild}')),
  'rvf_container_count', (SELECT count(*) FROM lifeos_rvf.container_pre_s16 WHERE branch_id IN ('${firstChild}','${secondChild}'))
)`);

if (verification.capability?.implemented !== true || verification.capability?.rvf_roundtrip !== true || verification.capability?.runtime_digest_binding !== true || verification.rollback_snapshot_valid !== true) {
  throw new Error(`COW capability did not remain accepted: ${JSON.stringify(verification)}`);
}

const receipt = {
  schema_version: "lifeos.evidence.cow-branch-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  authority_invariants: [1, 2, 9, 10, 11, 12, 14, 15, 18],
  status: "passed",
  execution: "real PostgreSQL/RuVector v2 COW runtime",
  connection: { database: new URL(databaseUrl).pathname.slice(1), user: new URL(databaseUrl).username || process.env.USER || "unknown", password_recorded: false },
  verification,
};
const receiptPath = join(root, "evidence/cow/live-branch-receipt.json");
mkdirSync(join(root, "evidence/cow"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: receiptPath, status: receipt.status, root_branch: rootBranch, rollback_promotion: rollbackPromotion }, null, 2));
