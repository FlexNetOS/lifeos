import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  checkNavigationArtifacts,
  validateNavigationArtifactSchemas
} from "../planning-spine-v0/scripts/build-navigation-index.mjs";
import { checkTaskTableArtifacts } from "../planning-spine-v0/scripts/import-nu-plugin-task-tables.mjs";

const repoRoot = process.cwd();
const pkgRoot = path.join(repoRoot, "planning-spine-v0");
const runtimeReportPath = path.join(pkgRoot, "state", "verification_runtime_report.json");
const mvpBundlePath = path.join(pkgRoot, "examples", "mvp-bundle.json");
const mvpBundleReportPath = path.join(pkgRoot, "state", "mvp_bundle_report.json");
const authorityIntegrityReportPath = path.join(pkgRoot, "state", "authority_integrity_report.json");
const performedChecks = [];
const bundleReport = {
  bundle_path: path.relative(repoRoot, mvpBundlePath),
  observed_at: null,
  result: "fail",
  message: null,
  bundle_id: null,
  scope: null,
  scope_boundaries: null,
  bundle_order: [],
  resolved_objects: {},
  authority_assignment: null,
  linkage_checks: []
};
const authorityIntegrityReport = {
  bundle_path: path.relative(repoRoot, mvpBundlePath),
  observed_at: null,
  result: "fail",
  message: null,
  verifier_authority: null,
  proof_record: null,
  integrity_checks: []
};

const requiredDocs = [
  "README.md",
  "ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md",
  "navigation/README.md",
  "navigation/source.json",
  "00_NORTH_STAR.md",
  "01_OBJECT_MODEL.md",
  "02_AUTHORITY_GRAPH.md",
  "03_TASK_GRAPH_SCHEMA.md",
  "04_WORLDSEED_SCHEMA.md",
  "05_HERMETIC_CELL_CONTRACT.md",
  "06_PROOF_LEDGER.md",
  "07_MVP_VERTICAL_SLICE.md",
  "08_EXECUTION_GATES.md",
  "09_OPEN_QUESTIONS.md",
  "1.0_VISION/README.md",
  "1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md",
  "1.0_VISION/Notebooklm/README.md",
  "1.0_VISION/Notebooklm/artifacts.meta.json",
  "generated/envctl_package_landing_receipt.json",
  "task_tables/README.md",
  "task_tables/workflow/mandatory_capabilities.json",
  "task_tables/workflow/mandatory_capabilities.csv",
  "navigation/generated/navigation_graph.json",
  "navigation/generated/navigation_index.json",
  "navigation/generated/navigation.validation_report.json",
  "navigation/schemas/index.json",
  "navigation/schemas/navigation-graph.schema.json",
  "navigation/schemas/navigation-index.schema.json",
  "navigation/schemas/navigation-validation.schema.json",
  "rfcs/RFC-001_DEVWORLD_MIROFISH_ADAPTER.md",
  "rfcs/RFC-002_COMPILED_AGENT_BRAINPACK.md"
];

const schemaFiles = {
  Intent: "schemas/intent.schema.json",
  Goal: "schemas/goal.schema.json",
  Agent: "schemas/agent.schema.json",
  Role: "schemas/role.schema.json",
  Capability: "schemas/capability.schema.json",
  Task: "schemas/task.schema.json",
  Cell: "schemas/cell.schema.json",
  WorldSeed: "schemas/worldseed.schema.json",
  SimulationReport: "schemas/simulation-report.schema.json",
  ProofRecord: "schemas/proof-record.schema.json",
  Decision: "schemas/decision.schema.json",
  Action: "schemas/action.schema.json",
  Artifact: "schemas/artifact.schema.json"
};

