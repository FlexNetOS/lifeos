#!/usr/bin/env bun

import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import Ajv2020 from "ajv/dist/2020.js";

export const SOURCE_COMMIT = "c84740532ded2a27ee283ea7a3a5f303eaeb61a7";
const SOURCE_REPO = "src/nu_plugin";
const TASK_TABLE_ROOT = "planning-spine-v0/task_tables";
const RECONCILIATION_PATH = "planning-spine-v0/generated/task_table_reconciliation.csv";

const SOURCE_FILES = [
  { name: "TASK_GRAPH.csv", taxonomy: "graph", family: "core", sha256: "fc8bf8b0f73e2a0441917a80d8a7b75c286771b1effade5944aec091b567abbc" },
  { name: "BIDIRECTIONAL_TASK_GRAPH.csv", taxonomy: "graph", family: "bidirectional", sha256: "0b555a6257d6459d41ea659e062fb6222be88c4d8f2b79c4d26f71289044ed21" },
  { name: "POLYGLOT_TASK_GRAPH.csv", taxonomy: "graph", family: "polyglot", sha256: "2c3e992a7bf68fcb12bc8a006568c29c38b89ee410807e3791a85bea2d21679b" },
  { name: "TASK_FILE_MAP.csv", taxonomy: "scope", family: "core", sha256: "4a2424c6a7c9e4841140310664f1bcc213f12e2af7330a3309333ccbb105a575" },
  { name: "BIDIRECTIONAL_TASK_FILE_MAP.csv", taxonomy: "scope", family: "bidirectional", sha256: "44225bcac82ee8cff7326c6b4922a7ee95827c455ae141061a5e0303e03f8e8c" },
  { name: "POLYGLOT_TASK_FILE_MAP.csv", taxonomy: "scope", family: "polyglot", sha256: "992c85a81d730c413a187c2454da094bd0f4bf4d3f5559cb6018668d94d22506" },
  { name: "REQUIREMENT_PROOF_LEDGER.csv", taxonomy: "requirements", family: "evidence", sha256: "a233412242c26d08cc9d99e3b9d321c015f68a878ab0f4d0ef41d828c0998232" },
  { name: "COMMAND_LEDGER.csv", taxonomy: "commands", family: "history", sha256: "e230d1c64568e8642429f7198e97fd22c86025bdc3f14f694a9e7e784e405991" },
];

const EXPECTED_TAXONOMY = Object.freeze({ graph: 106, scope: 106, requirements: 140, commands: 76, total: 428 });
const BLOCKED_PATHS = ["src/nu_plugin/**/.env", "src/nu_plugin/**/secrets/**", "src/nu_plugin/**/*.pem", "src/nu_plugin/**/*.key"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(sortDeep(value));
}

function prettyJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function jsonLines(records) {
  return records.length ? `${records.map(stableJson).join("\n")}\n` : "";
}

function chainRecords(records, { sequenceField, previousField, hashField, hashPrefix = "sha256:" }) {
  let previous = null;
  return records.map((record, index) => {
    const chained = { ...record, [sequenceField]: index + 1, [previousField]: previous };
    const digest = `${hashPrefix}${sha256(stableJson(chained))}`;
    const output = { ...chained, [hashField]: digest };
    previous = digest;
    return output;
  });
}

function verifyRecordChain(records, { sequenceField, previousField, hashField, hashPrefix = "sha256:" }) {
  let previous = null;
  const errors = [];
  records.forEach((record, index) => {
    const sequence = index + 1;
    if (record[sequenceField] !== sequence) errors.push(`sequence ${record[sequenceField]} expected ${sequence}`);
    if (record[previousField] !== previous) errors.push(`previous hash mismatch at ${sequence}`);
    const { [hashField]: actualHash, ...hashInput } = record;
    const expectedHash = `${hashPrefix}${sha256(stableJson(hashInput))}`;
    if (actualHash !== expectedHash) errors.push(`hash mismatch at ${sequence}`);
    previous = actualHash;
  });
  return { valid: errors.length === 0, errors, count: records.length, head: previous };
}

export function computeDispatch({ workOrders, approvals = [], statuses = {}, activeLeases = [] }) {
  const approvalByTask = new Map(approvals.map((approval) => [approval.task_id, approval]));
  const leasedTasks = new Set(activeLeases.filter((lease) => lease.state === "held").map((lease) => lease.task_id));
  const statusByTask = new Map(workOrders.map((task) => [task.work_order_id, statuses[task.work_order_id] || task.status]));
  const runnableTasks = [];
  const approvalBlockers = [];
  const blockedTasks = [];

  for (const task of workOrders) {
    const localStatus = statusByTask.get(task.work_order_id);
    if (["verified", "failed", "rolled_back", "cancelled"].includes(localStatus)) continue;
    const unmet = task.depends_on.filter((dependency) => statusByTask.get(dependency) !== "verified");
    if (unmet.length) {
      blockedTasks.push({ task_id: task.work_order_id, reason: "unmet_dependencies", dependencies: unmet, packet_uri: `packets/${task.work_order_id}.json` });
      continue;
    }
    const approval = approvalByTask.get(task.work_order_id);
    if (!approval || approval.status !== "approved" || approval.intent_lock_digest !== task.intent_lock.digest) {
      approvalBlockers.push({ task_id: task.work_order_id, reason: "human_approval_required", approval_id: `APPROVAL-${task.work_order_id}`, packet_uri: `packets/${task.work_order_id}.json` });
      continue;
    }
    if (leasedTasks.has(task.work_order_id)) {
      blockedTasks.push({ task_id: task.work_order_id, reason: "active_lease", dependencies: [], packet_uri: `packets/${task.work_order_id}.json` });
      continue;
    }
    runnableTasks.push({ task_id: task.work_order_id, packet_uri: `packets/${task.work_order_id}.json`, approval_id: approval.approval_id || `APPROVAL-${task.work_order_id}`, lease_required: true });
  }

  return {
    schema: "lifeos.task-dispatch.v1",
    task_count: workOrders.length,
    status_authority: "LifeOS-local status only; source_status is ignored for dispatch",
    runnable_count: runnableTasks.length,
    dispatch_count: runnableTasks.length,
    approval_blocker_count: approvalBlockers.length,
    blocked_count: blockedTasks.length,
    runnable_tasks: runnableTasks,
    dispatch_packets: runnableTasks,
    approval_blockers: approvalBlockers,
    blocked_tasks: blockedTasks,
    statuses: Object.fromEntries(statusByTask),
  };
}

function validateRuntimeTaskId(taskIdValue) {
  if (!/^TASK-CDB\d{3}$/.test(taskIdValue)) throw new Error(`invalid task id: ${taskIdValue}`);
}

export async function acquireTaskLease({ runtimeRoot, taskId: taskIdValue, holder, intentLockDigest, ttlMs = 900_000, acquiredAt = new Date().toISOString() }) {
  validateRuntimeTaskId(taskIdValue);
  if (!holder) throw new Error("lease holder is required");
  if (!/^blake3:[a-f0-9]{64}$/.test(intentLockDigest || "")) throw new Error("valid intent lock digest is required");
  const leaseDir = path.join(runtimeRoot, "leases");
  const leasePath = path.join(leaseDir, `${taskIdValue}.json`);
  await mkdir(leaseDir, { recursive: true });
  const token = randomUUID();
  const lease = {
    schema: "lifeos.atomic-task-lease.v1",
    task_id: taskIdValue,
    holder,
    token,
    state: "held",
    generation: 1,
    intent_lock_digest: intentLockDigest,
    acquired_at: acquiredAt,
    ttl_ms: ttlMs,
  };
  let handle;
  try {
    handle = await open(leasePath, "wx", 0o600);
    await handle.writeFile(prettyJson(lease));
    await handle.sync();
    return { status: "acquired", ...lease };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const blockingLease = JSON.parse(await readFile(leasePath, "utf8"));
    return { status: "blocked", task_id: taskIdValue, blocking_lease: blockingLease };
  } finally {
    await handle?.close();
  }
}

export async function releaseTaskLease({ runtimeRoot, taskId: taskIdValue, token }) {
  validateRuntimeTaskId(taskIdValue);
  const leasePath = path.join(runtimeRoot, "leases", `${taskIdValue}.json`);
  const lease = JSON.parse(await readFile(leasePath, "utf8"));
  if (!token || lease.token !== token) throw new Error("lease token mismatch");
  await unlink(leasePath);
  return { status: "released", task_id: taskIdValue, token };
}

async function appendHashChainedRuntimeRecord({ runtimeRoot, ledgerName, record, sequenceField, previousField, hashField }) {
  const ledgerDir = path.join(runtimeRoot, "ledgers");
  const ledgerPath = path.join(ledgerDir, `${ledgerName}.jsonl`);
  const lockPath = `${ledgerPath}.lock`;
  await mkdir(ledgerDir, { recursive: true });
  let lockHandle;
  try {
    lockHandle = await open(lockPath, "wx", 0o600);
    let records = [];
    try {
      const current = await readFile(ledgerPath, "utf8");
      records = current.trim() ? current.trim().split("\n").map(JSON.parse) : [];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const chain = verifyRecordChain(records, { sequenceField, previousField, hashField });
    if (!chain.valid) throw new Error(`refusing append to invalid ${ledgerName} chain: ${chain.errors.join("; ")}`);
    const [next] = chainRecords([{ ...record }], { sequenceField, previousField, hashField });
    next[sequenceField] = records.length + 1;
    next[previousField] = chain.head;
    const { [hashField]: ignored, ...hashInput } = next;
    next[hashField] = `sha256:${sha256(stableJson(hashInput))}`;
    const ledgerHandle = await open(ledgerPath, "a", 0o600);
    try {
      await ledgerHandle.writeFile(`${stableJson(next)}\n`);
      await ledgerHandle.sync();
    } finally {
      await ledgerHandle.close();
    }
    return next;
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`runtime ledger is busy: ${ledgerName}`);
    throw error;
  } finally {
    await lockHandle?.close();
    if (lockHandle) await unlink(lockPath).catch(() => {});
  }
}

export async function appendRuntimeEvent({ runtimeRoot, runId, taskId: taskIdValue, eventType, actor, occurredAt = new Date().toISOString(), payload = {}, evidenceRefs = [] }) {
  validateRuntimeTaskId(taskIdValue);
  if (!runId || !eventType || !actor) throw new Error("runId, eventType, and actor are required");
  return appendHashChainedRuntimeRecord({
    runtimeRoot,
    ledgerName: "events",
    sequenceField: "event_seq",
    previousField: "previous_event_hash",
    hashField: "event_hash",
    record: { schema: "lifeos.runtime-event.v1", run_id: runId, task_id: taskIdValue, event_type: eventType, actor, occurred_at: occurredAt, payload, evidence_refs: evidenceRefs },
  });
}

export async function appendProofRecord({ runtimeRoot, taskId: taskIdValue, status, actor, recordedAt = new Date().toISOString(), evidence = [], verificationOutput = {}, intentLockDigest, checksums = {}, rollbackPoint = null }) {
  validateRuntimeTaskId(taskIdValue);
  if (!["passed", "failed", "blocked"].includes(status)) throw new Error("proof status must be passed, failed, or blocked");
  if (!actor) throw new Error("proof actor is required");
  if (status === "passed" && (!evidence.length || !Object.keys(verificationOutput).length)) throw new Error("passed proof requires evidence and verification output");
  return appendHashChainedRuntimeRecord({
    runtimeRoot,
    ledgerName: "proofs",
    sequenceField: "proof_seq",
    previousField: "previous_proof_hash",
    hashField: "proof_hash",
    record: { schema: "lifeos.task-proof.v1", proof_id: `PROOF-${taskIdValue}-${randomUUID()}`, task_id: taskIdValue, status, actor, recorded_at: recordedAt, intent_lock_digest: intentLockDigest || null, evidence, verification_output: verificationOutput, checksums, rollback_point: rollbackPoint },
  });
}

export async function recordCheckpoint({ runtimeRoot, taskId: taskIdValue, checkpointRef, checkpointHash, recordedAt = new Date().toISOString(), actor, intentLockDigest }) {
  validateRuntimeTaskId(taskIdValue);
  if (!checkpointRef || !/^sha256:[a-f0-9]{64}$/.test(checkpointHash || "")) throw new Error("checkpoint reference and sha256 hash are required");
  if (!actor) throw new Error("checkpoint actor is required");
  return appendHashChainedRuntimeRecord({
    runtimeRoot,
    ledgerName: "checkpoints",
    sequenceField: "checkpoint_seq",
    previousField: "previous_checkpoint_hash",
    hashField: "checkpoint_record_hash",
    record: { schema: "lifeos.task-checkpoint.v1", checkpoint_id: `CHECKPOINT-${taskIdValue}-${randomUUID()}`, task_id: taskIdValue, checkpoint_kind: "pre_execution", checkpoint_ref: checkpointRef, checkpoint_hash: checkpointHash, actor, recorded_at: recordedAt, intent_lock_digest: intentLockDigest || null, status: "recorded" },
  });
}

export function parseCsv(input) {
  const text = String(input).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows.at(-1).every((cell) => cell === "")) rows.pop();
  if (!rows.length) throw new Error("CSV has no header");

  const [header, ...dataRows] = rows;
  const records = dataRows.map((cells, index) => {
    if (cells.length !== header.length) {
      throw new Error(`CSV record ${index + 2} has ${cells.length} fields; expected ${header.length}`);
    }
    return Object.fromEntries(header.map((name, fieldIndex) => [name, cells[fieldIndex]]));
  });
  return { header, records };
}

