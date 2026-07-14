import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import {
  acquireTaskLease,
  auditReferencePackageManifest,
  appendProofRecord,
  appendRuntimeEvent,
  checkTaskTableArtifacts,
  computeDispatch,
  intentLockPayload,
  normalizeReference,
  parseCsv,
  recordCheckpoint,
  releaseTaskLease,
  stableJson,
  workspacePath,
} from "../planning-spine-v0/scripts/import-nu-plugin-task-tables.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskTables = path.join(repoRoot, "planning-spine-v0", "task_tables");
const referencePackageRoot = path.join(repoRoot, "planning-spine-v0", "envctl-db-nu-plugin-migration-automation-package");

const expectedHashes = {
  "BIDIRECTIONAL_TASK_FILE_MAP.csv": "44225bcac82ee8cff7326c6b4922a7ee95827c455ae141061a5e0303e03f8e8c",
  "BIDIRECTIONAL_TASK_GRAPH.csv": "0b555a6257d6459d41ea659e062fb6222be88c4d8f2b79c4d26f71289044ed21",
  "COMMAND_LEDGER.csv": "e230d1c64568e8642429f7198e97fd22c86025bdc3f14f694a9e7e784e405991",
  "POLYGLOT_TASK_FILE_MAP.csv": "992c85a81d730c413a187c2454da094bd0f4bf4d3f5559cb6018668d94d22506",
  "POLYGLOT_TASK_GRAPH.csv": "2c3e992a7bf68fcb12bc8a006568c29c38b89ee410807e3791a85bea2d21679b",
  "REQUIREMENT_PROOF_LEDGER.csv": "a233412242c26d08cc9d99e3b9d321c015f68a878ab0f4d0ef41d828c0998232",
  "TASK_FILE_MAP.csv": "4a2424c6a7c9e4841140310664f1bcc213f12e2af7330a3309333ccbb105a575",
  "TASK_GRAPH.csv": "fc8bf8b0f73e2a0441917a80d8a7b75c286771b1effade5944aec091b567abbc",
};

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(taskTables, relativePath), "utf8"));
}