const exampleFiles = {
  Intent: "examples/intent.json",
  Goal: "examples/goal.json",
  Agent: "examples/agent.json",
  Role: "examples/role.json",
  Capability: "examples/capability.json",
  Task: "examples/task.json",
  Cell: "examples/cell.json",
  WorldSeed: "examples/worldseed.json",
  SimulationReport: "examples/simulation-report.json",
  ProofRecord: "examples/proof-record.json",
  Decision: "examples/decision.json",
  Action: "examples/action.json",
  Artifact: "examples/artifact.json"
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(pkgRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function recordCheck(name) {
  performedChecks.push(name);
}

function assertInside(parent, candidate, label) {
  const relative = path.relative(parent, candidate);
  assert(
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} must stay inside ${parent}`
  );
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function countNewlines(filePath) {
  const bytes = fs.readFileSync(filePath);
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0x0a) count += 1;
  }
  return count;
}

function recordBundleLink(name, from, to, detail, passed) {
  bundleReport.linkage_checks.push({
    name,
    from,
    to,
    detail,
    result: passed ? "pass" : "fail"
  });

  assert(passed, detail);
}

function recordAuthorityCheck(name, detail, passed, context = {}) {
  authorityIntegrityReport.integrity_checks.push({
    name,
    detail,
    result: passed ? "pass" : "fail",
    context
  });

  assert(passed, detail);
}

function currentObservedAt() {
  const rawEpoch = process.env.SOURCE_DATE_EPOCH;
  if (rawEpoch === undefined) return new Date().toISOString();
  assert(/^\d+$/.test(rawEpoch), "SOURCE_DATE_EPOCH must be a non-negative integer Unix timestamp");
  const observedAt = new Date(Number(rawEpoch) * 1000);
  assert(!Number.isNaN(observedAt.getTime()), "SOURCE_DATE_EPOCH is outside the supported date range");
  return observedAt.toISOString();
}

function withoutObservedAt(report) {
  const stable = { ...report };
  delete stable.observed_at;
  return stable;
}

function writeStableReport(reportPath, report) {
  let existing = null;
  if (fs.existsSync(reportPath)) {
    existing = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  }
  if (
    existing
    && JSON.stringify(withoutObservedAt(existing)) === JSON.stringify(withoutObservedAt(report))
  ) {
    report.observed_at = existing.observed_at;
  } else {
    report.observed_at = currentObservedAt();
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (!existing || fs.readFileSync(reportPath, "utf8") !== serialized) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, serialized, "utf8");
  }
}

function portableArg(arg) {
  if (!path.isAbsolute(arg)) return arg;
  const relative = path.relative(repoRoot, arg);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : arg;
}

function writeRuntimeReport(result, message) {
  const report = {
    command: process.env.npm_lifecycle_event === "planning-spine:verify"
      ? "bun run planning-spine:verify"
      : `bun ${path.relative(repoRoot, process.argv[1] ?? "scripts/verify-planning-spine.mjs")}`,
    cwd: ".",
    pkg_root: path.relative(repoRoot, pkgRoot),
    executable: process.execPath,
    runtime: {
      name: typeof Bun !== "undefined" ? "bun" : "node",
      version: typeof Bun !== "undefined" ? Bun.version : process.version,
      argv: process.argv.map(portableArg)
    },
    lifecycle_event: process.env.npm_lifecycle_event ?? null,
    observed_at: null,
    performed_checks: performedChecks,
    result,
    message
  };

  writeStableReport(runtimeReportPath, report);
}

function writeMvpBundleReport(result, message) {
  bundleReport.result = result;
  bundleReport.message = message;
  writeStableReport(mvpBundleReportPath, bundleReport);
}

function writeAuthorityIntegrityReport(result, message) {
  authorityIntegrityReport.result = result;
  authorityIntegrityReport.message = message;
  writeStableReport(authorityIntegrityReportPath, authorityIntegrityReport);
}

function validate(schema, value, at = "$") {
  if (schema.type === "object") {
    assert(value && typeof value === "object" && !Array.isArray(value), `${at} must be an object`);
    for (const requiredKey of schema.required ?? []) {
      assert(Object.hasOwn(value, requiredKey), `${at}.${requiredKey} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        assert(schema.properties && Object.hasOwn(schema.properties, key), `${at}.${key} is not allowed`);
      }
    }
    for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        validate(propSchema, value[key], `${at}.${key}`);
      }
    }
    return;
  }

  if (schema.type === "array") {
    assert(Array.isArray(value), `${at} must be an array`);
    if (typeof schema.minItems === "number") {
      assert(value.length >= schema.minItems, `${at} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => validate(schema.items, item, `${at}[${index}]`));
    }
    return;
  }

  if (schema.type === "string") {
    assert(typeof value === "string", `${at} must be a string`);
    if (schema.enum) {
      assert(schema.enum.includes(value), `${at} must be one of: ${schema.enum.join(", ")}`);
    }
    return;
  }

  throw new Error(`Unsupported schema type at ${at}: ${schema.type}`);
}

function verifyDocs() {
  recordCheck("required_docs_exist");
  for (const relativePath of requiredDocs) {
    assert(fs.existsSync(path.join(pkgRoot, relativePath)), `Missing required doc: ${relativePath}`);
  }
}

function verifyVisionArtifactCatalog() {
  recordCheck("vision_artifact_catalog_matches_exact_bytes");
  const catalog = readJson("1.0_VISION/Notebooklm/artifacts.meta.json");
  assert(
    catalog.schema_version === "lifeos-planning-spine.raw-artifact-catalog.v0",
    "Vision artifact catalog schema version must be recognized"
  );
  assert(catalog.status === "cataloged-unverified", "Raw artifact catalog must not imply verification");
  assert(catalog.authority?.proves_implementation === false, "Raw artifacts must not claim implementation proof");
  assert(catalog.authority?.grants_decision_authority === false, "Raw artifacts must not claim decision authority");
  assert(Array.isArray(catalog.artifacts) && catalog.artifacts.length === 4, "Vision artifact catalog must list all four imports");

  const ids = new Set();
  const paths = new Set();
  for (const artifact of catalog.artifacts) {
    assert(typeof artifact.id === "string" && artifact.id.length > 0, "Every vision artifact needs a stable id");
    assert(!ids.has(artifact.id), `Duplicate vision artifact id: ${artifact.id}`);
    ids.add(artifact.id);

    assert(typeof artifact.path === "string" && artifact.path.length > 0, `${artifact.id} must define path`);
    assert(!paths.has(artifact.path), `Duplicate vision artifact path: ${artifact.path}`);
    paths.add(artifact.path);

    const artifactPath = path.resolve(pkgRoot, artifact.path);
    assertInside(pkgRoot, artifactPath, `${artifact.id}.path`);
    assert(fs.existsSync(artifactPath), `Missing vision artifact: ${artifact.path}`);
    assert(fs.statSync(artifactPath).isFile(), `Vision artifact must be a file: ${artifact.path}`);
    assert(fs.statSync(artifactPath).size === artifact.byte_count, `${artifact.id} byte count drifted`);
    assert(sha256File(artifactPath) === artifact.sha256, `${artifact.id} SHA-256 drifted`);
    assert(countNewlines(artifactPath) === artifact.newline_count, `${artifact.id} newline count drifted`);
    assert(
      ["incomplete", "partial"].includes(artifact.provenance?.identity_status),
      `${artifact.id} must preserve its incomplete provenance state`
    );
  }
}

function verifyVisionNavigationLinks() {
  recordCheck("vision_navigation_links_resolve");
  const docs = [
    "README.md",
    "ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md",
    "1.0_VISION/README.md",
    "1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md",
    "1.0_VISION/Notebooklm/README.md",
    "1.0_VISION/FOUNDATION_ECOSYSTEM_MAP.md",
    "1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL.md",
    "docs/NOTEBOOKLM_SOURCE_EXTRACTION_PROTOCOL.md",
    "task_tables/README.md"
  ];

  for (const relativeDoc of docs) {
    const docPath = path.join(pkgRoot, relativeDoc);
    const text = fs.readFileSync(docPath, "utf8");

    const markdownLinks = text.matchAll(/\[[^\]]+\]\((?:<([^>]+)>|([^\s)]+))\)/g);
    for (const match of markdownLinks) {
      const target = (match[1] ?? match[2]).split("#", 1)[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const resolved = path.resolve(path.dirname(docPath), decodeURIComponent(target));
      const fromRepo = path.relative(repoRoot, resolved);
      if (fromRepo.startsWith("..") || path.isAbsolute(fromRepo)) continue;
      assert(fs.existsSync(resolved), `Broken Markdown link in ${relativeDoc}: ${target}`);
    }

    const wikiText = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]*`/g, "");
    const wikiLinks = wikiText.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const match of wikiLinks) {
      const target = match[1].split("|", 1)[0].split("#", 1)[0].trim();
      if (!target) continue;
      let resolved = path.resolve(repoRoot, target);
      if (path.extname(resolved) === "") resolved += ".md";
      assertInside(repoRoot, resolved, `Wiki link in ${relativeDoc}`);
      assert(fs.existsSync(resolved), `Broken wiki link in ${relativeDoc}: ${target}`);
    }
  }
}