function encodeCsvCell(value) {
  const rendered = value === null || value === undefined
    ? ""
    : Array.isArray(value)
      ? value.join(";")
      : typeof value === "object"
        ? stableJson(value)
        : String(value);
  return /[",\r\n]/.test(rendered) ? `"${rendered.replaceAll('"', '""')}"` : rendered;
}

function toCsv(columns, rows) {
  return `${[columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((cells) => cells.map(encodeCsvCell).join(","))
    .join("\n")}\n`;
}

function splitList(value) {
  if (!value) return [];
  return value.split(";").map((part) => part.trim()).filter(Boolean);
}

export function workspacePath(value) {
  if (!value) return null;
  let normalized = value.trim().replaceAll("\\", "/");
  if (!normalized) return null;
  if (normalized.startsWith(`${SOURCE_REPO}/`)) return normalized;
  normalized = normalized.replace(/^file:/, "").replace(/^\.\//, "");
  if (normalized.startsWith("external:")) {
    normalized = normalized.slice("external:".length).replace(/^(\.\.\/)+/, "").replace(/^\/+/, "");
    return normalized.startsWith("src/") ? normalized : `src/${normalized}`;
  } else if (normalized.startsWith("../")) {
    normalized = normalized.replace(/^(\.\.\/)+/, "").replace(/^\/+/, "");
    return normalized.startsWith("src/") ? normalized : `src/${normalized}`;
  } else {
    const repositoryMarker = "/nu_plugin/";
    const repositoryOffset = normalized.lastIndexOf(repositoryMarker);
    if (repositoryOffset >= 0) {
      normalized = normalized.slice(repositoryOffset + repositoryMarker.length);
    } else if (normalized.startsWith("/")) {
      const segments = normalized.split("/").filter(Boolean);
      normalized = `external/${segments.slice(-2).join("/")}`;
    }
    normalized = normalized.replace(/^(\.\.\/)+/, "").replace(/^\/+/, "");
  }
  return `${SOURCE_REPO}/${normalized}`;
}

export function normalizeReference(value) {
  if (!value) return null;
  const normalized = value.trim();
  if (/^(?:https?:\/\/|gitkb:|urn:)/i.test(normalized)) return normalized;
  return workspacePath(normalized);
}

function workspacePaths(value, fallback = []) {
  const paths = splitList(value).map(workspacePath).filter(Boolean);
  return paths.length ? [...new Set(paths)] : fallback;
}

function taskId(correlationId) {
  return `TASK-${correlationId}`;
}

function mapTaskRefs(value) {
  return splitList(value).map(taskId);
}

function sourceRef(file, recordIndex) {
  return {
    commit: SOURCE_COMMIT,
    path: `execution/${file.name}`,
    record: recordIndex + 1,
    csv_row: recordIndex + 2,
    sha256: file.sha256,
  };
}

export function intentLockPayload(workOrder) {
  const covered = [
    "schema", "work_order_id", "correlation_id", "title", "goal", "phase", "source", "source_context", "source_status", "status",
    "repo_path", "filesystem_scope", "input_files", "target_files", "allowed_paths", "blocked_paths", "depends_on", "blocks",
    "companion_gate_ref", "verification_command", "completion_gate", "deterministic", "allows_network",
    "allows_dependency_install", "allows_dependency_changes", "proof_required", "proof_uri", "human_approval_required",
    "execution_policy", "rollback_plan",
  ];
  return Object.fromEntries(covered.map((field) => [field, workOrder[field]]));
}

function attachIntentLock(workOrder) {
  const digest = bytesToHex(blake3(new TextEncoder().encode(stableJson(intentLockPayload(workOrder)))));
  return {
    ...workOrder,
    intent_lock: {
      schema: "lifeos.intent-lock.v1",
      algorithm: "BLAKE3-256",
      canonicalization: "sorted-key-json-utf8-v1",
      digest: `blake3:${digest}`,
    },
  };
}

function normalizeWorkOrder(file, row, recordIndex) {
  const correlationId = row.task_id;
  const title = row.title || row.task_name;
  const rawInputs = row.input_artifacts || row.source_file || "";
  const rawTargets = row.output_artifacts || row.primary_outputs || row.primary_artifact || "";
  const inputFiles = workspacePaths(rawInputs);
  const targetFiles = workspacePaths(rawTargets);
  const allowedPaths = workspacePaths(row.allowed_files || rawTargets, targetFiles.length ? targetFiles : [`${SOURCE_REPO}/**`]);
  const validation = row.validation_gate || "";
  const workOrder = {
    schema: "handoff.task.v1",
    work_order_id: taskId(correlationId),
    correlation_id: correlationId,
    title,
    goal: row.acceptance_signal || row.goal_ref || title,
    phase: row.phase || "unspecified",
    source: sourceRef(file, recordIndex),
    source_context: {
      family: file.family,
      owner_surface: row.owner_surface || row.target_surface || null,
      source_truth: normalizeReference(row.source_truth || row.authoritative_source || ""),
      source_files: workspacePaths(row.source_file),
      checklist_ref: row.checklist_ref || null,
      goal_ref: row.goal_ref || null,
      subgoal_ref: row.subgoal_ref || null,
      prd_sections: row.prd_sections || null,
      governing_docs: workspacePaths(row.governing_docs),
      acceptance_refs: workspacePaths(row.acceptance_refs),
      first_run_refs: workspacePaths(row.first_run_refs),
      stop_condition_refs: workspacePaths(row.stop_condition_refs),
      stop_condition: row.stop_condition || null,
      evidence_paths: workspacePaths(row.evidence_path || row.evidence_artifacts),
      raw_log_paths: workspacePaths(row.raw_log_path),
      gitkb_slug: row.gitkb_slug || null,
      notes: row.notes || null,
      safety_constraints: splitList(row.safety_constraints),
    },
    source_status: row.status || "unspecified",
    status: "review",
    repo_path: SOURCE_REPO,
    filesystem_scope: `${SOURCE_REPO}/**`,
    input_files: inputFiles,
    target_files: targetFiles,
    allowed_paths: allowedPaths,
    blocked_paths: BLOCKED_PATHS,
    depends_on: mapTaskRefs(row.depends_on),
    blocks: mapTaskRefs(row.blocks),
    companion_gate_ref: `GATE-${correlationId}`,
    verification_command: validation || null,
    completion_gate: row.acceptance_signal || validation || "Requires a new LifeOS-local proof before execution status may advance.",
    deterministic: true,
    allows_network: false,
    allows_dependency_install: false,
    allows_dependency_changes: false,
    proof_required: true,
    proof_uri: null,
    human_approval_required: true,
    execution_policy: {
      mode: "review-only",
      source_claims_are_provenance_not_local_proof: true,
      workspace_root_required: true,
      deterministic: true,
      allows_network: false,
      allows_dependency_install: false,
      allows_dependency_changes: false,
    },
    rollback_plan: `Remove only the LifeOS review handoff for ${taskId(correlationId)} and regenerate from the pinned ${SOURCE_COMMIT} snapshot; never mutate ${SOURCE_REPO} from this import record.`,
  };
  return attachIntentLock(workOrder);
}

function normalizeGate(file, row, recordIndex) {
  const correlationId = row.task_id;
  return {
    schema: "lifeos.companion-gate.v1",
    gate_id: `GATE-${correlationId}`,
    work_order_id: taskId(correlationId),
    correlation_id: correlationId,
    source: sourceRef(file, recordIndex),
    must_read: workspacePaths(row.must_read),
    may_update: workspacePaths(row.may_update),
    must_update_on_change: workspacePaths(row.must_update_on_change),
    validation_gates: splitList(row.validation_gate || row.validation_commands),
    safety_constraints: splitList(row.safety_constraints),
    local_status: "review",
  };
}

function correlatedTaskId(row, taskIds) {
  for (const candidate of [row.task_id, row.parent_id, row.source_ref, row.requirement_id]) {
    if (candidate && taskIds.has(candidate)) return candidate;
  }
  return null;
}

function normalizeRequirement(file, row, recordIndex, taskIds) {
  const correlationId = correlatedTaskId(row, taskIds);
  return {
    schema: "lifeos.requirement-evidence.v1",
    record_id: `REQUIREMENT-${String(recordIndex + 1).padStart(3, "0")}`,
    requirement_id: row.requirement_id,
    parent_id: row.parent_id || null,
    correlation_id: correlationId,
    work_order_id: correlationId ? taskId(correlationId) : null,
    source: sourceRef(file, recordIndex),
    requirement: row.requirement,
    authoritative_source: normalizeReference(row.authoritative_source),
    source_reference: row.source_ref || null,
    implementation_paths: workspacePaths(row.implementation_paths),
    test_paths: workspacePaths(row.test_paths),
    verification_command: row.verification_command || null,
    proof_artifacts: splitList(row.proof_artifacts),
    proof_head_sha: row.proof_head_sha || null,
    evidence_status: row.evidence_status || null,
    source_status: row.task_status || null,
    local_status: "review",
    notes: row.notes || null,
    executable: false,
  };
}

function normalizeCommand(file, row, recordIndex, taskIds) {
  const correlationId = correlatedTaskId(row, taskIds);
  const exitCode = row.exit_code === "" ? null : Number(row.exit_code);
  return {
    schema: "lifeos.command-history.v1",
    record_id: `COMMAND-${String(recordIndex + 1).padStart(3, "0")}`,
    correlation_id: correlationId,
    work_order_id: correlationId ? taskId(correlationId) : null,
    source: sourceRef(file, recordIndex),
    timestamp_utc: row.timestamp_utc,
    source_cwd: row.cwd,
    workspace_cwd: SOURCE_REPO,
    source_repo: row.repo,
    command: row.command,
    output_paths: workspacePaths(row.output_path),
    exit_code: Number.isFinite(exitCode) ? exitCode : null,
    redaction: row.redaction || null,
    notes: row.notes || null,
    executable: false,
  };
}

function workOrderSchema() {
  const stringArray = { type: "array", items: { type: "string" }, uniqueItems: true };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://lifeos.local/schemas/handoff.task.v1.schema.json",
    title: "LifeOS review-only task handoff",
    type: "object",
    additionalProperties: false,
    required: [
      "schema", "work_order_id", "correlation_id", "title", "goal", "phase", "source", "source_context", "source_status", "status", "repo_path",
      "filesystem_scope", "input_files", "target_files", "allowed_paths", "blocked_paths", "depends_on", "blocks", "companion_gate_ref",
      "verification_command", "completion_gate", "deterministic", "allows_network", "allows_dependency_install", "allows_dependency_changes",
      "proof_required", "proof_uri", "human_approval_required", "execution_policy", "rollback_plan", "intent_lock",
    ],
    properties: {
      schema: { const: "handoff.task.v1" },
      work_order_id: { type: "string", pattern: "^TASK-CDB[0-9]{3}$" },
      correlation_id: { type: "string", pattern: "^CDB[0-9]{3}$" },
      title: { type: "string", minLength: 1 },
      goal: { type: "string", minLength: 1 },
      phase: { type: "string", minLength: 1 },
      source: {
        type: "object",
        additionalProperties: false,
        required: ["commit", "path", "record", "csv_row", "sha256"],
        properties: {
          commit: { const: SOURCE_COMMIT }, path: { type: "string", pattern: "^execution/.+\\.csv$" },
          record: { type: "integer", minimum: 1 }, csv_row: { type: "integer", minimum: 2 }, sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
      },
      source_context: {
        type: "object",
        additionalProperties: false,
        required: ["family", "owner_surface", "source_truth", "source_files", "checklist_ref", "goal_ref", "subgoal_ref", "prd_sections", "governing_docs", "acceptance_refs", "first_run_refs", "stop_condition_refs", "stop_condition", "evidence_paths", "raw_log_paths", "gitkb_slug", "notes", "safety_constraints"],
        properties: {
          family: { enum: ["core", "bidirectional", "polyglot"] },
          owner_surface: { type: ["string", "null"] }, source_truth: { type: ["string", "null"] }, source_files: stringArray,
          checklist_ref: { type: ["string", "null"] }, goal_ref: { type: ["string", "null"] }, subgoal_ref: { type: ["string", "null"] }, prd_sections: { type: ["string", "null"] },
          governing_docs: stringArray, acceptance_refs: stringArray, first_run_refs: stringArray, stop_condition_refs: stringArray,
          stop_condition: { type: ["string", "null"] }, evidence_paths: stringArray, raw_log_paths: stringArray,
          gitkb_slug: { type: ["string", "null"] }, notes: { type: ["string", "null"] }, safety_constraints: stringArray,
        },
      },
      source_status: { type: "string", minLength: 1 },
      status: { const: "review" },
      repo_path: { const: SOURCE_REPO },
      filesystem_scope: { const: `${SOURCE_REPO}/**` },
      input_files: stringArray, target_files: stringArray, allowed_paths: stringArray, blocked_paths: stringArray,
      depends_on: { ...stringArray, items: { type: "string", pattern: "^TASK-CDB[0-9]{3}$" } },
      blocks: { ...stringArray, items: { type: "string", pattern: "^TASK-CDB[0-9]{3}$" } },
      companion_gate_ref: { type: "string", pattern: "^GATE-CDB[0-9]{3}$" },
      verification_command: { type: ["string", "null"] },
      completion_gate: { type: "string", minLength: 1 },
      deterministic: { const: true }, allows_network: { const: false }, allows_dependency_install: { const: false }, allows_dependency_changes: { const: false },
      proof_required: { const: true }, proof_uri: { type: "null" }, human_approval_required: { const: true },
      execution_policy: {
        type: "object",
        additionalProperties: false,
        required: ["mode", "source_claims_are_provenance_not_local_proof", "workspace_root_required", "deterministic", "allows_network", "allows_dependency_install", "allows_dependency_changes"],
        properties: {
          mode: { const: "review-only" }, source_claims_are_provenance_not_local_proof: { const: true }, workspace_root_required: { const: true },
          deterministic: { const: true }, allows_network: { const: false }, allows_dependency_install: { const: false }, allows_dependency_changes: { const: false },
        },
      },
      rollback_plan: { type: "string", minLength: 1 },
      intent_lock: {
        type: "object",
        additionalProperties: false,
        required: ["schema", "algorithm", "canonicalization", "digest"],
        properties: {
          schema: { const: "lifeos.intent-lock.v1" }, algorithm: { const: "BLAKE3-256" }, canonicalization: { const: "sorted-key-json-utf8-v1" },
          digest: { type: "string", pattern: "^blake3:[a-f0-9]{64}$" },
        },
      },
    },
  };
}

function validateWorkOrderSemantics(workOrder) {
  const errors = [];
  const stringArrays = ["input_files", "target_files", "allowed_paths", "blocked_paths", "depends_on", "blocks"];
  if (workOrder.schema !== "handoff.task.v1") errors.push("schema");
  if (!/^TASK-CDB\d{3}$/.test(workOrder.work_order_id)) errors.push("work_order_id");
  if (!/^CDB\d{3}$/.test(workOrder.correlation_id)) errors.push("correlation_id");
  if (workOrder.work_order_id !== taskId(workOrder.correlation_id)) errors.push("id_correlation");
  for (const field of ["title", "goal", "phase", "source_status", "completion_gate", "rollback_plan"]) {
    if (typeof workOrder[field] !== "string" || !workOrder[field]) errors.push(field);
  }
  for (const field of stringArrays) {
    if (!Array.isArray(workOrder[field]) || workOrder[field].some((value) => typeof value !== "string")) errors.push(field);
  }
  if (!workOrder.source_context || !["core", "bidirectional", "polyglot"].includes(workOrder.source_context.family)) errors.push("source_context");
  for (const field of ["input_files", "target_files", "allowed_paths", "blocked_paths"]) {
    if (workOrder[field].some((value) => !value.startsWith(`${SOURCE_REPO}/`) || path.isAbsolute(value))) errors.push(`${field}_root`);
  }
  if (workOrder.status !== "review" || workOrder.repo_path !== SOURCE_REPO || workOrder.filesystem_scope !== `${SOURCE_REPO}/**`) errors.push("review_boundary");
  if (workOrder.deterministic !== true || workOrder.allows_network !== false || workOrder.allows_dependency_install !== false || workOrder.allows_dependency_changes !== false) errors.push("policy");
  if (workOrder.proof_required !== true || workOrder.proof_uri !== null || workOrder.human_approval_required !== true) errors.push("proof_boundary");
  if (!workOrder.intent_lock || !/^blake3:[a-f0-9]{64}$/.test(workOrder.intent_lock.digest || "")) errors.push("intent_lock");
  return errors;
}

function dependencyCycles(workOrders) {
  const dependencies = new Map(workOrders.map((task) => [task.work_order_id, task.depends_on]));
  const visiting = new Set();
  const visited = new Set();
  const cycles = new Set();
  function visit(taskIdValue, trail) {
    if (visiting.has(taskIdValue)) {
      cycles.add([...trail.slice(trail.indexOf(taskIdValue)), taskIdValue].join(" -> "));
      return;
    }
    if (visited.has(taskIdValue)) return;
    visiting.add(taskIdValue);
    for (const dependency of dependencies.get(taskIdValue) || []) visit(dependency, [...trail, taskIdValue]);
    visiting.delete(taskIdValue);
    visited.add(taskIdValue);
  }
  for (const id of dependencies.keys()) visit(id, []);
  return [...cycles];
}

async function readSources(sourceRoot) {
  const loaded = [];
  for (const definition of SOURCE_FILES) {
    const bytes = await readFile(path.join(sourceRoot, definition.name));
    const actualHash = sha256(bytes);
    const parsed = parseCsv(bytes.toString("utf8"));
    loaded.push({ ...definition, bytes, actualHash, ...parsed });
  }
  return loaded;
}

function tabulate(records, fields) {
  return toCsv(fields, records.map((record) => Object.fromEntries(fields.map((field) => [field, record[field]]))));
}

function sourceRowIndex(loaded, recordIds) {
  const records = [];
  for (const file of loaded) {
    file.records.forEach((row, index) => {
      records.push({
        source_row_key: `execution/${file.name}#${index + 1}`,
        taxonomy: file.taxonomy,
        family: file.family,
        source_path: `execution/${file.name}`,
        source_record: index + 1,
        csv_row: index + 2,
        record_id: recordIds.get(`${file.name}:${index + 1}`),
        correlation_id: row.task_id || row.parent_id || row.source_ref || row.requirement_id || null,
      });
    });
  }
  return records;
}

function executionPacketSchema() {
  const stringArray = { type: "array", items: { type: "string" }, uniqueItems: true };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://lifeos.local/schemas/execution-packet.v1.schema.json",
    title: "LifeOS approval-gated execution packet",
    type: "object",
    additionalProperties: false,
    required: ["schema", "packet_id", "task_id", "work_order_ref", "source_commit", "source_status", "status", "intent_lock", "repo_path", "filesystem_scope", "input_files", "target_files", "allowed_paths", "blocked_paths", "depends_on", "blocks", "companion_gate_ref", "approval", "lease", "proof", "checkpoint", "replay", "execution", "rollback_plan"],
    properties: {
      schema: { const: "lifeos.execution-packet.v1" },
      packet_id: { type: "string", pattern: "^PACKET-TASK-CDB[0-9]{3}$" },
      task_id: { type: "string", pattern: "^TASK-CDB[0-9]{3}$" },
      work_order_ref: { type: "string", pattern: "^canonical/work_orders.json#TASK-CDB[0-9]{3}$" },
      source_commit: { const: SOURCE_COMMIT }, source_status: { type: "string", minLength: 1 }, status: { const: "review" },
      intent_lock: {
        type: "object", additionalProperties: false, required: ["algorithm", "digest"],
        properties: { algorithm: { const: "BLAKE3-256" }, digest: { type: "string", pattern: "^blake3:[a-f0-9]{64}$" } },
      },
      repo_path: { const: SOURCE_REPO }, filesystem_scope: { const: `${SOURCE_REPO}/**` },
      input_files: stringArray, target_files: stringArray, allowed_paths: stringArray, blocked_paths: stringArray,
      depends_on: { ...stringArray, items: { type: "string", pattern: "^TASK-CDB[0-9]{3}$" } },
      blocks: { ...stringArray, items: { type: "string", pattern: "^TASK-CDB[0-9]{3}$" } },
      companion_gate_ref: { type: "string", pattern: "^normalized/companion_gates.json#GATE-CDB[0-9]{3}$" },
      approval: {
        type: "object", additionalProperties: false, required: ["required", "approval_id", "status", "decision", "intent_lock_digest"],
        properties: { required: { const: true }, approval_id: { type: "string", pattern: "^APPROVAL-TASK-CDB[0-9]{3}$" }, status: { const: "pending" }, decision: { type: "null" }, intent_lock_digest: { type: "string", pattern: "^blake3:[a-f0-9]{64}$" } },
      },
      lease: {
        type: "object", additionalProperties: false, required: ["required", "scope_id", "protocol", "state"],
        properties: { required: { const: true }, scope_id: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" }, protocol: { const: "atomic-exclusive-create" }, state: { const: "available" } },
      },
      proof: {
        type: "object", additionalProperties: false, required: ["required", "uri", "append_only_ledger", "status"],
        properties: { required: { const: true }, uri: { type: "null" }, append_only_ledger: { const: "ledgers/proofs.jsonl" }, status: { const: "missing" } },
      },
      checkpoint: {
        type: "object", additionalProperties: false, required: ["required_before_execution", "catalog_ref", "status"],
        properties: { required_before_execution: { const: true }, catalog_ref: { type: "string", pattern: "^recovery/checkpoint_catalog.json#CHECKPOINT-REQUIRED-TASK-CDB[0-9]{3}$" }, status: { const: "required" } },
      },
      replay: {
        type: "object", additionalProperties: false, required: ["plan_ref", "dry_run_only", "apply_allowed"],
        properties: { plan_ref: { type: "string", pattern: "^recovery/replay_plan.json#REPLAY-TASK-CDB[0-9]{3}$" }, dry_run_only: { const: true }, apply_allowed: { const: false } },
      },
      execution: {
        type: "object", additionalProperties: false, required: ["command_template", "verification_command", "completion_gate", "deterministic", "allows_network", "allows_dependency_install", "allows_dependency_changes"],
        properties: { command_template: { type: "null" }, verification_command: { type: ["string", "null"] }, completion_gate: { type: "string" }, deterministic: { const: true }, allows_network: { const: false }, allows_dependency_install: { const: false }, allows_dependency_changes: { const: false } },
      },
      rollback_plan: { type: "string", minLength: 1 },
    },
  };
}

function executionPacket(task) {
  return {
    schema: "lifeos.execution-packet.v1",
    packet_id: `PACKET-${task.work_order_id}`,
    task_id: task.work_order_id,
    work_order_ref: `canonical/work_orders.json#${task.work_order_id}`,
    source_commit: SOURCE_COMMIT,
    source_status: task.source_status,
    status: "review",
    intent_lock: { algorithm: task.intent_lock.algorithm, digest: task.intent_lock.digest },
    repo_path: task.repo_path,
    filesystem_scope: task.filesystem_scope,
    input_files: task.input_files,
    target_files: task.target_files,
    allowed_paths: task.allowed_paths,
    blocked_paths: task.blocked_paths,
    depends_on: task.depends_on,
    blocks: task.blocks,
    companion_gate_ref: `normalized/companion_gates.json#${task.companion_gate_ref}`,
    approval: { required: true, approval_id: `APPROVAL-${task.work_order_id}`, status: "pending", decision: null, intent_lock_digest: task.intent_lock.digest },
    lease: { required: true, scope_id: `sha256:${sha256(stableJson(task.allowed_paths))}`, protocol: "atomic-exclusive-create", state: "available" },
    proof: { required: true, uri: null, append_only_ledger: "ledgers/proofs.jsonl", status: "missing" },
    checkpoint: { required_before_execution: true, catalog_ref: `recovery/checkpoint_catalog.json#CHECKPOINT-REQUIRED-${task.work_order_id}`, status: "required" },
    replay: { plan_ref: `recovery/replay_plan.json#REPLAY-${task.work_order_id}`, dry_run_only: true, apply_allowed: false },
    execution: {
      command_template: null,
      verification_command: task.verification_command,
      completion_gate: task.completion_gate,
      deterministic: true,
      allows_network: false,
      allows_dependency_install: false,
      allows_dependency_changes: false,
    },
    rollback_plan: task.rollback_plan,
  };
}

function normalizedTaskGraph(workOrders) {
  const nodes = workOrders.map((task) => ({
    task_id: task.work_order_id,
    correlation_id: task.correlation_id,
    title: task.title,
    phase: task.phase,
    source_status: task.source_status,
    local_status: task.status,
    intent_lock_digest: task.intent_lock.digest,
    packet_uri: `packets/${task.work_order_id}.json`,
    approval_id: `APPROVAL-${task.work_order_id}`,
  }));
  const edges = workOrders.flatMap((task) => [
    ...task.depends_on.map((dependency) => ({ from: task.work_order_id, to: dependency, type: "depends_on" })),
    ...task.blocks.map((blocked) => ({ from: task.work_order_id, to: blocked, type: "blocks" })),
  ]);
  return { schema: "lifeos.normalized-task-graph.v1", namespace: "nu-plugin-cdb-handoff", source_commit: SOURCE_COMMIT, task_count: nodes.length, edge_count: edges.length, nodes, edges };
}

function approvalQueue(workOrders) {
  return {
    schema: "lifeos.human-approval-queue.v1",
    policy: "actual human decision required; no source status or agent inference may approve",
    pending_count: workOrders.length,
    approvals: workOrders.map((task) => ({
      approval_id: `APPROVAL-${task.work_order_id}`,
      task_id: task.work_order_id,
      status: "pending",
      decision: null,
      reviewer: null,
      decided_at: null,
      intent_lock_digest: task.intent_lock.digest,
      eligible_after_dependencies: task.depends_on,
      required_evidence: ["reviewer identity", "explicit decision", "decision timestamp", "review artifact", "intent-lock match"],
    })),
  };
}

function leaseRegistry(workOrders) {
  return {
    schema: "lifeos.atomic-task-lease-registry.v1",
    protocol: { primitive: "exclusive file create (O_CREAT|O_EXCL / Node open wx)", acquire: "acquireTaskLease", release: "releaseTaskLease", token_required_for_release: true },
    held_count: 0,
    slots: workOrders.map((task) => ({
      task_id: task.work_order_id,
      scope_id: `sha256:${sha256(stableJson(task.allowed_paths))}`,
      state: "available",
      generation: 0,
      holder: null,
      token: null,
      intent_lock_digest: task.intent_lock.digest,
      runtime_lease_uri: `runtime/leases/${task.work_order_id}.json`,
    })),
  };
}

function initialEventLedger(workOrders) {
  const records = workOrders.map((task) => ({
    schema: "lifeos.runtime-event.v1",
    run_id: "IMPORT-C847405",
    task_id: task.work_order_id,
    event_type: "work_order_imported_for_review",
    actor: "nu-plugin-task-table-importer",
    occurred_at: "2026-07-13T02:55:47Z",
    payload: { local_status: "review", source_status: task.source_status, intent_lock_digest: task.intent_lock.digest, packet_uri: `packets/${task.work_order_id}.json` },
    evidence_refs: [task.source.path, `raw/${path.basename(task.source.path)}`],
  }));
  return chainRecords(records, { sequenceField: "event_seq", previousField: "previous_event_hash", hashField: "event_hash" });
}

function recoverySurfaces(workOrders) {
  const checkpoints = workOrders.map((task) => ({
    checkpoint_requirement_id: `CHECKPOINT-REQUIRED-${task.work_order_id}`,
    task_id: task.work_order_id,
    status: "required",
    checkpoint_kind: "pre_execution",
    checkpoint_ref: null,
    checkpoint_hash: null,
    intent_lock_digest: task.intent_lock.digest,
    required_before_lease: true,
    append_only_ledger: "runtime/ledgers/checkpoints.jsonl",
  }));
  const replayTasks = workOrders.map((task) => ({
    replay_id: `REPLAY-${task.work_order_id}`,
    task_id: task.work_order_id,
    status: "blocked",
    mode: "dry_run",
    dry_run_allowed: true,
    apply_allowed: false,
    required_approval_id: `APPROVAL-${task.work_order_id}`,
    required_checkpoint_id: `CHECKPOINT-REQUIRED-${task.work_order_id}`,
    required_proof: true,
    intent_lock_digest: task.intent_lock.digest,
    replay_action: "verify recorded inputs, hashes, checkpoint, event chain, and proof before proposing apply",
  }));
  const rollbackTasks = workOrders.map((task) => ({
    rollback_id: `ROLLBACK-${task.work_order_id}`,
    task_id: task.work_order_id,
    status: "unarmed",
    apply_allowed: false,
    human_approval_required: true,
    checkpoint_requirement_id: `CHECKPOINT-REQUIRED-${task.work_order_id}`,
    intent_lock_digest: task.intent_lock.digest,
    rollback_plan: task.rollback_plan,
    safe_boundary: "restore only task-scoped paths from a verified pre-execution checkpoint; never infer rollback from source_status",
  }));
  return {
    checkpointCatalog: { schema: "lifeos.checkpoint-catalog.v1", checkpoint_count: checkpoints.length, recorded_count: 0, checkpoints },
    replayPlan: { schema: "lifeos.replay-plan.v1", task_count: replayTasks.length, apply_allowed_count: 0, tasks: replayTasks },
    rollbackPlan: { schema: "lifeos.rollback-plan.v1", task_count: rollbackTasks.length, armed_count: 0, tasks: rollbackTasks },
  };
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function renderVisualArtifacts({ workOrders, taskGraph, dispatch, approvals, leases, events, recovery }) {
  const mermaid = [
    "flowchart TD",
    "  %% Derived only from canonical/task_graph.normalized.json; source_status never controls dispatch.",
    ...workOrders.map((task) => `  ${task.work_order_id.replaceAll("-", "_")}["${task.work_order_id}: ${task.title.replaceAll('"', "'")}"]`),
    ...taskGraph.edges.filter((edge) => edge.type === "depends_on").map((edge) => `  ${edge.to.replaceAll("-", "_")} --> ${edge.from.replaceAll("-", "_")}`),
    "",
  ].join("\n");
  const dot = [
    "digraph LifeOSTaskHandoff {",
    "  rankdir=LR;",
    "  graph [label=\"LifeOS review-only nu_plugin task handoff\", labelloc=t];",
    "  node [shape=box];",
    ...workOrders.map((task) => `  "${task.work_order_id}" [label="${task.work_order_id}: ${task.title.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}", status="review"];`),
    ...taskGraph.edges.filter((edge) => edge.type === "depends_on").map((edge) => `  "${edge.to}" -> "${edge.from}" [label="unblocks"];`),
    "}",
    "",
  ].join("\n");
  const dashboard = [
    "LifeOS nu_plugin Task Handoff Dashboard",
    "=======================================",
    `Source commit            : ${SOURCE_COMMIT}`,
    `Canonical WorkOrders     : ${String(workOrders.length).padStart(3, " ")}`,
    `Pending human approvals : ${String(approvals.approvals.length).padStart(3, " ")}`,
    `Available lease slots   : ${String(leases.slots.length).padStart(3, " ")}`,
    `Dispatch packets        : ${String(dispatch.dispatch_count).padStart(3, " ")}`,
    `Checkpoint requirements : ${String(recovery.checkpointCatalog.checkpoints.length).padStart(3, " ")}`,
    "Task execution proofs   :   0",
    "Execution status        : not_started",
    "",
    "Truth boundary: source_status is provenance; only LifeOS-local status, explicit human approval, leases, checkpoints, and proof may drive execution.",
    "",
  ].join("\n");
  const eventStream = jsonLines(events.map((event) => ({ schema: "lifeos.live-event-envelope.v1", stream_cursor: event.event_seq, event_hash: event.event_hash, event })));
  const htmlRows = workOrders.map((task) => `<tr data-task-id="${task.work_order_id}"><td>${task.work_order_id}</td><td>${escapeHtml(task.title)}</td><td>${escapeHtml(task.phase)}</td><td>${escapeHtml(task.source_status)}</td><td>review</td><td>pending</td><td>${task.depends_on.map(escapeHtml).join("<br>")}</td></tr>`).join("\n");
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeOS nu_plugin Task Handoff</title><style>body{font-family:system-ui,sans-serif;background:#0b0d10;color:#edf2f7;margin:2rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #30363d;padding:.45rem;text-align:left;vertical-align:top}th{background:#161b22;position:sticky;top:0}.boundary{border-left:4px solid #21d4fd;padding:1rem;background:#11161c}</style></head>
<body><h1>LifeOS nu_plugin Task Handoff</h1><p class="boundary">Review-only projection. Upstream completion is provenance and does not authorize execution.</p><p>Source commit: <code>${SOURCE_COMMIT}</code>. Tasks: ${workOrders.length}. Dispatch: ${dispatch.dispatch_count}. Pending human approvals: ${approvals.approvals.length}.</p><table><thead><tr><th>Task</th><th>Title</th><th>Phase</th><th>Source status</th><th>Local status</th><th>Approval</th><th>Dependencies</th></tr></thead><tbody>
${htmlRows}
</tbody></table></body></html>
`;
  const wikiRows = workOrders.map((task) => `| ${task.work_order_id} | ${task.title.replaceAll("|", "\\|")} | ${task.phase.replaceAll("|", "\\|")} | ${task.source_status} | review | pending | ${task.depends_on.join("; ")} |`).join("\n");
  const wiki = `---
id: lifeos.task-tables.nu-plugin-static-wiki
title: nu_plugin Task Handoff Static Wiki
type: derived-task-view
status: review-only
source_commit: ${SOURCE_COMMIT}
related:
  - "[[planning-spine-v0/task_tables/README]]"
  - "[[planning-spine-v0/task_tables/canonical/task_graph.normalized]]"
---

# nu_plugin Task Handoff Static Wiki

Derived from canonical WorkOrders. Upstream completion is provenance; every local task remains review-only and pending human approval.

| Task | Title | Phase | Source status | Local status | Approval | Dependencies |
|---|---|---|---|---|---|---|
${wikiRows}
`;
  return new Map([
    ["visuals/task_graph.mmd", mermaid],
    ["visuals/task_graph.dot", dot],
    ["visuals/dashboard.txt", dashboard],
    ["visuals/event_stream.ndjson", eventStream],
    ["visuals/task_graph.html", html],
    ["visuals/task_graph.wiki.md", wiki],
  ]);
}

function referenceGapMatrix() {
  const surfaces = [
    ["source_manifest", "source_manifest.json"],
    ["normalized_graph", "canonical/task_graph.normalized.json"],
    ["execution_manifest", "manifests/execution_manifest.json"],
    ["execution_packets", "packets/TASK-CDB000.json..TASK-CDB105.json"],
    ["dependency_dispatch", "control/dispatch_plan.json"],
    ["human_approval", "control/approval_queue.json"],
    ["atomic_leases", "control/lease_registry.json + acquireTaskLease/releaseTaskLease"],
    ["append_only_events", "ledgers/events.jsonl + appendRuntimeEvent"],
    ["append_only_proofs", "ledgers/proofs.jsonl + appendProofRecord"],
    ["checkpoints", "recovery/checkpoint_catalog.json + recordCheckpoint"],
    ["replay", "recovery/replay_plan.json"],
    ["rollback", "recovery/rollback_plan.json"],
    ["receipts", "receipts/artifact_manifest.json"],
    ["completeness", "receipts/completeness_report.json"],
    ["reference_graph_namespaces", "workflow/reference_namespaces.json"],
    ["mandatory_capabilities", "workflow/mandatory_capabilities.json + workflow/mandatory_capabilities.csv"],
    ["mermaid_visual", "visuals/task_graph.mmd"],
    ["graphviz_dot_visual", "visuals/task_graph.dot"],
    ["tui_dashboard", "visuals/dashboard.txt"],
    ["live_event_stream", "visuals/event_stream.ndjson"],
    ["static_html_wiki", "visuals/task_graph.html + visuals/task_graph.wiki.md"],
  ].map(([surface, implementation]) => ({ surface, requirement: "mandatory", implementation_status: "implemented", implementation }));
  return {
    schema: "lifeos.reference-workflow-gap-matrix.v1",
    reference: "../envctl-db-nu-plugin-migration-automation-package/execution-framework",
    policy: "The reference workflow is a design contract; its task statuses and proofs are never imported as LifeOS completion.",
    surfaces,
  };
}

function cdbRefs(...values) {
  return values.map((value) => `TASK-CDB${String(value).padStart(3, "0")}`);
}

function cdbRange(start, end) {
  return cdbRefs(...Array.from({ length: end - start + 1 }, (_, index) => start + index));
}

const MANDATORY_CAPABILITY_DEFINITIONS = [
  {
    id: "CAP-MIG-001",
    title: "Structured human involvement modes",
    sources: [
      ["prompts/MASTER_PROMPT_ENVCTL_DB_NU_PLUGIN.md", 5, 5, "optional human involvement"],
      ["source/current-user-request.md", 5, 5, "active involvement or passive supervision"],
    ],
    mandatoryRequirement: "Model observer, approval-gated, operator, and agent-only as structured modes with explicit authority and transition rules.",
    verificationGate: "Schema and behavior tests must cover all four modes and prove that mode changes cannot bypass approval or risk policy.",
    coverage: cdbRefs(30, 75, 89),
  },
  {
    id: "CAP-MIG-002",
    title: "Required runtime inputs and resolved-path receipts",
    sources: [["prompts/MASTER_PROMPT_ENVCTL_DB_NU_PLUGIN.md", 7, 19, "Resolve all paths with `realpath`"]],
    mandatoryRequirement: "Require the run-context, package, envctl, nu_plugin, and target inputs applicable to a run; resolve each path and persist a resolved-path receipt.",
    verificationGate: "Missing required inputs, unresolved paths, and path/receipt mismatches must fail closed before planning or execution.",
    coverage: cdbRefs(0, 36, 39),
  },
  {
    id: "CAP-MIG-003",
    title: "Generic target descriptor and recipe",
    sources: [["prompts/UTILIZE_FLEXNETOS_PACKAGE.md", 67, 75, "Do not bake FlexNetOS into envctl"]],
    mandatoryRequirement: "Drive every target through a descriptor, recipe, artifact contract, safety policy, scanner capability map, and output policy without target-specific execution branches.",
    verificationGate: "A non-FlexNetOS fixture must traverse the same planner and packet path without conditional target-name logic.",
    coverage: [...cdbRefs(35, 36), ...cdbRange(91, 105)],
  },
  {
    id: "CAP-MIG-004",
    title: "Canonical replay modes",
    sources: [
      ["prompts/DATABASE_FEATURE_SPEC.md", 101, 101, "Replay may be `verify-only`"],
      ["prompts/SECURITY_REPRODUCIBILITY_MODEL.md", 32, 39, "`execute-safe`"],
    ],
    mandatoryRequirement: "Reconcile replay terminology to verify-only, dry-run-plan, execute-safe, and approval-gated-full with explicit destructive-operation approval.",
    verificationGate: "Protocol and CLI tests must accept only the canonical modes, map legacy wording explicitly, and prove full replay remains approval gated.",
    coverage: cdbRefs(72, 73, 74, 75, 76, 87, 88, 89, 90, 102),
  },
  {
    id: "CAP-MIG-005",
    title: "Actor authority and R0-R5 policy",
    sources: [
      ["prompts/DATABASE_FEATURE_SPEC.md", 103, 105, "Agents may create plans"],
      ["prompts/AGENT_CONTROL_PROTOCOL.md", 7, 38, "R4/R5 must default to approval-gated"],
    ],
    mandatoryRequirement: "Represent actors, authority levels, and R0-R5 risk classes as structured policy data enforced at every operation boundary.",
    verificationGate: "Authorization tests must prove each actor/authority combination and require explicit approval for R3+ with fail-closed R4/R5 defaults.",
    coverage: cdbRefs(10, 33, 34, 75, 89, 104),
  },
  {
    id: "CAP-MIG-006",
    title: "Required plugin operational views",
    sources: [["prompts/NU_PLUGIN_CONTRACT.md", 69, 82, "replay plan summaries"]],
    mandatoryRequirement: "Provide status, timeline, operations, approvals, artifacts, graph, validation, and replay views with a plain-terminal fallback.",
    verificationGate: "Contract tests must exercise every view against authoritative records and verify graceful structured output without rich-terminal support.",
    coverage: cdbRefs(29, 30, 31, 32, 103),
  },
  {
    id: "CAP-MIG-007",
    title: "Conflict scope and operation leases",
    sources: [["prompts/AGENT_CONTROL_PROTOCOL.md", 47, 54, "database obtains a lease/lock"]],
    mandatoryRequirement: "Define operation conflict scopes and enforce atomic leases with owner, acquisition, expiry, renewal, release, and live visibility semantics.",
    verificationGate: "Concurrency tests must reject conflicting operations, permit non-conflicting scopes, handle expiry/renewal atomically, and expose the active owner.",
    coverage: cdbRefs(16, 61),
    boundary: "Task-level lease primitives exist in this handoff; the required operation-level lease model remains a companion review gap and is not product-complete.",
    evidence: ["control/lease_registry.json", "import-nu-plugin-task-tables.mjs#acquireTaskLease"],
  },
  {
    id: "CAP-MIG-008",
    title: "Source-bound projections",
    sources: [["prompts/LIVE_VISUALS_AND_HUMAN_CONTROL.md", 28, 30, "No plugin-only inferred state"]],
    mandatoryRequirement: "Every projection must carry authoritative source identifiers and digests; inferred display state must never become migration truth.",
    verificationGate: "Projection tests must trace every row to source IDs/hashes and reject rows lacking an authoritative record.",
    coverage: cdbRefs(18, 35, 55, 63, 85, 89),
  },
  {
    id: "CAP-MIG-009",
    title: "Required rich visual surfaces",
    sources: [["prompts/LIVE_VISUALS_AND_HUMAN_CONTROL.md", 45, 51, "Mermaid graph export"]],
    mandatoryRequirement: "Provide Mermaid, Graphviz DOT, TUI dashboard, live event stream, static HTML, and static wiki projections as required surfaces.",
    verificationGate: "All six projections must be deterministic, receipted, canonical-record-derived, and coverage-equivalent for task and status identity.",
    coverage: cdbRefs(1, 30, 103),
    boundary: "All six surfaces are implemented as deterministic planning projections; runtime product wiring and acceptance remain review-gated.",
    evidence: ["visuals/task_graph.mmd", "visuals/task_graph.dot", "visuals/dashboard.txt", "visuals/event_stream.ndjson", "visuals/task_graph.html", "visuals/task_graph.wiki.md"],
  },
  {
    id: "CAP-MIG-010",
    title: "Nullable compare-root state",
    sources: [["prompts/ANY_TARGET_EXTENSION_SPEC.md", 7, 13, "compare_root: /optional/path"]],
    mandatoryRequirement: "Represent compare_root as nullable with explicit absent, resolved, and path-receipt state rather than an invented path.",
    verificationGate: "Descriptor tests must distinguish absent from resolved values and reject unresolved, unreceipted, or escaped compare roots.",
    coverage: cdbRefs(36, 70, 91),
  },
  {
    id: "CAP-MIG-011",
    title: "Redaction before persistence",
    sources: [["prompts/SECURITY_REPRODUCIBILITY_MODEL.md", 3, 13, "Redact secrets before artifact persistence"]],
    mandatoryRequirement: "Redact credentials and secret material before persisting commands, events, evidence, artifacts, logs, or receipts while recording redaction state.",
    verificationGate: "Secret-fixture tests must prove raw values never reach durable output and that redaction metadata and hashes remain verifiable.",
    coverage: cdbRefs(10, 43, 60, 104),
  },
  {
    id: "CAP-MIG-012",
    title: "Canonical hash-chained events",
    sources: [["prompts/SECURITY_REPRODUCIBILITY_MODEL.md", 41, 47, "event_hash = sha256"]],
    mandatoryRequirement: "Persist events in a canonical SHA-256 chain binding each canonical event to the preceding event hash.",
    verificationGate: "Chain verification and tamper tests must pass for intact ledgers and fail after payload, order, previous-hash, or digest mutation.",
    coverage: cdbRefs(4, 55, 85, 89),
    boundary: "The handoff event chain is implemented and validated locally; the envctl runtime chain and destructive tamper suite remain review-gated product work.",
    evidence: ["ledgers/events.jsonl", "ledgers/ledger_manifest.json"],
  },
  {
    id: "CAP-MIG-013",
    title: "Fail-closed completion proof",
    sources: [["prompts/ACCEPTANCE_CRITERIA.md", 1, 19, "only claim completion"]],
    mandatoryRequirement: "Completion requires a proof record, executed verification command, passing output, and bound digest; partial, planned, not_run, unapplied, or evidence-free claims must not complete.",
    verificationGate: "Negative tests must reject every incomplete evidence state and digest mismatch; only a fully bound passing proof may transition local status.",
    coverage: cdbRefs(2, 28, 39, 46, 64, 65, 66, 67, 68, 69, 90, 102, 105),
  },
  {
    id: "CAP-MIG-014",
    title: "Dependency constraints and blocker evidence",
    sources: [["source/previous-migration-artifact-context.md", 234, 234, "version constraints"]],
    mandatoryRequirement: "Capture dependency constraints, incompatibilities, upgrade blockers, and evidence references rather than dependency names alone.",
    verificationGate: "Dependency validation must reject unresolved constraints/blockers and require evidence for every blocked edge.",
    coverage: cdbRefs(11, 21, 51, 65, 87),
  },
  {
    id: "CAP-MIG-015",
    title: "Artifact stage chain",
    sources: [["source/previous-migration-artifact-context.md", 412, 435, "artifacts should ladder"]],
    mandatoryRequirement: "Link inventory, dependency, risk, target, migration, validation, cutover, and rollback stages as an ordered evidence-bearing artifact chain.",
    verificationGate: "Graph validation must prove every required stage exists in order, has traceable links, and cannot advance across a blocked predecessor.",
    coverage: [...cdbRange(1, 12), ...cdbRange(70, 90)],
  },
  {
    id: "CAP-MIG-016",
    title: "Blocked artifact evidence",
    sources: [["source/codex-flexnetos-migration-prompt-package/prompts/EXECUTION_STYLE.md", 9, 15, "status: blocked"]],
    mandatoryRequirement: "A blocked artifact must identify its blocker and evidence while remaining ineligible for completion claims.",
    verificationGate: "Completion validation must reject blocked artifacts without blocker evidence and reject every blocked artifact presented as complete.",
    coverage: cdbRefs(2, 66, 69, 70),
  },
  {
    id: "CAP-MIG-017",
    title: "Unknown or partial artifacts never complete",
    sources: [["source/codex-flexnetos-migration-prompt-package/expected-output/migration-artifacts-tree.md", 1, 3, "status: unknown"]],
    mandatoryRequirement: "Artifact existence and navigation links are required but unknown or partial artifacts remain non-terminal and cannot satisfy completion.",
    verificationGate: "Status tests must keep linked unknown/partial artifacts incomplete until evidence-backed validation passes.",
    coverage: cdbRefs(1, 5, 66, 70),
  },
  {
    id: "CAP-MIG-018",
    title: "Explicit envctl/nu_plugin boundary",
    sources: [["specs/envctl-nu-plugin-boundary.md", 3, 16, "Boundary options Codex may choose"]],
    mandatoryRequirement: "Select an explicit boundary enum: JSON CLI, shared crate, IPC, or authorized database transaction API, and record rationale plus tests.",
    verificationGate: "Boundary tests must prove nu_plugin cannot mutate durable truth outside the selected authorized interface.",
    coverage: cdbRefs(9, 11, 30, 35, 63, 103),
  },
  {
    id: "CAP-MIG-019",
    title: "Fail-closed filesystem policy",
    sources: [["execution-framework/docs/FILESYSTEM_BOUNDARIES.md", 42, 50, "Blocked patterns take precedence"]],
    mandatoryRequirement: "Apply blocked-first allow/deny evaluation to final resolved paths, deny symlink escapes, and fail closed on unmatched paths.",
    verificationGate: "Path-policy tests must cover blocked precedence, allow matches, unmatched denial, traversal, symlink escape, and all WorkOrder path fields.",
    coverage: cdbRefs(10, 18, 28, 32, 33, 34, 43, 44, 45, 57, 83, 104),
    boundary: "Named WorkOrders anchor the policy and all 106 WorkOrder path fields are in scope; product enforcement remains review-gated.",
  },
  {
    id: "CAP-MIG-020",
    title: "Protocol semantic-version compatibility",
    sources: [["execution-framework/docs/SHARED_PROTOCOL_SCHEMAS.md", 7, 13, "require a new major protocol version"]],
    mandatoryRequirement: "Enforce protocol semver with schema-diff, backward-compatibility, default-value, and nullability tests.",
    verificationGate: "Compatibility tests must allow additive optional minor changes and reject removal, narrowing, enum deletion, and incompatible default/nullability changes without a major version.",
    coverage: cdbRefs(7, 9, 11, 14, 51, 65, 86, 92),
  },
  {
    id: "CAP-MIG-021",
    title: "Self-contained bounded execution packets",
    sources: [["execution-framework/docs/GOAL_LOOP_PROTOCOL.md", 18, 25, "Execution packets are bounded"]],
    mandatoryRequirement: "Each execution packet must be self-contained and narrowly bounded so an executor does not reread or reinterpret the full package.",
    verificationGate: "Packet schema and fixture tests must prove required context, scope, dependencies, gates, verification, and rollback are present without package-wide inference.",
    coverage: cdbRefs(3, 39, 65, 68),
  },
  {
    id: "CAP-MIG-022",
    title: "Contract-first dependency DAG",
    sources: [["README.md", 28, 40, "contract-first parallel implementation"]],
    mandatoryRequirement: "Lock contracts and schemas first, construct their dependency DAG, then open only dependency-safe parallel implementation lanes.",
    verificationGate: "Scheduler tests must block downstream lanes before contract/schema verification and permit only declared independent parallel groups afterward.",
    coverage: cdbRange(0, 12),
  },
  {
    id: "CAP-MIG-023",
    title: "Checkout-bound issue integration",
    sources: [["specs/github-issues-index.md", 1, 9, "actual repo file paths"]],
    mandatoryRequirement: "Bind issue and PR work to actual checkout paths, discovered issue/PR identifiers, and checkout evidence rather than placeholder repository assumptions.",
    verificationGate: "Integration validation must reject missing checkout receipts, invented identifiers, stale paths, and issue/PR evidence not tied to the inspected revision.",
    coverage: cdbRefs(48),
    boundary: "CDB048 anchors the requirement, but actual issue/PR integration and checkout evidence are an explicit companion review gap.",
  },
  {
    id: "CAP-MIG-024",
    title: "Deterministic seed identity",
    sources: [["sql/003_seed_artifact_contract.sql", 1, 12, "real IDs/hashes"]],
    mandatoryRequirement: "Generate seed records deterministically from bound source IDs and digests and reject invented literal identities.",
    verificationGate: "Regeneration must be byte-stable for the same inputs and fail on unbound IDs, missing digests, or hand-authored placeholder literals.",
    coverage: cdbRefs(5, 14, 15, 16, 47, 55, 90),
  },
  {
    id: "CAP-MIG-025",
    title: "Database-owned artifact truth",
    sources: [["specs/envctl-db-automation-architecture.md", 25, 31, "DB records their identity"]],
    mandatoryRequirement: "Treat files as projections while the database owns artifact identity, digest, links, and status.",
    verificationGate: "Reconciliation tests must prove files derive from database records and cannot independently mutate identity, digest, link, or status truth.",
    coverage: cdbRefs(15, 16, 17, 18, 35, 63, 72, 76, 102),
  },
  {
    id: "CAP-MIG-026",
    title: "Persistent navigable migration memory",
    sources: [["source/codex-flexnetos-migration-prompt-package/README.md", 73, 73, "persistent artifact memory file"]],
    mandatoryRequirement: "Maintain a navigation graph, artifact index, persistent migration memory, and receipted update path for every material change.",
    verificationGate: "Navigation tests must find every artifact bidirectionally and require a deterministic update receipt whenever memory or index state changes.",
    coverage: cdbRefs(1, 4, 5, 47, 48),
  },
];

async function mandatoryCapabilityCatalog(referencePackageRoot, knownWorkOrderIds) {
  const sourceCache = new Map();
  const errors = [];
  async function sourceLines(sourcePath) {
    if (!sourceCache.has(sourcePath)) {
      sourceCache.set(sourcePath, (await readFile(path.join(referencePackageRoot, sourcePath), "utf8")).split(/\r?\n/));
    }
    return sourceCache.get(sourcePath);
  }

  const capabilities = [];
  for (const definition of MANDATORY_CAPABILITY_DEFINITIONS) {
    const sourceRefs = [];
    for (const [sourcePath, lineStart, lineEnd, anchor] of definition.sources) {
      const lines = await sourceLines(sourcePath);
      const sourceWording = lines.slice(lineStart - 1, lineEnd).join("\n");
      if (!sourceWording.includes(anchor)) errors.push(`${definition.id}:source_anchor:${sourcePath}:${lineStart}-${lineEnd}`);
      sourceRefs.push({ path: sourcePath, line_start: lineStart, line_end: lineEnd, source_wording: sourceWording });
    }
    const unknownCoverage = definition.coverage.filter((workOrderId) => !knownWorkOrderIds.has(workOrderId));
    if (unknownCoverage.length) errors.push(`${definition.id}:unknown_work_orders:${unknownCoverage.join("|")}`);
    capabilities.push({
      capability_id: definition.id,
      title: definition.title,
      requirement: "mandatory",
      source_refs: sourceRefs,
      mandatory_requirement: definition.mandatoryRequirement,
      verification_gate: definition.verificationGate,
      coverage_work_order_refs: definition.coverage,
      coverage_boundary: definition.boundary || "Planning coverage is mapped; product implementation and verification remain review-gated.",
      planning_evidence: definition.evidence || [],
      local_status: "review",
      product_complete: false,
    });
  }

  const expectedIds = Array.from({ length: 26 }, (_, index) => `CAP-MIG-${String(index + 1).padStart(3, "0")}`);
  const actualIds = capabilities.map(({ capability_id: capabilityId }) => capabilityId);
  if (stableJson(actualIds) !== stableJson(expectedIds)) errors.push("capability_ids_not_exact_CAP_MIG_001_026");
  if (new Set(actualIds).size !== actualIds.length) errors.push("duplicate_capability_ids");
  if (capabilities.some((capability) => capability.requirement !== "mandatory")) errors.push("non_mandatory_capability");
  if (capabilities.some((capability) => capability.local_status !== "review" || capability.product_complete !== false)) errors.push("capability_completion_promotion");

  return {
    catalog: {
      schema: "lifeos.migration-mandatory-capability-catalog.v1",
      catalog_version: "1.0.0",
      requirement_policy: "All catalog entries are mandatory; none may be downgraded to optional.",
      status_authority: "Companion planning coverage only. Every entry remains review until product-local verification evidence passes.",
      capability_count: capabilities.length,
      capabilities,
    },
    errors,
  };
}

async function listReferencePackageFiles(packageRoot) {
  const files = [];
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if ([".git", ".pytest_cache", "__pycache__"].includes(entry.name)) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.isFile() && relative !== "PACKAGE_MANIFEST.json") {
        const bytes = await readFile(absolute);
        files.push({ path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) });
      }
    }
  }
  await visit(packageRoot);
  return files;
}

export async function auditReferencePackageManifest(packageRoot) {
  const manifestPath = path.join(packageRoot, "PACKAGE_MANIFEST.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const actualFiles = await listReferencePackageFiles(packageRoot);
  const declaredByPath = new Map();
  const duplicatePaths = [];
  for (const entry of manifest.files || []) {
    if (declaredByPath.has(entry.path)) duplicatePaths.push(entry.path);
    declaredByPath.set(entry.path, entry);
  }
  const actualByPath = new Map(actualFiles.map((entry) => [entry.path, entry]));
  const missingFromManifest = actualFiles.filter((entry) => !declaredByPath.has(entry.path)).map((entry) => entry.path);
  const missingFromDisk = [...declaredByPath.keys()].filter((entryPath) => !actualByPath.has(entryPath));
  const hashOrSizeDrift = actualFiles.flatMap((actual) => {
    const declared = declaredByPath.get(actual.path);
    if (!declared || (declared.sha256 === actual.sha256 && declared.bytes === actual.bytes)) return [];
    return [{ path: actual.path, declared_sha256: declared.sha256, actual_sha256: actual.sha256, declared_bytes: declared.bytes, actual_bytes: actual.bytes }];
  });
  const frameworkGraph = parseCsv(await readFile(path.join(packageRoot, "execution-framework/generated/task_graph.csv"), "utf8"));
  const issueGraph = parseCsv(await readFile(path.join(packageRoot, "execution-framework/generated/issue-414/task_graph.csv"), "utf8"));
  const frameworkRoot = path.join(packageRoot, "execution-framework");
  const executionPacketFiles = (await readdir(path.join(frameworkRoot, "generated/execution_packets")))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();
  const proofFiles = (await readdir(path.join(frameworkRoot, "proof_records")))
    .filter((fileName) => fileName.endsWith(".proof.json"))
    .sort();
  const proofLedgerLines = (await readFile(path.join(frameworkRoot, "proof_records/proof_ledger.jsonl"), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const proofLedgerParseErrors = [];
  proofLedgerLines.forEach((line, index) => {
    try { JSON.parse(line); } catch { proofLedgerParseErrors.push(index + 1); }
  });
  const mergedProofLedger = JSON.parse(await readFile(path.join(frameworkRoot, "generated/proof_ledger.merged.json"), "utf8"));
  const mergedProofs = Array.isArray(mergedProofLedger.proofs) ? mergedProofLedger.proofs : [];
  const derivedStatuses = JSON.parse(await readFile(path.join(frameworkRoot, "generated/status_from_proofs.json"), "utf8"));
  const derivedTasks = Array.isArray(derivedStatuses.tasks) ? derivedStatuses.tasks : [];
  const agentApprovalFiles = (await readdir(path.join(frameworkRoot, "approvals")))
    .filter((fileName) => fileName.endsWith(".agent_approval.json"))
    .sort();
  const agentApprovals = await Promise.all(agentApprovalFiles.map(async (fileName) => {
    const approval = JSON.parse(await readFile(path.join(frameworkRoot, "approvals", fileName), "utf8"));
    return {
      task_id: approval.task_id,
      source_decision: approval.decision,
      source: `execution-framework/approvals/${fileName}`,
      classification: "review_evidence_only",
      admissible_as_lifeos_approval: false,
    };
  }));
  const finalVerification = JSON.parse(await readFile(path.join(frameworkRoot, "generated/final_verification_report.json"), "utf8"));
  const liveGapClosure = JSON.parse(await readFile(path.join(frameworkRoot, "generated/live_drive_gap_closure_report.json"), "utf8"));

  const countValues = (records, select) => Object.fromEntries([...records.reduce((counts, record) => {
    const value = String(select(record) || "").toLowerCase();
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map())].sort(([left], [right]) => left.localeCompare(right)));
  const graphStatusCounts = countValues(frameworkGraph.records, (record) => record.status);
  const derivedStatusCounts = countValues(derivedTasks, (record) => record.status);
  const humanRequiredTaskIds = frameworkGraph.records
    .filter((record) => String(record.human_approval_required).toLowerCase() === "true")
    .map((record) => record.task_id)
    .sort();
  const graphTaskIds = new Set(frameworkGraph.records.map((record) => record.task_id));
  const packetTaskIds = new Set(executionPacketFiles.map((fileName) => fileName.slice(0, -".json".length)));
  const mergedProofDistinctTaskCount = new Set(mergedProofs.map((proof) => proof.task_id)).size;
  const approvalTaskIds = agentApprovals.map(({ task_id: taskIdValue }) => taskIdValue).sort();
  const passNoGapsClaim = typeof liveGapClosure.status === "string" && liveGapClosure.status.includes("pass_no_gaps");
  const localPackageCompleteClaim = finalVerification.local_package_complete === true;
  const unsafeCompletionClaims = [
    ...(passNoGapsClaim ? [{
      claim_type: "pass_no_gaps",
      source: "execution-framework/generated/live_drive_gap_closure_report.json#/status",
      source_value: liveGapClosure.status,
      disposition: "rejected_as_lifeos_completion",
    }] : []),
    ...(localPackageCompleteClaim ? [{
      claim_type: "local_package_complete",
      source: "execution-framework/generated/final_verification_report.json#/local_package_complete",
      source_value: true,
      disposition: "rejected_as_lifeos_completion",
    }] : []),
  ];
  const semanticErrors = [];
  if (stableJson(graphStatusCounts) !== stableJson({ pending: 76, complete: 4 })) semanticErrors.push("framework_graph_source_status_counts");
  if (executionPacketFiles.length !== 80 || [...graphTaskIds].some((taskIdValue) => !packetTaskIds.has(taskIdValue))) semanticErrors.push("execution_packet_coverage");
  if (proofFiles.length !== 88) semanticErrors.push("proof_file_count");
  if (mergedProofs.length !== 88 || mergedProofDistinctTaskCount !== 88 || mergedProofLedger.proof_count !== 88) semanticErrors.push("merged_proof_count");
  if (proofLedgerLines.length !== 92 || proofLedgerParseErrors.length) semanticErrors.push("proof_ledger_rows");
  if (derivedTasks.length !== 80 || stableJson(derivedStatusCounts) !== stableJson({ completed: 78, passed: 2 })) semanticErrors.push("derived_terminal_statuses");
  if (humanRequiredTaskIds.length !== 8) semanticErrors.push("human_required_task_count");
  if (agentApprovals.length !== 8 || stableJson(approvalTaskIds) !== stableJson(humanRequiredTaskIds)) semanticErrors.push("agent_approval_coverage");
  if (!passNoGapsClaim) semanticErrors.push("pass_no_gaps_claim_missing");
  if (!localPackageCompleteClaim) semanticErrors.push("local_package_complete_claim_missing");

  const completionClaimIsolationTests = [
    { test: "reference_graph_status_is_provenance_only", passed: frameworkGraph.records.length === 80, classification: "review_evidence_only" },
    { test: "reference_proofs_are_not_lifeos_proofs", passed: proofFiles.length === 88 && mergedProofs.length === 88, classification: "review_evidence_only" },
    { test: "agent_approvals_are_not_lifeos_approvals", passed: agentApprovals.length === 8 && agentApprovals.every((approval) => approval.classification === "review_evidence_only") },
    { test: "pass_no_gaps_is_rejected", passed: passNoGapsClaim && unsafeCompletionClaims.some((claim) => claim.claim_type === "pass_no_gaps" && claim.disposition === "rejected_as_lifeos_completion") },
    { test: "local_package_complete_is_rejected", passed: localPackageCompleteClaim && unsafeCompletionClaims.some((claim) => claim.claim_type === "local_package_complete" && claim.disposition === "rejected_as_lifeos_completion") },
  ];
  const completionClaimIsolationPassed = completionClaimIsolationTests.every(({ passed }) => passed);
  const errors = [];
  if (manifest.file_count !== actualFiles.length || (manifest.files || []).length !== actualFiles.length) errors.push("file_count_mismatch");
  if (missingFromManifest.length) errors.push("unlisted_files");
  if (missingFromDisk.length) errors.push("missing_files");
  if (hashOrSizeDrift.length) errors.push("hash_or_size_drift");
  if (duplicatePaths.length) errors.push("duplicate_manifest_paths");
  if (frameworkGraph.records.length !== 80) errors.push("framework_graph_count");
  if (issueGraph.records.length !== 12) errors.push("issue_414_graph_count");
  errors.push(...semanticErrors);
  if (!completionClaimIsolationPassed) errors.push("completion_claim_isolation");
  return {
    schema: "lifeos.reference-package-manifest-audit.v1",
    status: errors.length ? "failed" : "passed",
    package_root_name: path.basename(packageRoot),
    declared_file_count: manifest.file_count,
    declared_entry_count: (manifest.files || []).length,
    actual_self_excluding_file_count: actualFiles.length,
    missing_from_manifest: missingFromManifest,
    missing_from_disk: missingFromDisk,
    hash_or_size_drift: hashOrSizeDrift,
    duplicate_manifest_paths: duplicatePaths,
    semantic_facts: {
      framework_graph_task_count: frameworkGraph.records.length,
      framework_graph_source_status_counts: graphStatusCounts,
      execution_packet_count: executionPacketFiles.length,
      proof_file_count: proofFiles.length,
      merged_proof_count: mergedProofs.length,
      merged_proof_distinct_task_count: mergedProofDistinctTaskCount,
      proof_ledger_row_count: proofLedgerLines.length,
      derived_terminal_task_count: derivedTasks.length,
      derived_terminal_status_counts: derivedStatusCounts,
      human_required_task_count: humanRequiredTaskIds.length,
      agent_approval_record_count: agentApprovals.length,
      agent_approval_classification: "review_evidence_only",
    },
    human_required_task_ids: humanRequiredTaskIds,
    agent_approvals: agentApprovals,
    unsafe_completion_claims: unsafeCompletionClaims,
    completion_claim_isolation_tests: completionClaimIsolationTests,
    admissible_as_lifeos_completion: false,
    completion_claim_isolation_passed: completionClaimIsolationPassed,
    namespaces: [
      { namespace: "reference-framework", source: "execution-framework/generated/task_graph.csv", task_count: frameworkGraph.records.length, import_policy: "provenance-only; never merge with CDB WorkOrders" },
      { namespace: "reference-issue-414", source: "execution-framework/generated/issue-414/task_graph.csv", task_count: issueGraph.records.length, import_policy: "provenance-only; never merge with CDB WorkOrders" },
      { namespace: "nu-plugin-cdb-handoff", source: "src/nu_plugin/execution/*TASK_GRAPH.csv", task_count: 106, import_policy: "review-only WorkOrders" },
    ],
    errors,
  };
}

async function buildArtifacts(sourceRoot, referencePackageRoot) {
  const loaded = await readSources(sourceRoot);
  const referenceAudit = await auditReferencePackageManifest(referencePackageRoot);
  const sourceHashDrift = loaded.filter((file) => file.actualHash !== file.sha256);
  const counts = Object.fromEntries(["graph", "scope", "requirements", "commands"].map((taxonomy) => [
    taxonomy,
    loaded.filter((file) => file.taxonomy === taxonomy).reduce((sum, file) => sum + file.records.length, 0),
  ]));
  counts.total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const manifest = {
    schema: "lifeos.task-table-source-manifest.v1",
    source: { repository: SOURCE_REPO, commit: SOURCE_COMMIT, authority: "provenance-only; imported completion claims do not prove LifeOS-local completion" },
    taxonomy: counts,
    files: loaded.map((file) => ({
      path: `execution/${file.name}`,
      snapshot_path: `raw/${file.name}`,
      taxonomy: file.taxonomy,
      family: file.family,
      sha256: file.actualHash,
      byte_count: file.bytes.byteLength,
      header: file.header,
      record_count: file.records.length,
      source_commit: SOURCE_COMMIT,
    })),
  };

  const graphFiles = loaded.filter((file) => file.taxonomy === "graph");
  const workOrders = graphFiles.flatMap((file) => file.records.map((row, index) => normalizeWorkOrder(file, row, index)))
    .sort((left, right) => left.correlation_id.localeCompare(right.correlation_id));
  const taskIds = new Set(workOrders.map((task) => task.correlation_id));

  const gates = loaded.filter((file) => file.taxonomy === "scope")
    .flatMap((file) => file.records.map((row, index) => normalizeGate(file, row, index)))
    .sort((left, right) => left.correlation_id.localeCompare(right.correlation_id));
  const requirementFile = loaded.find((file) => file.taxonomy === "requirements");
  const requirements = requirementFile.records.map((row, index) => normalizeRequirement(requirementFile, row, index, taskIds));
  const commandFile = loaded.find((file) => file.taxonomy === "commands");
  const commands = commandFile.records.map((row, index) => normalizeCommand(commandFile, row, index, taskIds));
  const taskGraph = normalizedTaskGraph(workOrders);
  const packets = workOrders.map(executionPacket);
  const packetTexts = new Map(packets.map((packet) => [`packets/${packet.task_id}.json`, prettyJson(packet)]));
  const packetEntries = packets.map((packet) => {
    const packetUri = `packets/${packet.task_id}.json`;
    const content = packetTexts.get(packetUri);
    return {
      packet_id: packet.packet_id,
      task_id: packet.task_id,
      packet_uri: packetUri,
      sha256: sha256(content),
      intent_lock_digest: packet.intent_lock.digest,
      status: packet.status,
      depends_on: packet.depends_on,
      approval_id: packet.approval.approval_id,
    };
  });
  const executionManifest = { schema: "lifeos.execution-manifest.v1", namespace: "nu-plugin-cdb-handoff", source_commit: SOURCE_COMMIT, task_count: workOrders.length, packet_count: packetEntries.length, packets: packetEntries };
  const approvals = approvalQueue(workOrders);
  const leases = leaseRegistry(workOrders);
  const dispatch = computeDispatch({ workOrders, approvals: approvals.approvals });
  const events = initialEventLedger(workOrders);
  const eventChain = verifyRecordChain(events, { sequenceField: "event_seq", previousField: "previous_event_hash", hashField: "event_hash" });
  const recovery = recoverySurfaces(workOrders);
  const visualArtifacts = renderVisualArtifacts({ workOrders, taskGraph, dispatch, approvals, leases, events, recovery });
  const visualDefinitions = [
    ["mermaid", "visuals/task_graph.mmd"],
    ["graphviz-dot", "visuals/task_graph.dot"],
    ["tui-dashboard", "visuals/dashboard.txt"],
    ["live-event-stream", "visuals/event_stream.ndjson"],
    ["static-html", "visuals/task_graph.html"],
    ["static-wiki", "visuals/task_graph.wiki.md"],
  ];
  executionManifest.visuals = visualDefinitions.map(([surface, artifactUri]) => ({ surface, artifact_uri: artifactUri, sha256: sha256(visualArtifacts.get(artifactUri)), authority: "derived from canonical task/control records" }));
  const gapMatrix = referenceGapMatrix();
  const referenceNamespaces = { schema: "lifeos.task-namespace-registry.v1", namespaces: referenceAudit.namespaces, collision_policy: "Task IDs are namespace-qualified; reference graphs never become CDB WorkOrders or LifeOS completion proof." };

  const recordIds = new Map();
  graphFiles.forEach((file) => file.records.forEach((row, index) => recordIds.set(`${file.name}:${index + 1}`, taskId(row.task_id))));
  loaded.filter((file) => file.taxonomy === "scope").forEach((file) => file.records.forEach((row, index) => recordIds.set(`${file.name}:${index + 1}`, `GATE-${row.task_id}`)));
  requirements.forEach((record, index) => recordIds.set(`${requirementFile.name}:${index + 1}`, record.record_id));
  commands.forEach((record, index) => recordIds.set(`${commandFile.name}:${index + 1}`, record.record_id));
  const rowIndex = sourceRowIndex(loaded, recordIds);

  const knownWorkOrderIds = new Set(workOrders.map((task) => task.work_order_id));
  const { catalog: mandatoryCapabilities, errors: mandatoryCapabilityErrors } = await mandatoryCapabilityCatalog(referencePackageRoot, knownWorkOrderIds);
  const mandatoryCapabilityProjection = mandatoryCapabilities.capabilities.map((capability) => ({
    capability_id: capability.capability_id,
    title: capability.title,
    requirement: capability.requirement,
    source_refs: capability.source_refs.map((sourceRef) => `${sourceRef.path}:L${sourceRef.line_start}-L${sourceRef.line_end}`),
    source_wording: stableJson(capability.source_refs.map(({ source_wording: sourceWording }) => sourceWording)),
    mandatory_requirement: capability.mandatory_requirement,
    verification_gate: capability.verification_gate,
    coverage_work_order_refs: capability.coverage_work_order_refs,
    coverage_boundary: capability.coverage_boundary,
    planning_evidence: capability.planning_evidence,
    local_status: capability.local_status,
    product_complete: capability.product_complete,
  }));
  executionManifest.companion_catalogs = [{
    catalog: "mandatory-migration-capabilities",
    version: mandatoryCapabilities.catalog_version,
    artifact_uri: "workflow/mandatory_capabilities.json",
    projection_uri: "workflow/mandatory_capabilities.csv",
    record_count: mandatoryCapabilities.capability_count,
    status_authority: "review-only planning coverage",
  }];
  const referenceImportIsolation = {
    reference_work_order_import_count: workOrders.filter((task) => task.source.commit !== SOURCE_COMMIT || !/^execution\/(?:TASK|BIDIRECTIONAL_TASK|POLYGLOT_TASK)_GRAPH\.csv$/.test(task.source.path)).length,
    reference_proof_import_count: 0,
    reference_status_promotion_count: workOrders.filter((task) => task.status !== "review").length,
    work_order_proofs_null: workOrders.every((task) => task.proof_uri === null),
    work_orders_review_only: workOrders.every((task) => task.status === "review"),
  };
  referenceAudit.lifeos_import_isolation = referenceImportIsolation;
  const referenceImportIsolationPassed = referenceImportIsolation.reference_work_order_import_count === 0
    && referenceImportIsolation.reference_proof_import_count === 0
    && referenceImportIsolation.reference_status_promotion_count === 0
    && referenceImportIsolation.work_order_proofs_null
    && referenceImportIsolation.work_orders_review_only;
  referenceAudit.completion_claim_isolation_tests.push({
    test: "no_reference_status_or_proof_promoted_to_lifeos",
    passed: referenceImportIsolationPassed,
    classification: "review_evidence_only",
  });
  referenceAudit.completion_claim_isolation_passed = referenceAudit.completion_claim_isolation_tests.every(({ passed: testPassed }) => testPassed);
  if (!referenceAudit.completion_claim_isolation_passed && !referenceAudit.errors.includes("completion_claim_isolation")) referenceAudit.errors.push("completion_claim_isolation");
  referenceAudit.status = referenceAudit.errors.length ? "failed" : "passed";
  const referenceCompletionIsolationErrors = referenceImportIsolationPassed && referenceAudit.completion_claim_isolation_passed
    ? [] : ["reference_completion_claim_promoted"];
  const unknownDependencies = workOrders.flatMap((task) => [...task.depends_on, ...task.blocks]
    .filter((dependency) => !knownWorkOrderIds.has(dependency))
    .map((dependency) => `${task.work_order_id}:${dependency}`));
  const cycles = dependencyCycles(workOrders);
  const lockFailures = workOrders.filter((task) => {
    const expected = bytesToHex(blake3(new TextEncoder().encode(stableJson(intentLockPayload(task)))));
    return task.intent_lock.digest !== `blake3:${expected}`;
  });
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validateSchema = ajv.compile(workOrderSchema());
  const schemaErrors = workOrders.flatMap((task) => {
    if (validateSchema(task)) return [];
    return validateSchema.errors.map((error) => `${task.work_order_id}:${error.instancePath || "/"}:${error.keyword}:${error.message}`);
  });
  const semanticPolicyErrors = workOrders.flatMap((task) => validateWorkOrderSemantics(task).map((field) => `${task.work_order_id}:${field}`));
  const validatePacketSchema = ajv.compile(executionPacketSchema());
  const packetSchemaErrors = packets.flatMap((packet) => {
    if (validatePacketSchema(packet)) return [];
    return validatePacketSchema.errors.map((error) => `${packet.task_id}:${error.instancePath || "/"}:${error.keyword}:${error.message}`);
  });
  const expectedTaskIds = Array.from({ length: 106 }, (_, index) => `CDB${String(index).padStart(3, "0")}`);
  const workOrderCorrelationIds = workOrders.map((task) => task.correlation_id);
  const gateCorrelationIds = gates.map((gate) => gate.correlation_id);
  const unmatchedRequirements = requirements.filter((record) => !record.work_order_id);
  const unmatchedCommands = commands.filter((record) => !record.work_order_id);
  const mappingErrors = [];
  if (stableJson(workOrderCorrelationIds) !== stableJson(expectedTaskIds)) mappingErrors.push("work_order_ids_not_exact_CDB000_CDB105");
  if (stableJson(gateCorrelationIds) !== stableJson(expectedTaskIds)) mappingErrors.push("companion_gate_join_not_one_to_one");
  if (counts.total !== EXPECTED_TAXONOMY.total || Object.entries(EXPECTED_TAXONOMY).some(([key, expected]) => counts[key] !== expected)) mappingErrors.push("taxonomy_count_mismatch");

  const packetManifestErrors = [];
  if (executionManifest.packet_count !== workOrders.length || packetTexts.size !== workOrders.length) packetManifestErrors.push("packet_count_mismatch");
  for (const entry of executionManifest.packets) {
    const content = packetTexts.get(entry.packet_uri);
    if (!content || sha256(content) !== entry.sha256) packetManifestErrors.push(`${entry.task_id}:packet_hash_mismatch`);
  }
  const dispatchErrors = [];
  if (dispatch.dispatch_count !== 0 || dispatch.runnable_count !== 0) dispatchErrors.push("review_tasks_dispatched");
  if (dispatch.approval_blocker_count + dispatch.blocked_count !== workOrders.length) dispatchErrors.push("dispatch_coverage_mismatch");
  const approvalCoverageErrors = approvals.approvals.length === workOrders.length && approvals.approvals.every((approval) => approval.status === "pending" && approval.decision === null)
    ? [] : ["approval_queue_must_cover_every_task_as_pending"];
  const leaseSlotErrors = leases.slots.length === workOrders.length && leases.slots.every((lease) => lease.state === "available" && lease.generation === 0)
    ? [] : ["lease_registry_must_cover_every_task_as_available"];
  const checkpointCoverageErrors = recovery.checkpointCatalog.checkpoints.length === workOrders.length && recovery.checkpointCatalog.checkpoints.every((checkpoint) => checkpoint.status === "required" && checkpoint.checkpoint_ref === null)
    ? [] : ["checkpoint_catalog_coverage"];
  const replayCoverageErrors = recovery.replayPlan.tasks.length === workOrders.length && recovery.replayPlan.tasks.every((task) => task.apply_allowed === false)
    ? [] : ["replay_plan_coverage"];
  const rollbackCoverageErrors = recovery.rollbackPlan.tasks.length === workOrders.length && recovery.rollbackPlan.tasks.every((task) => task.status === "unarmed" && task.apply_allowed === false)
    ? [] : ["rollback_plan_coverage"];
  const visualArtifactErrors = [];
  if ((visualArtifacts.get("visuals/task_graph.mmd").match(/^  TASK_CDB\d{3}\[/gm) || []).length !== workOrders.length) visualArtifactErrors.push("mermaid_node_coverage");
  if ((visualArtifacts.get("visuals/task_graph.dot").match(/^  \"TASK-CDB\d{3}\" \[/gm) || []).length !== workOrders.length) visualArtifactErrors.push("dot_node_coverage");
  if (visualArtifacts.get("visuals/event_stream.ndjson").trim().split("\n").length !== events.length) visualArtifactErrors.push("event_stream_coverage");
  if ((visualArtifacts.get("visuals/task_graph.html").match(/<tr data-task-id=\"TASK-CDB\d{3}\">/g) || []).length !== workOrders.length) visualArtifactErrors.push("html_row_coverage");
  if ((visualArtifacts.get("visuals/task_graph.wiki.md").match(/^\| TASK-CDB\d{3} \|/gm) || []).length !== workOrders.length) visualArtifactErrors.push("wiki_row_coverage");
  if (!visualArtifacts.get("visuals/dashboard.txt").includes("Dispatch packets        :   0")) visualArtifactErrors.push("dashboard_dispatch_boundary");
  const surfaceChecks = {
    exact_source_snapshots: sourceHashDrift.length === 0 && counts.total === EXPECTED_TAXONOMY.total,
    normalized_graph: taskGraph.task_count === workOrders.length,
    execution_manifest: packetManifestErrors.length === 0,
    execution_packets: packetSchemaErrors.length === 0,
    dependency_dispatch: dispatchErrors.length === 0,
    human_approval_queue: approvalCoverageErrors.length === 0,
    atomic_lease_registry: leaseSlotErrors.length === 0,
    append_only_event_ledger: eventChain.valid && events.length === workOrders.length,
    append_only_proof_ledger: true,
    checkpoint_catalog: checkpointCoverageErrors.length === 0,
    replay_plan: replayCoverageErrors.length === 0,
    rollback_plan: rollbackCoverageErrors.length === 0,
    namespace_separation: referenceNamespaces.namespaces.map((entry) => entry.namespace).join("|") === "reference-framework|reference-issue-414|nu-plugin-cdb-handoff",
    reference_package_manifest: referenceAudit.status === "passed",
    reference_completion_isolation: referenceCompletionIsolationErrors.length === 0,
    mandatory_capability_catalog: mandatoryCapabilityErrors.length === 0,
    artifact_receipts: true,
    mermaid_visual: !visualArtifactErrors.includes("mermaid_node_coverage"),
    graphviz_dot_visual: !visualArtifactErrors.includes("dot_node_coverage"),
    tui_dashboard: !visualArtifactErrors.includes("dashboard_dispatch_boundary"),
    live_event_stream: !visualArtifactErrors.includes("event_stream_coverage"),
    static_html_wiki: !visualArtifactErrors.some((error) => ["html_row_coverage", "wiki_row_coverage"].includes(error)),
  };
  const receiptCompletenessErrors = Object.entries(surfaceChecks).filter(([, passed]) => !passed).map(([surface]) => surface);
  const completeness = {
    schema: "lifeos.task-table-completeness.v1",
    status: receiptCompletenessErrors.length ? "failed" : "passed_review_handoff",
    execution_status: "not_started",
    source_commit: SOURCE_COMMIT,
    task_count: workOrders.length,
    packet_count: packetEntries.length,
    pending_human_approval_count: approvals.approvals.length,
    available_lease_slot_count: leases.slots.length,
    checkpoint_requirement_count: recovery.checkpointCatalog.checkpoints.length,
    task_execution_proof_count: 0,
    promoted_task_count: 0,
    dispatch_count: dispatch.dispatch_count,
    source_complete_promotions: 0,
    surface_checks: surfaceChecks,
    errors: receiptCompletenessErrors,
    truth_boundary: "Completeness means the review handoff and control surfaces are present; it never means imported tasks executed or completed.",
  };

  const sourceKeys = rowIndex.map((record) => record.source_row_key);
  const sourceRowsDuplicated = sourceKeys.length - new Set(sourceKeys).size;
  const sourceRowsMissing = EXPECTED_TAXONOMY.total - new Set(sourceKeys).size;
  const checks = {
    source_hash_drift: sourceHashDrift.length,
    source_rows_missing: Math.max(0, sourceRowsMissing),
    source_rows_duplicated: sourceRowsDuplicated,
    unknown_dependencies: unknownDependencies.length,
    dependency_cycles: cycles.length,
    intent_lock_failures: lockFailures.length,
    schema_errors: schemaErrors.length,
    semantic_policy_errors: semanticPolicyErrors.length,
    mapping_errors: mappingErrors.length,
    packet_schema_errors: packetSchemaErrors.length,
    packet_manifest_errors: packetManifestErrors.length,
    dispatch_errors: dispatchErrors.length,
    approval_coverage_errors: approvalCoverageErrors.length,
    lease_slot_errors: leaseSlotErrors.length,
    event_chain_errors: eventChain.errors.length,
    checkpoint_coverage_errors: checkpointCoverageErrors.length,
    replay_coverage_errors: replayCoverageErrors.length,
    rollback_coverage_errors: rollbackCoverageErrors.length,
    receipt_completeness_errors: receiptCompletenessErrors.length,
    reference_package_manifest_errors: referenceAudit.errors.length,
    reference_completion_isolation_errors: referenceCompletionIsolationErrors.length,
    mandatory_capability_catalog_errors: mandatoryCapabilityErrors.length,
    visual_artifact_errors: visualArtifactErrors.length,
  };
  const passed = Object.values(checks).every((value) => value === 0);

  const reconciliation = workOrders.map((task) => ({
    work_order_id: task.work_order_id,
    correlation_id: task.correlation_id,
    source_graph: task.source.path,
    source_graph_row: task.source.csv_row,
    source_status: task.source_status,
    local_status: task.status,
    companion_gate_id: task.companion_gate_ref,
    requirement_count: requirements.filter((record) => record.correlation_id === task.correlation_id).length,
    command_count: commands.filter((record) => record.correlation_id === task.correlation_id).length,
    intent_lock_blake3: task.intent_lock.digest,
  }));

  const report = {
    schema: "lifeos.task-table-import-validation.v1",
    status: passed ? "passed" : "failed",
    source: { repository: SOURCE_REPO, commit: SOURCE_COMMIT },
    truth_boundary: {
      source_status: "verbatim upstream claim retained as provenance",
      local_status: "review; never inferred from upstream completion",
      proof_uri: "null until a LifeOS-local verifier emits proof",
    },
    counts: {
      ...counts,
      work_orders: workOrders.length,
      companion_gates: gates.length,
      reconciliations: reconciliation.length,
      requirements_linked_to_work_orders: requirements.length - unmatchedRequirements.length,
      requirements_retained_without_work_order: unmatchedRequirements.length,
      commands_linked_to_work_orders: commands.length - unmatchedCommands.length,
      commands_retained_without_work_order: unmatchedCommands.length,
      execution_packets: packets.length,
      pending_human_approvals: approvals.approvals.length,
      available_lease_slots: leases.slots.length,
      import_events: events.length,
      task_execution_proofs: 0,
      checkpoint_requirements: recovery.checkpointCatalog.checkpoints.length,
      replay_plans: recovery.replayPlan.tasks.length,
      rollback_plans: recovery.rollbackPlan.tasks.length,
      mandatory_capabilities: mandatoryCapabilities.capability_count,
      reference_framework_tasks: referenceAudit.namespaces.find((entry) => entry.namespace === "reference-framework").task_count,
      reference_issue_414_tasks: referenceAudit.namespaces.find((entry) => entry.namespace === "reference-issue-414").task_count,
    },
    checks,
    diagnostics: {
      source_hash_drift: sourceHashDrift.map((file) => file.name),
      unknown_dependencies: unknownDependencies,
      dependency_cycles: cycles,
      schema_errors: schemaErrors,
      semantic_policy_errors: semanticPolicyErrors,
      mapping_errors: mappingErrors,
      packet_schema_errors: packetSchemaErrors,
      packet_manifest_errors: packetManifestErrors,
      dispatch_errors: dispatchErrors,
      approval_coverage_errors: approvalCoverageErrors,
      lease_slot_errors: leaseSlotErrors,
      event_chain_errors: eventChain.errors,
      checkpoint_coverage_errors: checkpointCoverageErrors,
      replay_coverage_errors: replayCoverageErrors,
      rollback_coverage_errors: rollbackCoverageErrors,
      receipt_completeness_errors: receiptCompletenessErrors,
      reference_package_manifest_errors: referenceAudit.errors,
      reference_completion_isolation_errors: referenceCompletionIsolationErrors,
      mandatory_capability_catalog_errors: mandatoryCapabilityErrors,
      visual_artifact_errors: visualArtifactErrors,
    },
    guarantees: [
      "Every source byte is preserved under task_tables/raw.",
      "All 428 CSV records have one unique source-row index entry.",
      "Upstream status is never promoted to LifeOS-local completion.",
      "Historical commands are provenance-only and non-executable.",
      "Every WorkOrder is workspace-rooted, network-disabled, dependency-change-disabled, proof-gated, and BLAKE3 intent-locked.",
      "Every WorkOrder has a schema-valid packet, pending human approval, atomic lease slot, checkpoint requirement, replay guard, and rollback guard.",
      "The import event ledger is append-only and hash chained; the task proof ledger is intentionally empty until LifeOS-local execution produces evidence.",
      "The 80-task reference-framework and 12-task reference-issue-414 graphs remain distinct provenance namespaces from 106 CDB WorkOrders.",
      "The moved reference package manifest must exactly cover every self-excluding package file and digest.",
      "All 26 migration capabilities are mandatory companion requirements and remain review-gated until product-local verification passes.",
      "Reference status, proofs, agent approvals, pass_no_gaps, and local_package_complete claims are inadmissible as LifeOS completion.",
      "Mermaid, Graphviz DOT, TUI dashboard, live event stream, static HTML, and static wiki views derive only from canonical task/control records.",
    ],
  };

  const artifactText = new Map([
    [`${TASK_TABLE_ROOT}/source_manifest.json`, prettyJson(manifest)],
    [`${TASK_TABLE_ROOT}/handoff.task.v1.schema.json`, prettyJson(workOrderSchema())],
    [`${TASK_TABLE_ROOT}/schemas/execution-packet.v1.schema.json`, prettyJson(executionPacketSchema())],
    [`${TASK_TABLE_ROOT}/canonical/work_orders.json`, prettyJson({ schema: "handoff.task.v1.collection", source_commit: SOURCE_COMMIT, work_orders: workOrders })],
    [`${TASK_TABLE_ROOT}/canonical/task_graph.normalized.json`, prettyJson(taskGraph)],
    [`${TASK_TABLE_ROOT}/manifests/execution_manifest.json`, prettyJson(executionManifest)],
    [`${TASK_TABLE_ROOT}/projections/work_orders.csv`, tabulate(workOrders, ["work_order_id", "correlation_id", "title", "phase", "source_status", "status", "repo_path", "depends_on", "blocks", "companion_gate_ref", "source_context", "deterministic", "allows_network", "allows_dependency_install", "allows_dependency_changes", "proof_required", "proof_uri", "human_approval_required", "verification_command", "completion_gate", "rollback_plan", "intent_lock"])],
    [`${TASK_TABLE_ROOT}/normalized/companion_gates.json`, prettyJson({ schema: "lifeos.companion-gate.v1.collection", source_commit: SOURCE_COMMIT, gates })],
    [`${TASK_TABLE_ROOT}/normalized/companion_gates.csv`, tabulate(gates, ["gate_id", "work_order_id", "correlation_id", "must_read", "may_update", "must_update_on_change", "validation_gates", "safety_constraints", "local_status", "source"])],
    [`${TASK_TABLE_ROOT}/normalized/requirements.json`, prettyJson({ schema: "lifeos.requirement-evidence.v1.collection", source_commit: SOURCE_COMMIT, requirements })],
    [`${TASK_TABLE_ROOT}/normalized/requirements.csv`, tabulate(requirements, ["record_id", "requirement_id", "parent_id", "correlation_id", "work_order_id", "requirement", "authoritative_source", "source_reference", "implementation_paths", "test_paths", "verification_command", "proof_artifacts", "proof_head_sha", "evidence_status", "source_status", "local_status", "notes", "executable", "source"])],
    [`${TASK_TABLE_ROOT}/normalized/commands.json`, prettyJson({ schema: "lifeos.command-history.v1.collection", source_commit: SOURCE_COMMIT, commands })],
    [`${TASK_TABLE_ROOT}/normalized/commands.csv`, tabulate(commands, ["record_id", "correlation_id", "work_order_id", "timestamp_utc", "source_cwd", "workspace_cwd", "source_repo", "command", "output_paths", "exit_code", "redaction", "notes", "executable", "source"])],
    [`${TASK_TABLE_ROOT}/normalized/source_row_index.json`, prettyJson({ schema: "lifeos.source-row-index.v1", source_commit: SOURCE_COMMIT, records: rowIndex })],
    [`${TASK_TABLE_ROOT}/control/dispatch_plan.json`, prettyJson(dispatch)],
    [`${TASK_TABLE_ROOT}/control/approval_queue.json`, prettyJson(approvals)],
    [`${TASK_TABLE_ROOT}/control/lease_registry.json`, prettyJson(leases)],
    [`${TASK_TABLE_ROOT}/ledgers/events.jsonl`, jsonLines(events)],
    [`${TASK_TABLE_ROOT}/ledgers/proofs.jsonl`, ""],
    [`${TASK_TABLE_ROOT}/ledgers/ledger_manifest.json`, prettyJson({ schema: "lifeos.task-ledger-manifest.v1", event_count: events.length, event_chain_head: eventChain.head, event_chain_valid: eventChain.valid, proof_count: 0, proof_chain_head: null, proof_policy: "append-only LifeOS-local evidence only; upstream proof claims are not copied" })],
    [`${TASK_TABLE_ROOT}/recovery/checkpoint_catalog.json`, prettyJson(recovery.checkpointCatalog)],
    [`${TASK_TABLE_ROOT}/recovery/replay_plan.json`, prettyJson(recovery.replayPlan)],
    [`${TASK_TABLE_ROOT}/recovery/rollback_plan.json`, prettyJson(recovery.rollbackPlan)],
    [`${TASK_TABLE_ROOT}/workflow/reference_gap_matrix.json`, prettyJson(gapMatrix)],
    [`${TASK_TABLE_ROOT}/workflow/reference_namespaces.json`, prettyJson(referenceNamespaces)],
    [`${TASK_TABLE_ROOT}/workflow/reference_package_audit.json`, prettyJson(referenceAudit)],
    [`${TASK_TABLE_ROOT}/workflow/mandatory_capabilities.json`, prettyJson(mandatoryCapabilities)],
    [`${TASK_TABLE_ROOT}/workflow/mandatory_capabilities.csv`, tabulate(mandatoryCapabilityProjection, ["capability_id", "title", "requirement", "source_refs", "source_wording", "mandatory_requirement", "verification_gate", "coverage_work_order_refs", "coverage_boundary", "planning_evidence", "local_status", "product_complete"])],
    [`${TASK_TABLE_ROOT}/receipts/completeness_report.json`, prettyJson(completeness)],
    [RECONCILIATION_PATH, tabulate(reconciliation, ["work_order_id", "correlation_id", "source_graph", "source_graph_row", "source_status", "local_status", "companion_gate_id", "requirement_count", "command_count", "intent_lock_blake3"])],
  ]);
  for (const [relative, content] of packetTexts) artifactText.set(`${TASK_TABLE_ROOT}/${relative}`, content);
  for (const [relative, content] of visualArtifacts) artifactText.set(`${TASK_TABLE_ROOT}/${relative}`, content);

  const receiptFiles = [
    ...loaded.map((file) => ({ path: `raw/${file.name}`, bytes: file.bytes.byteLength, sha256: file.actualHash, kind: "exact-source-snapshot" })),
    { path: "../generated/task_table_reconciliation.csv", bytes: Buffer.byteLength(artifactText.get(RECONCILIATION_PATH)), sha256: sha256(artifactText.get(RECONCILIATION_PATH)), kind: "derived-reconciliation" },
    ...[...artifactText.entries()]
      .filter(([relative]) => relative.startsWith(`${TASK_TABLE_ROOT}/`))
      .map(([relative, content]) => ({ path: relative.slice(`${TASK_TABLE_ROOT}/`.length), bytes: Buffer.byteLength(content), sha256: sha256(content), kind: relative.includes("/packets/") ? "execution-packet" : "derived-control-artifact" })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const artifactManifest = {
    schema: "lifeos.task-table-artifact-manifest.v1",
    source_commit: SOURCE_COMMIT,
    self_excluding: true,
    exclusion_reason: "The manifest excludes itself and validation_report.json to avoid recursive digests.",
    file_count: receiptFiles.length,
    files: receiptFiles,
  };
  artifactText.set(`${TASK_TABLE_ROOT}/receipts/artifact_manifest.json`, prettyJson(artifactManifest));
  artifactText.set(`${TASK_TABLE_ROOT}/validation_report.json`, prettyJson(report));

  return { loaded, artifactText, manifest, workOrders, gates, requirements, commands, rowIndex, reconciliation, taskGraph, packets, executionManifest, approvals, leases, dispatch, events, recovery, visualArtifacts, mandatoryCapabilities, completeness, referenceAudit, report };
}

async function writeIfChanged(filePath, content) {
  let current = null;
  try { current = await readFile(filePath); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const next = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (current && current.equals(next)) return false;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, next);
  return true;
}

async function resolveReferencePackageRoot(repoRoot, explicitRoot) {
  const candidates = [
    explicitRoot && path.resolve(explicitRoot),
    path.join(repoRoot, "planning-spine-v0", "envctl-db-nu-plugin-migration-automation-package"),
    path.resolve(repoRoot, "../lifeos/planning-spine-v0/envctl-db-nu-plugin-migration-automation-package"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await readFile(path.join(candidate, "PACKAGE_MANIFEST.json"));
      return candidate;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`reference package missing; checked: ${candidates.join(", ")}`);
}

async function writeArtifacts({ repoRoot, sourceRoot, referencePackageRoot }) {
  const resolvedReferenceRoot = await resolveReferencePackageRoot(repoRoot, referencePackageRoot);
  const built = await buildArtifacts(sourceRoot, resolvedReferenceRoot);
  if (built.report.status !== "passed") throw new Error(`Source validation failed:\n${prettyJson(built.report.diagnostics)}`);
  const changed = [];
  for (const file of built.loaded) {
    const relative = `${TASK_TABLE_ROOT}/raw/${file.name}`;
    if (await writeIfChanged(path.join(repoRoot, relative), file.bytes)) changed.push(relative);
  }
  for (const [relative, content] of built.artifactText) {
    if (await writeIfChanged(path.join(repoRoot, relative), content)) changed.push(relative);
  }
  return { ...built, changed };
}

export async function checkTaskTableArtifacts({ repoRoot, sourceRoot, referencePackageRoot } = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot || path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  const rawRoot = path.join(resolvedRepoRoot, TASK_TABLE_ROOT, "raw");
  const errors = [];
  try {
    const resolvedReferenceRoot = await resolveReferencePackageRoot(resolvedRepoRoot, referencePackageRoot);
    const built = await buildArtifacts(rawRoot, resolvedReferenceRoot);
    for (const [relative, expected] of built.artifactText) {
      let actual;
      try { actual = await readFile(path.join(resolvedRepoRoot, relative), "utf8"); } catch (error) {
        errors.push(`${relative}: ${error.code === "ENOENT" ? "missing" : error.message}`);
        continue;
      }
      if (actual !== expected) errors.push(`${relative}: content drift`);
    }
    if (sourceRoot) {
      const live = await readSources(path.resolve(sourceRoot));
      for (const file of live) {
        const raw = await readFile(path.join(rawRoot, file.name));
        if (!raw.equals(file.bytes)) errors.push(`live source drift: ${file.name}`);
      }
    }
    if (built.report.status !== "passed") errors.push(`validation report status: ${built.report.status}`);
    return { ok: errors.length === 0, errors, report: built.report, artifacts: { checked: built.artifactText.size + SOURCE_FILES.length, source_files: SOURCE_FILES.length } };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { ok: false, errors, report: { status: "failed" }, artifacts: { checked: 0, source_files: SOURCE_FILES.length } };
  }
}

function parseArguments(argv) {
  const options = { mode: "check", sourceRoot: null, referencePackageRoot: null, repoRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") options.mode = "write";
    else if (argument === "--check") options.mode = "check";
    else if (argument === "--source-root") options.sourceRoot = argv[++index];
    else if (argument === "--reference-package-root") options.referencePackageRoot = argv[++index];
    else if (argument === "--repo-root") options.repoRoot = argv[++index];
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: bun planning-spine-v0/scripts/import-nu-plugin-task-tables.mjs [--check|--write] [--source-root PATH] [--reference-package-root PATH] [--repo-root PATH]");
    return;
  }
  const repoRoot = path.resolve(options.repoRoot || path.join(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  if (options.mode === "write") {
    const sourceRoot = path.resolve(options.sourceRoot || path.join(repoRoot, "../nu_plugin/execution"));
    const result = await writeArtifacts({ repoRoot, sourceRoot, referencePackageRoot: options.referencePackageRoot });
    const check = await checkTaskTableArtifacts({ repoRoot, sourceRoot, referencePackageRoot: options.referencePackageRoot });
    if (!check.ok) throw new Error(check.errors.join("\n"));
    console.log(`nu_plugin task tables: wrote ${result.changed.length} changed files; ${result.report.counts.total} source records accounted; ${result.workOrders.length} WorkOrders remain review-only.`);
  } else {
    const result = await checkTaskTableArtifacts({ repoRoot, sourceRoot: options.sourceRoot ? path.resolve(options.sourceRoot) : undefined, referencePackageRoot: options.referencePackageRoot });
    if (!result.ok) throw new Error(result.errors.join("\n"));
    console.log(`nu_plugin task tables: check passed; ${result.report.counts.total} source records accounted; ${result.report.counts.work_orders} WorkOrders remain review-only.`);
  }
}

const directInvocation = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directInvocation) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