describe("nu_plugin execution task-table handoff", () => {
  it("pins all eight source files byte-for-byte at c847405", async () => {
    const manifest = await json("source_manifest.json");

    expect(manifest.source.commit).toBe("c84740532ded2a27ee283ea7a3a5f303eaeb61a7");
    expect(manifest.files).toHaveLength(8);
    expect(Object.fromEntries(manifest.files.map((entry) => [path.basename(entry.path), entry.sha256]))).toEqual(expectedHashes);

    for (const entry of manifest.files) {
      const bytes = await readFile(path.join(taskTables, entry.snapshot_path));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
      expect(bytes.byteLength).toBe(entry.byte_count);
      const table = parseCsv(bytes.toString("utf8"));
      expect(table.header).toEqual(entry.header);
      expect(table.records).toHaveLength(entry.record_count);
    }
  });

  it("accounts for all 428 records without collapsing the four source taxonomies", async () => {
    const manifest = await json("source_manifest.json");
    const index = await json("normalized/source_row_index.json");

    expect(manifest.taxonomy).toEqual({ graph: 106, scope: 106, requirements: 140, commands: 76, total: 428 });
    expect(index.records).toHaveLength(428);
    expect(new Set(index.records.map((record) => record.source_row_key)).size).toBe(428);
    expect(Object.fromEntries(Object.entries(Object.groupBy(index.records, ({ taxonomy }) => taxonomy)).map(([key, rows]) => [key, rows.length]))).toEqual({
      graph: 106,
      scope: 106,
      requirements: 140,
      commands: 76,
    });
  });

  it("materializes exactly 106 schema-conformant review-only WorkOrders", async () => {
    const canonical = await json("canonical/work_orders.json");
    const schema = await json("handoff.task.v1.schema.json");
    const readme = await readFile(path.join(taskTables, "README.md"), "utf8");

    expect(canonical.schema).toBe("handoff.task.v1.collection");
    expect(canonical.item_schema).toBe("handoff.task.v1");
    expect(canonical.envelope_count).toBe(106);
    expect(canonical.scope).toBe("collection of review-only WorkOrder envelopes; not the moved-package reference superset");
    expect(schema.$id).toContain("handoff.task.v1");
    expect(schema.title).toBe("Single LifeOS review-only WorkOrder envelope");
    expect(canonical.work_orders).toHaveLength(106);
    expect(canonical.work_orders.map(({ work_order_id }) => work_order_id)).toEqual(
      Array.from({ length: 106 }, (_, index) => `TASK-CDB${String(index).padStart(3, "0")}`),
    );

    for (const workOrder of canonical.work_orders) {
      expect(workOrder.schema).toBe("handoff.task.v1");
      expect(workOrder.correlation_id).toMatch(/^CDB\d{3}$/);
      expect(workOrder.source_status).toBeTruthy();
      expect(workOrder.status).toBe("review");
      expect(workOrder.repo_path).toBe("src/nu_plugin");
      expect(workOrder.deterministic).toBe(true);
      expect(workOrder.allows_network).toBe(false);
      expect(workOrder.allows_dependency_changes).toBe(false);
      expect(workOrder.proof_required).toBe(true);
      expect(workOrder.proof_uri).toBeNull();
      expect(workOrder.rollback_plan).toBeTruthy();
      expect(workOrder.intent_lock.algorithm).toBe("BLAKE3-256");
      expect(JSON.stringify(workOrder)).not.toContain("/mnt/data/");
      expect(JSON.stringify(workOrder)).not.toContain("/home/flexnetos/");
    }

    expect(readme).toContain("`handoff.task.v1` is exactly one review-only WorkOrder envelope");
    expect(readme).toContain("The full moved package is the reference superset");
    expect(readme).not.toContain("## Mandatory execution-framework superset");
  });

  it("maps dependency and block IDs and joins companion gates without embedding them", async () => {
    const { work_orders: workOrders } = await json("canonical/work_orders.json");
    const { gates } = await json("normalized/companion_gates.json");
    const byCorrelation = new Map(workOrders.map((task) => [task.correlation_id, task]));

    expect(gates).toHaveLength(106);
    expect(new Set(gates.map(({ correlation_id }) => correlation_id))).toEqual(new Set(byCorrelation.keys()));
    expect(byCorrelation.get("CDB071").depends_on).toEqual(["TASK-CDB070"]);
    expect(byCorrelation.get("CDB000").blocks).toEqual(["TASK-CDB001", "TASK-CDB002", "TASK-CDB003", "TASK-CDB004"]);

    for (const task of workOrders) {
      expect(task.companion_gate_ref).toBe(`GATE-${task.correlation_id}`);
      expect(task).not.toHaveProperty("must_read");
      for (const dependency of [...task.depends_on, ...task.blocks]) {
        expect(workOrders.some(({ work_order_id }) => work_order_id === dependency)).toBe(true);
      }
      for (const field of ["input_files", "target_files", "allowed_paths"]) {
        expect(task[field].every((value) => value.startsWith("src/nu_plugin/"))).toBe(true);
      }
    }
  });

  it("preserves repository-relative suffixes and navigable source graph context", async () => {
    const { work_orders: workOrders } = await json("canonical/work_orders.json");
    const { requirements } = await json("normalized/requirements.json");
    const cdb000 = workOrders.find(({ correlation_id }) => correlation_id === "CDB000");
    const cdb070 = workOrders.find(({ correlation_id }) => correlation_id === "CDB070");

    expect(workspacePath("/home/flexnetos/FlexNetOS/src/nu_plugin/logs/CDB000.log")).toBe("src/nu_plugin/logs/CDB000.log");
    expect(workspacePath("external:../envctl/docs/ROADMAP.md")).toBe("src/envctl/docs/ROADMAP.md");
    expect(normalizeReference("https://github.com/FlexNetOS/envctl/issues/414")).toBe("https://github.com/FlexNetOS/envctl/issues/414");
    expect(normalizeReference("gitkb:tasks/cdb106-mandatory-v1-1-completion")).toBe("gitkb:tasks/cdb106-mandatory-v1-1-completion");
    expect(cdb000.source_context).toMatchObject({
      family: "core",
      owner_surface: "package",
      source_truth: "src/nu_plugin/execution/TASK_GRAPH.csv",
      stop_condition: "repo/source mutation",
    });
    expect(cdb000.source_context.evidence_paths).toContain("src/nu_plugin/logs/CDB000-package-init.log");
    expect(cdb000.source_context.notes).toContain("Package scaffold already generated");
    expect(cdb070.source_context.gitkb_slug).toBe("tasks/cdb070-bidirectional-phase-0-evidence-audit");
    expect(requirements.find(({ requirement_id }) => requirement_id === "REQ-061-NFR01").authoritative_source).toBe("https://github.com/FlexNetOS/envctl/issues/414");
    expect(requirements.find(({ requirement_id }) => requirement_id === "CDB106-AC01").authoritative_source).toBe("gitkb:tasks/cdb106-mandatory-v1-1-completion");
  });

  it("uses recomputable BLAKE3-256 intent locks over canonical task intent", async () => {
    const { work_orders: workOrders } = await json("canonical/work_orders.json");

    for (const workOrder of workOrders) {
      const digest = bytesToHex(blake3(new TextEncoder().encode(stableJson(intentLockPayload(workOrder)))));
      expect(workOrder.intent_lock.digest).toBe(`blake3:${digest}`);
    }
  });

  it("keeps requirements and historical commands as normalized, non-executable provenance", async () => {
    const { requirements } = await json("normalized/requirements.json");
    const { commands } = await json("normalized/commands.json");

    expect(requirements).toHaveLength(140);
    expect(commands).toHaveLength(76);
    expect(commands.every((command) => command.executable === false)).toBe(true);
    expect(commands.every((command) => command.workspace_cwd === "src/nu_plugin")).toBe(true);
    expect(commands.some((command) => command.source_cwd.startsWith("/mnt/data/"))).toBe(true);
  });

  it("writes an exact 106-row reconciliation projection and a passing validation report", async () => {
    const reconciliation = parseCsv(
      await readFile(path.join(repoRoot, "planning-spine-v0", "generated", "task_table_reconciliation.csv"), "utf8"),
    );
    const report = await json("validation_report.json");

    expect(reconciliation.records).toHaveLength(106);
    expect(reconciliation.records.every((row) => row.local_status === "review")).toBe(true);
    expect(report.status).toBe("passed");
    expect(report.checks).toMatchObject({
      source_hash_drift: 0,
      source_rows_missing: 0,
      source_rows_duplicated: 0,
      unknown_dependencies: 0,
      dependency_cycles: 0,
      intent_lock_failures: 0,
      schema_errors: 0,
      mapping_errors: 0,
      packet_schema_errors: 0,
      packet_manifest_errors: 0,
      dispatch_errors: 0,
      approval_coverage_errors: 0,
      lease_slot_errors: 0,
      event_chain_errors: 0,
      checkpoint_coverage_errors: 0,
      replay_coverage_errors: 0,
      rollback_coverage_errors: 0,
      receipt_completeness_errors: 0,
      mandatory_capability_catalog_errors: 0,
      mandatory_language_inventory_errors: 0,
      reference_completion_isolation_errors: 0,
      visual_artifact_errors: 0,
    });
  });

  it("catalogs all 28 migration capabilities as mandatory review work", async () => {
    const catalog = await json("workflow/mandatory_capabilities.json");
    const projection = parseCsv(await readFile(path.join(taskTables, "workflow", "mandatory_capabilities.csv"), "utf8"));
    const { work_orders: workOrders } = await json("canonical/work_orders.json");
    const workOrderIds = new Set(workOrders.map(({ work_order_id: workOrderId }) => workOrderId));
    const expectedIds = Array.from({ length: 28 }, (_, index) => `CAP-MIG-${String(index + 1).padStart(3, "0")}`);

    expect(catalog.schema).toBe("lifeos.migration-mandatory-capability-catalog.v1");
    expect(catalog.catalog_version).toBe("1.1.0");
    expect(catalog.capability_count).toBe(28);
    expect(catalog.capabilities.map(({ capability_id: capabilityId }) => capabilityId)).toEqual(expectedIds);
    expect(new Set(catalog.capabilities.map(({ capability_id: capabilityId }) => capabilityId)).size).toBe(28);
    expect(projection.records).toHaveLength(28);
    expect(projection.records.map(({ capability_id: capabilityId }) => capabilityId)).toEqual(expectedIds);

    for (const capability of catalog.capabilities) {
      expect(capability.requirement).toBe("mandatory");
      expect(capability.local_status).toBe("review");
      expect(capability.product_complete).toBe(false);
      expect(capability.mandatory_requirement).toBeTruthy();
      expect(capability.verification_gate).toBeTruthy();
      expect(capability.source_refs.length).toBeGreaterThan(0);
      expect(capability.coverage_work_order_refs.length + capability.coverage_reference_refs.length).toBeGreaterThan(0);
      expect(capability.coverage_work_order_refs.every((workOrderId) => workOrderIds.has(workOrderId))).toBe(true);
      for (const sourceRef of capability.source_refs) {
        const sourceRoot = sourceRef.source_scope === "task-tables" ? taskTables : referencePackageRoot;
        const sourceLines = (await readFile(path.join(sourceRoot, sourceRef.path), "utf8")).split(/\r?\n/);
        expect(sourceLines.slice(sourceRef.line_start - 1, sourceRef.line_end).join("\n")).toBe(sourceRef.source_wording);
      }
    }

    expect(catalog.capabilities.find(({ capability_id }) => capability_id === "CAP-MIG-007").coverage_boundary).toContain("operation-level lease");
    const richVisuals = catalog.capabilities.find(({ capability_id }) => capability_id === "CAP-MIG-009");
    expect(richVisuals.coverage_boundary).toContain("planning projections");
    expect(richVisuals.coverage_reference_refs).toContain("nu-plugin-requirement:REQ-061-ARCH11");
    expect(richVisuals.source_refs).toContainEqual(expect.objectContaining({
      source_scope: "task-tables",
      path: "raw/REQUIREMENT_PROOF_LEDGER.csv",
      line_start: 97,
    }));
    expect(catalog.capabilities.find(({ capability_id }) => capability_id === "CAP-MIG-012").coverage_boundary).toContain("handoff event chain");
    expect(catalog.capabilities.find(({ capability_id }) => capability_id === "CAP-MIG-023").coverage_boundary).toContain("issue/PR integration");
    expect(catalog.capabilities.find(({ capability_id }) => capability_id === "CAP-MIG-027")).toMatchObject({
      requirement: "mandatory",
      coverage_work_order_refs: [],
      coverage_reference_refs: ["reference-issue-414:REQ-057_WATCH_INCREMENTAL"],
      local_status: "review",
      product_complete: false,
    });
    expect(catalog.capabilities.find(({ capability_id }) => capability_id === "CAP-MIG-028")).toMatchObject({
      requirement: "mandatory",
      coverage_work_order_refs: ["TASK-CDB095"],
      coverage_reference_refs: [],
      local_status: "review",
      product_complete: false,
    });
  });

  it("materializes the mandatory LifeOS control-plane companion without dispatching review tasks", async () => {
    const graph = await json("canonical/task_graph.normalized.json");
    const manifest = await json("manifests/execution_manifest.json");
    const dispatch = await json("control/dispatch_plan.json");
    const approvals = await json("control/approval_queue.json");
    const leases = await json("control/lease_registry.json");

    expect(graph.nodes).toHaveLength(106);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(manifest.packet_count).toBe(106);
    expect(manifest.packets).toHaveLength(106);
    expect(dispatch.dispatch_packets).toEqual([]);
    expect(dispatch.runnable_tasks).toEqual([]);
    expect(dispatch.approval_blocker_count + dispatch.blocked_count).toBe(106);
    expect(approvals.approvals).toHaveLength(106);
    expect(approvals.approvals.every(({ status }) => status === "pending")).toBe(true);
    expect(leases.slots).toHaveLength(106);
    expect(leases.slots.every(({ state, generation }) => state === "available" && generation === 0)).toBe(true);

    for (const entry of manifest.packets) {
      const bytes = await readFile(path.join(taskTables, entry.packet_uri));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
      const packet = JSON.parse(bytes);
      expect(packet.status).toBe("review");
      expect(packet.approval.status).toBe("pending");
      expect(packet.proof.uri).toBeNull();
      expect(packet.execution.command_template).toBeNull();
    }
  });

  it("reverse-classifies every normative optional/should/may/must occurrence without gaps", async () => {
    const inventory = await json("workflow/mandatory_language_inventory.json");
    const projection = parseCsv(await readFile(path.join(taskTables, "workflow", "mandatory_language_inventory.csv"), "utf8"));
    const classifications = new Set(["mandatory_capability", "compatibility_or_state_semantics", "non_normative_evidence"]);

    expect(inventory.schema).toBe("lifeos.mandatory-language-inventory.v1");
    expect(inventory.status).toBe("passed");
    expect(inventory.unclassified_normative_count).toBe(0);
    expect(inventory.occurrence_count).toBeGreaterThan(150);
    expect(projection.records).toHaveLength(inventory.occurrence_count);
    expect(inventory.occurrences.every(({ classification }) => classifications.has(classification))).toBe(true);
    expect(inventory.classification_counts.mandatory_capability).toBeGreaterThan(0);
    expect(inventory.classification_counts.compatibility_or_state_semantics).toBeGreaterThan(0);
    expect(inventory.classification_counts.non_normative_evidence).toBeGreaterThan(0);

    const req057 = inventory.occurrences.filter(({ source_path: sourcePath, source_text: sourceText }) => (
      sourcePath === "execution-framework/generated/issue-414/task_graph.csv" && /poll fallback/i.test(sourceText)
    ));
    expect(req057.length).toBeGreaterThan(0);
    expect(req057.every(({ classification, capability_ids: capabilityIds }) => (
      classification === "mandatory_capability" && capabilityIds.includes("CAP-MIG-027")
    ))).toBe(true);

    const tier4 = inventory.occurrences.filter(({ source_path: sourcePath, source_text: sourceText }) => (
      sourcePath === "raw/POLYGLOT_TASK_GRAPH.csv" && /optional Tier 4 boundary/.test(sourceText)
    ));
    expect(tier4).toHaveLength(1);
    expect(tier4[0]).toMatchObject({ classification: "mandatory_capability", capability_ids: ["CAP-MIG-028"] });

    const architectureTui = inventory.occurrences.filter(({ source_path: sourcePath, source_text: sourceText, keyword }) => (
      sourcePath === "raw/REQUIREMENT_PROOF_LEDGER.csv" && /REQ-061-ARCH11/.test(sourceText) && keyword === "optional"
    ));
    expect(architectureTui).toHaveLength(1);
    expect(architectureTui[0]).toMatchObject({ classification: "mandatory_capability", capability_ids: ["CAP-MIG-009"] });

    expect(inventory.occurrences.some(({ source_path: sourcePath, source_text: sourceText, classification }) => (
      sourcePath === "raw/TASK_GRAPH.csv"
      && /CodeDB must be optional/.test(sourceText)
      && classification === "compatibility_or_state_semantics"
    ))).toBe(true);
    expect(inventory.occurrences.some(({ source_path: sourcePath, classification }) => (
      sourcePath === "execution-framework/docs/AGENT_APPROVAL_GATE.md"
      && classification === "non_normative_evidence"
    ))).toBe(true);
  });

  it("provides append-only event/proof, checkpoint, replay, rollback, and completeness receipts", async () => {
    const eventLines = (await readFile(path.join(taskTables, "ledgers/events.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    const proofLedger = await readFile(path.join(taskTables, "ledgers/proofs.jsonl"), "utf8");
    const checkpoints = await json("recovery/checkpoint_catalog.json");
    const replay = await json("recovery/replay_plan.json");
    const rollback = await json("recovery/rollback_plan.json");
    const completeness = await json("receipts/completeness_report.json");
    const gapMatrix = await json("workflow/reference_gap_matrix.json");

    expect(eventLines).toHaveLength(106);
    let previous = null;
    eventLines.forEach((event, index) => {
      expect(event.event_seq).toBe(index + 1);
      expect(event.previous_event_hash).toBe(previous);
      const { event_hash: eventHash, ...hashInput } = event;
      expect(eventHash).toBe(`sha256:${createHash("sha256").update(stableJson(hashInput)).digest("hex")}`);
      previous = eventHash;
    });
    expect(proofLedger).toBe("");
    expect(checkpoints.checkpoints).toHaveLength(106);
    expect(replay.tasks).toHaveLength(106);
    expect(replay.tasks.every(({ apply_allowed }) => apply_allowed === false)).toBe(true);
    expect(rollback.tasks).toHaveLength(106);
    expect(rollback.tasks.every(({ status }) => status === "unarmed")).toBe(true);
    expect(completeness.status).toBe("passed_review_handoff");
    expect(completeness.task_execution_proof_count).toBe(0);
    expect(completeness.promoted_task_count).toBe(0);
    expect(Object.values(completeness.surface_checks).every(Boolean)).toBe(true);
    expect(gapMatrix.surfaces.every(({ implementation_status }) => implementation_status === "implemented")).toBe(true);
  });

  it("hard-gates the complete reference package manifest and preserves three task namespaces", async () => {
    const audit = await auditReferencePackageManifest(referencePackageRoot);
    const committedAudit = await json("workflow/reference_package_audit.json");
    const namespaces = await json("workflow/reference_namespaces.json");

    expect(audit.status, JSON.stringify(audit.errors)).toBe("passed");
    expect(audit.declared_file_count).toBe(audit.actual_self_excluding_file_count);
    expect(audit.missing_from_manifest).toEqual([]);
    expect(audit.missing_from_disk).toEqual([]);
    expect(audit.hash_or_size_drift).toEqual([]);
    expect(audit.semantic_facts).toMatchObject({
      framework_graph_task_count: 80,
      framework_graph_source_status_counts: { complete: 4, pending: 76 },
      execution_packet_count: 80,
      proof_file_count: 88,
      merged_proof_count: 88,
      merged_proof_distinct_task_count: 88,
      proof_ledger_row_count: 92,
      derived_terminal_task_count: 80,
      derived_terminal_status_counts: { completed: 78, passed: 2 },
      human_required_task_count: 8,
      agent_approval_record_count: 8,
      agent_approval_classification: "review_evidence_only",
    });
    expect(audit.agent_approvals.every(({ classification }) => classification === "review_evidence_only")).toBe(true);
    expect(audit.unsafe_completion_claims.map(({ claim_type }) => claim_type).sort()).toEqual(["local_package_complete", "pass_no_gaps"]);
    expect(audit.unsafe_completion_claims.every(({ disposition }) => disposition === "rejected_as_lifeos_completion")).toBe(true);
    expect(audit.admissible_as_lifeos_completion).toBe(false);
    expect(audit.completion_claim_isolation_passed).toBe(true);
    expect(committedAudit.lifeos_import_isolation).toEqual({
      reference_work_order_import_count: 0,
      reference_proof_import_count: 0,
      reference_status_promotion_count: 0,
      work_order_proofs_null: true,
      work_orders_review_only: true,
    });
    expect(committedAudit.completion_claim_isolation_passed).toBe(true);
    expect(namespaces.namespaces.map(({ namespace, task_count }) => [namespace, task_count])).toEqual([
      ["reference-framework", 80],
      ["reference-issue-414", 12],
      ["nu-plugin-cdb-handoff", 106],
    ]);
  });

  it("materializes all six formerly optional visual surfaces from canonical records", async () => {
    const mermaid = await readFile(path.join(taskTables, "visuals/task_graph.mmd"), "utf8");
    const dot = await readFile(path.join(taskTables, "visuals/task_graph.dot"), "utf8");
    const dashboard = await readFile(path.join(taskTables, "visuals/dashboard.txt"), "utf8");
    const eventStream = (await readFile(path.join(taskTables, "visuals/event_stream.ndjson"), "utf8")).trim().split("\n");
    const html = await readFile(path.join(taskTables, "visuals/task_graph.html"), "utf8");
    const wiki = await readFile(path.join(taskTables, "visuals/task_graph.wiki.md"), "utf8");
    const manifest = await json("manifests/execution_manifest.json");
    const receipts = await json("receipts/artifact_manifest.json");

    expect((mermaid.match(/^  TASK_CDB\d{3}\[/gm) || [])).toHaveLength(106);
    expect((dot.match(/^  "TASK-CDB\d{3}" \[/gm) || [])).toHaveLength(106);
    expect(dashboard).toContain("Pending human approvals : 106");
    expect(dashboard).toContain("Dispatch packets        :   0");
    expect(eventStream).toHaveLength(106);
    expect(eventStream.map(JSON.parse).every(({ stream_cursor }) => Number.isInteger(stream_cursor))).toBe(true);
    expect((html.match(/<tr data-task-id="TASK-CDB\d{3}">/g) || [])).toHaveLength(106);
    expect((wiki.match(/^\| TASK-CDB\d{3} \|/gm) || [])).toHaveLength(106);
    expect(manifest.visuals.map(({ surface }) => surface)).toEqual(["mermaid", "graphviz-dot", "tui-dashboard", "live-event-stream", "static-html", "static-wiki"]);
    expect(manifest.visuals.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
    expect(receipts.files.filter(({ path: artifactPath }) => artifactPath.startsWith("visuals/"))).toHaveLength(6);
    expect(receipts.files.map(({ path: artifactPath }) => artifactPath)).toContain("workflow/mandatory_capabilities.json");
    expect(receipts.files.map(({ path: artifactPath }) => artifactPath)).toContain("workflow/mandatory_capabilities.csv");
    expect(receipts.files.map(({ path: artifactPath }) => artifactPath)).toContain("../generated/task_table_reconciliation.csv");
  });

  it("implements dependency + approval dispatch and real atomic runtime primitives", async () => {
    const { work_orders: workOrders } = await json("canonical/work_orders.json");
    const cdb000 = workOrders.find(({ correlation_id }) => correlation_id === "CDB000");
    const cdb001 = workOrders.find(({ correlation_id }) => correlation_id === "CDB001");
    const initial = computeDispatch({ workOrders, approvals: [] });
    expect(initial.dispatch_packets).toEqual([]);

    const approvedRoot = computeDispatch({
      workOrders,
      approvals: [{ task_id: cdb000.work_order_id, status: "approved", intent_lock_digest: cdb000.intent_lock.digest }],
    });
    expect(approvedRoot.runnable_tasks.map(({ task_id }) => task_id)).toContain(cdb000.work_order_id);
    expect(approvedRoot.blocked_tasks.find(({ task_id }) => task_id === cdb001.work_order_id).reason).toBe("unmet_dependencies");

    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "lifeos-task-runtime-"));
    try {
      const lease = await acquireTaskLease({ runtimeRoot, taskId: cdb000.work_order_id, holder: "agent-a", intentLockDigest: cdb000.intent_lock.digest });
      expect(lease.status).toBe("acquired");
      const blocked = await acquireTaskLease({ runtimeRoot, taskId: cdb000.work_order_id, holder: "agent-b", intentLockDigest: cdb000.intent_lock.digest });
      expect(blocked.status).toBe("blocked");
      await expect(releaseTaskLease({ runtimeRoot, taskId: cdb000.work_order_id, token: "wrong" })).rejects.toThrow(/token/i);
      expect((await releaseTaskLease({ runtimeRoot, taskId: cdb000.work_order_id, token: lease.token })).status).toBe("released");

      const event = await appendRuntimeEvent({ runtimeRoot, runId: "run-test", taskId: cdb000.work_order_id, eventType: "approval_recorded", actor: "operator", occurredAt: "2026-07-13T00:00:00Z", payload: { decision: "approved" } });
      expect(event.event_seq).toBe(1);
      await expect(appendProofRecord({ runtimeRoot, taskId: cdb000.work_order_id, status: "passed", actor: "agent-a", recordedAt: "2026-07-13T00:01:00Z", evidence: [], verificationOutput: {} })).rejects.toThrow(/evidence/i);
      const proof = await appendProofRecord({ runtimeRoot, taskId: cdb000.work_order_id, status: "passed", actor: "agent-a", recordedAt: "2026-07-13T00:01:00Z", evidence: ["receipt:test"], verificationOutput: { tests: "passed" }, intentLockDigest: cdb000.intent_lock.digest });
      expect(proof.proof_seq).toBe(1);
      const checkpoint = await recordCheckpoint({ runtimeRoot, taskId: cdb000.work_order_id, checkpointRef: "snapshot:test", checkpointHash: `sha256:${"a".repeat(64)}`, recordedAt: "2026-07-13T00:02:00Z", actor: "agent-a", intentLockDigest: cdb000.intent_lock.digest });
      expect(checkpoint.checkpoint_seq).toBe(1);
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true });
    }
  });

  it("passes the reusable deterministic artifact checker", async () => {
    const result = await checkTaskTableArtifacts({ repoRoot });
    expect(result.ok, result.errors.join("\n")).toBe(true);
    expect(result.report.status).toBe("passed");
  });

  it("documents the authority boundary, Blueprint relationship, and agent routes", async () => {
    const readme = await readFile(path.join(taskTables, "README.md"), "utf8");

    expect(readme).toContain("source_commit: c84740532ded2a27ee283ea7a3a5f303eaeb61a7");
    expect(readme).toContain("[[planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]");
    expect(readme).toContain("[[planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY]]");
    expect(readme).toContain("Upstream `complete` is not LifeOS completion");
    expect(readme).toContain("workflow/mandatory_capabilities.json");
    expect(readme).toContain("exactly 28 mandatory, review-only capabilities");
    expect(readme).toContain("workflow/mandatory_language_inventory.json");
    expect(readme).toContain("mandatory_language_sources: 87");
    expect(readme).toContain("mandatory_language_occurrences: 295");
    expect(readme).toContain("unclassified_normative_occurrences: 0");
    expect(readme).toContain("admissible_as_lifeos_completion: false");
    expect(readme).toContain("bun planning-spine-v0/scripts/import-nu-plugin-task-tables.mjs --check");
  });
});