async function verifyTaskTableHandoff() {
  recordCheck("nu_plugin_task_table_handoff_is_complete_deterministic_and_review_only");
  const result = await checkTaskTableArtifacts({ repoRoot });
  assert(result.ok, `nu_plugin task-table handoff drifted: ${result.errors.join("; ")}`);
  assert(result.report.status === "passed", "nu_plugin task-table validation report must pass");
  assert(result.report.counts.total === 428, "nu_plugin task-table source taxonomy must retain all 428 rows");
  assert(result.report.counts.work_orders === 106, "nu_plugin task-table handoff must retain 106 CDB WorkOrders");
  assert(result.report.counts.task_execution_proofs === 0, "Imported CDB WorkOrders must not acquire execution proof");
  assert(result.report.counts.pending_human_approvals === 106, "Every imported CDB WorkOrder must remain human-approval gated");
}

function verifyAgentNavigationGraph() {
  recordCheck("agent_navigation_graph_is_current_connected_and_queryable");
  const result = checkNavigationArtifacts({ repoRoot });
  assert(result.ok, `Agent navigation graph drifted: ${result.drift.join("; ")}`);

  const { graph, index, validation } = result.artifacts;
  assert(validation.result === "pass", "Agent navigation validation must pass");
  assert(validation.counts.included_package_files > 0, "Agent navigation must index package files");
  assert(validation.counts.strict_unresolved_links === 0, "Agent navigation has unresolved gated links");
  assert(validation.counts.unresolved_links === 0, "Agent navigation has unresolved local links");
  assert(validation.checks.every((check) => check.result === "pass"), "Every agent navigation validation check must pass");
  assert(graph.nodes.some((node) => node.id === graph.root_node_id), "Agent navigation root node must resolve");
  assert(graph.nodes.length === Object.keys(index.records).length, "Graph nodes and compact index records must stay one-to-one");
  assert(index.entrypoints.every((entrypoint) => entrypoint.node_id), "Every agent navigation entrypoint must resolve");
  assert(index.by_task_id["STORE-001"] === "task:STORE-001", "STORE-001 must be directly retrievable by task id");
  assert(index.by_claim_id["REDB-CLAIM-002"] === "claim:REDB-CLAIM-002", "REDB-CLAIM-002 must be directly retrievable by claim id");
  assert(index.by_source_id["NBSOURCE-001"] === "source:NBSOURCE-001", "NBSOURCE-001 must be directly retrievable by source id");

  recordCheck("navigation_outputs_satisfy_declared_schemas");
  const schemaValidation = validateNavigationArtifactSchemas(result.artifacts);
  assert(schemaValidation.ok, `Navigation schema validation failed: ${schemaValidation.errors.join("; ")}`);

  recordCheck("notebooklm_blueprint_is_hash_bound_and_cross_referenced");
  const blueprintPath = "planning-spine-v0/1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md";
  const compatibilityPath = "planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md";
  const blueprintSha256 = "014bbebb8afceee7f8deea236ed3b9425b61be3840fba47aee7c131f77268827";
  const blueprintNodeId = index.by_path[blueprintPath];
  const compatibilityNodeId = index.by_path[compatibilityPath];
  const rawArtifactNodeId = "raw-artifact:lifeos.vision.notebooklm.architecture-blueprint";
  const blueprintNode = graph.nodes.find((node) => node.id === blueprintNodeId);
  const compatibilityNode = graph.nodes.find((node) => node.id === compatibilityNodeId);
  assert(blueprintNode?.content?.sha256 === blueprintSha256, "Blueprint file node must preserve the cataloged SHA-256");
  assert(
    compatibilityNode?.metadata?.frontmatter?.source_artifact?.sha256 === blueprintSha256,
    "Blueprint compatibility frontmatter must preserve the source SHA-256"
  );
  assert(
    graph.edges.some((edge) => edge.from === rawArtifactNodeId && edge.to === blueprintNodeId && edge.kind === "identifies-bytes"),
    "Raw Blueprint artifact must identify its exact file node"
  );
  for (const linkKind of ["markdown-link", "wiki-link"]) {
    assert(
      graph.edges.some((edge) => edge.from === compatibilityNodeId && edge.to === blueprintNodeId && edge.kind === linkKind),
      `Blueprint compatibility must retain its ${linkKind}`
    );
  }
}

function verifySchemas() {
  recordCheck("schemas_define_required_fields");
  for (const [name, relativePath] of Object.entries(schemaFiles)) {
    const schema = readJson(relativePath);
    assert(Array.isArray(schema.required) && schema.required.length > 0, `${name} schema must define required fields`);
  }

  recordCheck("task_schema_requires_execution_constraints");
  const taskSchema = readJson(schemaFiles.Task);
  for (const field of ["allowed_paths", "blocked_paths", "verification_gate", "rollback_plan", "proof_uri"]) {
    assert(taskSchema.required.includes(field), `Task schema must require ${field}`);
  }
}

function verifyExamples() {
  recordCheck("examples_satisfy_schemas");
  for (const [name, schemaPath] of Object.entries(schemaFiles)) {
    const schema = readJson(schemaPath);
    const example = readJson(exampleFiles[name]);
    validate(schema, example);
  }
}

function verifyMvpConstraints() {
  recordCheck("readme_preserves_scope_boundaries");
  const readme = fs.readFileSync(path.join(pkgRoot, "README.md"), "utf8");
  assert(readme.includes("v0"), "README must identify v0 scope");
  assert(readme.includes("RFC"), "README must identify RFC scope");
  assert(readme.includes("post-v0"), "README must identify post-v0 scope");

  recordCheck("task_example_preserves_proof_constraints");
  const task = readJson(exampleFiles.Task);
  assert(task.proof_uri && task.proof_uri.startsWith("proof://"), "Task example must declare proof_uri");
  assert(Array.isArray(task.allowed_paths) && task.allowed_paths.length > 0, "Task example must declare allowed_paths");
  assert(Array.isArray(task.blocked_paths) && task.blocked_paths.length > 0, "Task example must declare blocked_paths");

  recordCheck("simulation_report_emits_constraint_updates");
  const report = readJson(exampleFiles.SimulationReport);
  assert(report.constraint_updates.length > 0, "Simulation report must emit constraint updates");
}

function loadBundleRef(ref, label) {
  assert(ref && typeof ref === "object", `${label} must be an object`);
  assert(typeof ref.schema === "string" && schemaFiles[ref.schema], `${label}.schema must name a known schema`);
  assert(typeof ref.path === "string" && ref.path.startsWith("examples/"), `${label}.path must stay inside examples/`);
  assert(typeof ref.id === "string" && ref.id.length > 0, `${label}.id must be a non-empty string`);

  const value = readJson(ref.path);
  const schema = readJson(schemaFiles[ref.schema]);
  validate(schema, value, `$bundle.${label}`);
  assert(value.id === ref.id, `${label} id mismatch: expected ${ref.id}, received ${value.id}`);
  return value;
}

function verifyMvpBundle() {
  recordCheck("mvp_bundle_manifest_exists");
  assert(fs.existsSync(mvpBundlePath), "Missing required bundle manifest: examples/mvp-bundle.json");

  const bundle = JSON.parse(fs.readFileSync(mvpBundlePath, "utf8"));
  const requiredOrder = [
    "intent",
    "goal",
    "authority_assignment",
    "task",
    "worldseed",
    "simulation_report",
    "cell",
    "proof",
    "decision",
    "action",
    "artifact"
  ];

  bundleReport.bundle_id = bundle.id ?? null;
  bundleReport.scope = bundle.scope ?? null;
  bundleReport.scope_boundaries = bundle.scope_boundaries ?? null;
  bundleReport.bundle_order = bundle.bundle_order ?? [];

  recordCheck("mvp_bundle_preserves_scope_boundaries");
  assert(bundle.scope === "v0", "MVP bundle scope must remain v0");
  assert(bundle.scope_boundaries?.v0 === "in-scope", "MVP bundle must keep v0 in scope");
  assert(bundle.scope_boundaries?.rfc === "proposed-only", "MVP bundle must keep RFC proposed-only");
  assert(bundle.scope_boundaries?.post_v0 === "deferred", "MVP bundle must keep post-v0 deferred");
  assert(JSON.stringify(bundle.bundle_order) === JSON.stringify(requiredOrder), "MVP bundle order must match the required end-to-end chain");

  recordCheck("mvp_bundle_resolves_canonical_examples");
  const resolved = {};
  for (const key of Object.keys(bundle.objects ?? {})) {
    const ref = bundle.objects[key];
    const value = loadBundleRef(ref, `objects.${key}`);
    resolved[key] = value;
    bundleReport.resolved_objects[key] = {
      schema: ref.schema,
      path: ref.path,
      id: value.id
    };
  }

  for (const key of requiredOrder.filter((entry) => entry !== "authority_assignment")) {
    assert(resolved[key], `MVP bundle must define object reference for ${key}`);
  }

  const authority = bundle.authority_assignment;
  assert(authority && typeof authority === "object", "MVP bundle must define authority_assignment");
  assert(Array.isArray(authority.required_capabilities) && authority.required_capabilities.length > 0, "Authority assignment must declare at least one capability");
  assert(authority.proof_verifier && typeof authority.proof_verifier === "object", "Authority assignment must declare proof_verifier");

  const assignedRole = loadBundleRef(authority.assigned_role, "authority_assignment.assigned_role");
  const assignedAgent = loadBundleRef(authority.assigned_agent, "authority_assignment.assigned_agent");
  const requiredCapabilities = authority.required_capabilities.map((ref, index) =>
    loadBundleRef(ref, `authority_assignment.required_capabilities[${index}]`)
  );
  const proofVerifierAgent = loadBundleRef(authority.proof_verifier.agent, "authority_assignment.proof_verifier.agent");
  const proofVerifierRole = loadBundleRef(authority.proof_verifier.role, "authority_assignment.proof_verifier.role");
  const proofVerifierCapabilities = authority.proof_verifier.required_capabilities.map((ref, index) =>
    loadBundleRef(ref, `authority_assignment.proof_verifier.required_capabilities[${index}]`)
  );

  bundleReport.authority_assignment = {
    authority_root: authority.authority_root,
    operational_delegate: authority.operational_delegate,
    task_id: authority.task_id,
    assigned_role_id: assignedRole.id,
    assigned_agent_id: assignedAgent.id,
    required_capability_ids: requiredCapabilities.map((capability) => capability.id),
    proof_verifier: {
      agent_id: proofVerifierAgent.id,
      role_id: proofVerifierRole.id,
      required_capability_ids: proofVerifierCapabilities.map((capability) => capability.id)
    }
  };

  authorityIntegrityReport.verifier_authority = {
    authority_root: authority.authority_root,
    operational_delegate: authority.operational_delegate,
    task_id: authority.task_id,
    executor_agent_id: assignedAgent.id,
    executor_role_id: assignedRole.id,
    verifier_agent_id: proofVerifierAgent.id,
    verifier_role_id: proofVerifierRole.id,
    verifier_capability_ids: proofVerifierCapabilities.map((capability) => capability.id)
  };
  authorityIntegrityReport.proof_record = {
    proof_id: resolved.proof.id,
    subject_type: resolved.proof.subject_type,
    subject_id: resolved.proof.subject_id,
    verified_by: resolved.proof.verified_by,
    result: resolved.proof.result
  };

  recordCheck("mvp_bundle_cross_object_integrity");
  recordBundleLink(
    "intent_to_goal",
    resolved.intent.id,
    resolved.goal.id,
    "Intent.goal_ids must include the bundle goal id",
    resolved.intent.goal_ids.includes(resolved.goal.id) && resolved.goal.intent_id === resolved.intent.id
  );
  recordBundleLink(
    "goal_to_authority_assignment",
    resolved.goal.id,
    assignedAgent.id,
    "Goal authority_scope must match the operational delegate",
    resolved.goal.authority_scope === authority.operational_delegate
  );
  recordBundleLink(
    "authority_assignment_to_task",
    assignedAgent.id,
    resolved.task.id,
    "Authority assignment task_id and assigned agent must match the task owner",
    authority.task_id === resolved.task.id && resolved.task.owner_agent_id === assignedAgent.id
  );
  recordBundleLink(
    "authority_role_to_agent",
    assignedRole.id,
    assignedAgent.id,
    "Assigned agent must carry the assigned role",
    assignedAgent.role_ids.includes(assignedRole.id)
  );
  recordBundleLink(
    "authority_capabilities_to_role",
    requiredCapabilities.map((capability) => capability.id).join(","),
    assignedRole.id,
    "Assigned role must require every declared capability",
    requiredCapabilities.every((capability) => assignedRole.required_capability_ids.includes(capability.id))
  );
  recordBundleLink(
    "authority_capabilities_to_agent",
    requiredCapabilities.map((capability) => capability.id).join(","),
    assignedAgent.id,
    "Assigned agent must carry every declared capability",
    requiredCapabilities.every((capability) => assignedAgent.capability_ids.includes(capability.id))
  );
  recordBundleLink(
    "task_to_worldseed",
    resolved.task.id,
    resolved.worldseed.id,
    "WorldSeed must target the bundle intent and task",
    resolved.worldseed.intent_id === resolved.intent.id && resolved.worldseed.task_id === resolved.task.id
  );
  recordBundleLink(
    "worldseed_to_simulation_report",
    resolved.worldseed.id,
    resolved.simulation_report.id,
    "SimulationReport must reference the bundle worldseed and task",
    resolved.simulation_report.worldseed_id === resolved.worldseed.id && resolved.simulation_report.task_id === resolved.task.id
  );
  recordBundleLink(
    "simulation_report_to_cell",
    resolved.simulation_report.id,
    resolved.cell.id,
    "Cell inputs and outputs must expose the bundle task, proof, and artifact ids",
    resolved.cell.inputs.includes(resolved.task.id)
      && resolved.cell.outputs.includes(resolved.proof.id)
      && resolved.cell.outputs.includes(resolved.artifact.id)
  );
  recordBundleLink(
    "task_to_cell",
    resolved.task.id,
    resolved.cell.id,
    "Task cell_id and path boundaries must match the bundle cell",
    resolved.task.cell_id === resolved.cell.id
      && JSON.stringify(resolved.task.allowed_paths) === JSON.stringify(resolved.cell.allowed_paths)
      && JSON.stringify(resolved.task.blocked_paths) === JSON.stringify(resolved.cell.blocked_paths)
  );
  recordBundleLink(
    "cell_to_proof",
    resolved.cell.id,
    resolved.proof.id,
    "ProofRecord must be a passing task proof verified by the declared verifier",
    resolved.proof.subject_type === "task"
      && resolved.proof.subject_id === resolved.task.id
      && resolved.proof.result === "pass"
      && resolved.proof.verified_by === proofVerifierAgent.id
  );
  recordBundleLink(
    "proof_to_decision",
    resolved.proof.id,
    resolved.decision.id,
    "Decision must derive from proof-backed task state and be made by the operational delegate",
    resolved.decision.intent_id === resolved.intent.id
      && resolved.decision.made_by === authority.operational_delegate
      && resolved.decision.inputs.includes(resolved.proof.id)
      && resolved.decision.inputs.includes(resolved.task.id)
  );
  recordBundleLink(
    "decision_to_action",
    resolved.decision.id,
    resolved.action.id,
    "Decision selected_option must resolve to the bundle action",
    resolved.decision.selected_option === resolved.action.id
  );
  recordBundleLink(
    "action_to_artifact",
    resolved.action.id,
    resolved.artifact.id,
    "Action, Task, and Artifact must agree on actor, task, and expected artifact ids",
    resolved.action.task_id === resolved.task.id
      && resolved.action.actor_id === assignedAgent.id
      && resolved.task.action_ids.includes(resolved.action.id)
      && resolved.action.expected_artifacts.includes(resolved.artifact.id)
      && resolved.artifact.task_id === resolved.task.id
      && resolved.artifact.generated_by === assignedAgent.id
      && resolved.task.artifact_ids.includes(resolved.artifact.id)
      && resolved.artifact.proof_record_ids.includes(resolved.proof.id)
  );

  recordCheck("mvp_bundle_verifier_authority_integrity");
  recordAuthorityCheck(
    "verifier_agent_is_distinct_from_executor",
    "Verifier agent must be distinct from the executing agent",
    proofVerifierAgent.id !== assignedAgent.id,
    {
      verifier_agent_id: proofVerifierAgent.id,
      executor_agent_id: assignedAgent.id
    }
  );
  recordAuthorityCheck(
    "verifier_role_is_carried_by_verifier_agent",
    "Verifier agent must carry the declared verifier role",
    proofVerifierAgent.role_ids.includes(proofVerifierRole.id),
    {
      verifier_agent_id: proofVerifierAgent.id,
      verifier_role_id: proofVerifierRole.id
    }
  );
  recordAuthorityCheck(
    "verifier_capabilities_are_required_by_verifier_role",
    "Verifier role must require every declared verifier capability",
    proofVerifierCapabilities.every((capability) => proofVerifierRole.required_capability_ids.includes(capability.id)),
    {
      verifier_role_id: proofVerifierRole.id,
      verifier_capability_ids: proofVerifierCapabilities.map((capability) => capability.id)
    }
  );
  recordAuthorityCheck(
    "verifier_capabilities_are_carried_by_verifier_agent",
    "Verifier agent must carry every declared verifier capability",
    proofVerifierCapabilities.every((capability) => proofVerifierAgent.capability_ids.includes(capability.id)),
    {
      verifier_agent_id: proofVerifierAgent.id,
      verifier_capability_ids: proofVerifierCapabilities.map((capability) => capability.id)
    }
  );
  recordAuthorityCheck(
    "verifier_scope_matches_operational_delegate",
    "Verifier authority scope must stay inside the declared operational delegation boundary",
    proofVerifierAgent.authority_scope === `${authority.operational_delegate}-delegated`,
    {
      verifier_agent_id: proofVerifierAgent.id,
      authority_scope: proofVerifierAgent.authority_scope,
      operational_delegate: authority.operational_delegate
    }
  );
  recordAuthorityCheck(
    "proof_record_verified_by_resolved_verifier_agent",
    "ProofRecord.verified_by must resolve to the declared verifier agent object",
    resolved.proof.verified_by === proofVerifierAgent.id,
    {
      proof_id: resolved.proof.id,
      verified_by: resolved.proof.verified_by,
      verifier_agent_id: proofVerifierAgent.id
    }
  );
  recordAuthorityCheck(
    "proof_record_subject_matches_bundle_task",
    "ProofRecord subject must resolve to the bundle task",
    resolved.proof.subject_type === "task" && resolved.proof.subject_id === resolved.task.id,
    {
      proof_id: resolved.proof.id,
      subject_type: resolved.proof.subject_type,
      subject_id: resolved.proof.subject_id,
      task_id: resolved.task.id
    }
  );
  recordAuthorityCheck(
    "verifier_boundary_rules_forbid_execution",
    "Verifier agent boundary rules must explicitly forbid task execution",
    proofVerifierAgent.boundary_rules.some((rule) => rule.includes("Cannot execute")),
    {
      verifier_agent_id: proofVerifierAgent.id,
      boundary_rules: proofVerifierAgent.boundary_rules
    }
  );
}

try {
  verifyDocs();
  verifyVisionArtifactCatalog();
  verifyVisionNavigationLinks();
  await verifyTaskTableHandoff();
  verifyAgentNavigationGraph();
  verifySchemas();
  verifyExamples();
  verifyMvpConstraints();
  verifyMvpBundle();
  writeMvpBundleReport("pass", "planning-spine-v0 MVP bundle verification passed");
  writeAuthorityIntegrityReport("pass", "planning-spine-v0 verifier authority integrity passed");
  writeRuntimeReport("pass", "planning-spine-v0 verification passed");
  console.log("planning-spine-v0 verification passed");
} catch (error) {
  writeMvpBundleReport("fail", `planning-spine-v0 MVP bundle verification failed: ${error.message}`);
  writeAuthorityIntegrityReport("fail", `planning-spine-v0 verifier authority integrity failed: ${error.message}`);
  writeRuntimeReport("fail", `planning-spine-v0 verification failed: ${error.message}`);
  console.error(`planning-spine-v0 verification failed: ${error.message}`);
  process.exit(1);
}
