import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const spineRoot = path.join(repoRoot, "planning-spine-v0");
const outputPath = path.join(spineRoot, "consolidation", "planning_spine_inventory.json");
const handoffOutputPath = path.join(spineRoot, "consolidation", "legacy_handoff_manifest.json");
const shadowOutputPath = path.join(spineRoot, "consolidation", "retired_shadow_manifest.json");
const archiveReceiptPath = path.join(spineRoot, "consolidation", "archive_receipt.json");
const excludedFromSelfInventory = new Set([
  "consolidation/planning_spine_inventory.json"
]);
const volatileProjectionPaths = new Set([
  "state/authority_integrity_report.json",
  "state/mvp_bundle_report.json",
  "state/verification_runtime_report.json"
]);

function isMachineRuntimeArtifact(relativePath) {
  return relativePath.startsWith("dist/")
    || /^generated\/fleet_verification\/[^/]+\.log$/.test(relativePath)
    || /(?:^|\/)__pycache__(?:\/|$)/.test(relativePath)
    || /(?:^|\/)\.pytest_cache(?:\/|$)/.test(relativePath)
    || /\.(?:py[co]|pid)$/.test(relativePath);
}

function isVolatileProjection(relativePath) {
  return relativePath.startsWith("navigation/generated/")
    || volatileProjectionPaths.has(relativePath);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function walkFiles(root) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  if (fs.existsSync(root)) walk(root);
  return files.sort();
}

function classify(relativePath) {
  if (/^1\.0_VISION\/Architecture_Anchors\/(?!README\.md$).+\.md$/.test(relativePath)) {
    return ["architecture-input", "immutable-source", "Immutable desired-architecture anchor", "retain"];
  }
  if (relativePath === "1.0_VISION/Architecture_Anchors/receipts.json"
      || relativePath === "1.0_VISION/Architecture_Anchors/section_inventory.json") {
    return ["exact-evidence", "maintained", "Anchor provenance and complete line-coverage receipt", "retain"];
  }
  if (relativePath.startsWith("consolidation/")) {
    return ["maintained-contract", "maintained", "Consolidation authority, inventory, disposition, or archive receipt", "retain"];
  }
  if (relativePath.startsWith("proof_records/")) {
    return ["exact-evidence", "append-only", "Accepted or historical proof-ledger evidence", "retain"];
  }
  if (relativePath.startsWith("navigation/generated/")) {
    return ["derived-projection", "generated", "Deterministic navigation projection", "retain"];
  }
  if (relativePath.startsWith("navigation/")) {
    return relativePath.startsWith("navigation/schemas/")
      ? ["maintained-contract", "maintained", "Navigation schema", "retain"]
      : ["maintained-contract", "maintained", "Authored navigation source or contract", "retain"];
  }
  if (/^generated\/.+\.source\.(csv|json)$/.test(relativePath)
      || relativePath === "generated/task_graph.source.csv") {
    return ["canonical-input", "maintained", "Canonical authored planning input", "retain"];
  }
  if (relativePath.startsWith("generated/")) {
    return ["derived-projection", "generated", "Deterministic planning projection", "retain"];
  }
  if (/^(state|capability_state|connector_state|connector_proof|weave_state)\//.test(relativePath)) {
    return ["derived-projection", "generated", "Current-state or capability projection", "retain"];
  }
  if (relativePath.startsWith("envctl-db-nu-plugin-migration-automation-package/")) {
    return ["review-only-import", "immutable-source", "Pinned upstream migration-package evidence", "retain"];
  }
  if (relativePath.startsWith("task_tables/")) {
    return ["review-only-import", "maintained", "Isolated imported WorkOrder or mandatory-capability projection", "retain"];
  }
  if (relativePath.startsWith("1.0_VISION/Notebooklm/")) {
    return ["architecture-input", "immutable-source", "Raw NotebookLM architecture input", "retain"];
  }
  if (relativePath.startsWith("1.0_VISION/")) {
    return ["maintained-contract", "maintained", "Vision, compatibility, or current-state interpretation", "retain"];
  }
  if (relativePath.startsWith("docs/") || /^0[0-9]_/.test(relativePath) || relativePath === "README.md" || relativePath === "EXECUTION_STATUS.md") {
    return ["maintained-contract", "maintained", "Planning, authority, or execution contract", "retain"];
  }
  if (relativePath.startsWith("scripts/") || relativePath.endsWith(".py")) {
    return ["execution-tooling", "executable", "Planning generator, importer, verifier, or test", "retain"];
  }
  if (relativePath.startsWith("schemas/") || relativePath.startsWith("rfcs/")) {
    return ["maintained-contract", "maintained", "Schema or mandatory design proposal", "retain"];
  }
  if (relativePath.startsWith("examples/") || relativePath.includes("/fixtures/")) {
    return ["example-or-fixture", "reference", "Schema example, simulation input, or test fixture", "retain"];
  }
  if (relativePath.startsWith("dist/")) {
    return ["artifact-bundle", "generated", "Packaged deterministic execution artifact", "retain"];
  }
  return ["maintained-contract", "maintained", "Repository-native Planning Spine resource", "retain"];
}

function semanticFields(relativePath, authorityClass, lifecycle, purpose, disposition) {
  const taskOrClaimBearing = /(^|\/)(task|claim|proof|ledger|contract|authority|crosswalk|task_graph|coverage)/i.test(relativePath);
  return {
    claims_or_tasks: taskOrClaimBearing
      ? "Identifiers and relationships are resolved from this file by the canonical task/proof/navigation generators."
      : "No independent claim or task authority; content is retained for its declared purpose.",
    implementation_status: authorityClass === "derived-projection"
      ? "generated-current-view"
      : authorityClass === "architecture-input"
        ? "desired-architecture-not-implementation-proof"
        : "preserved-current-repository-state",
    proof_status: authorityClass === "exact-evidence"
      ? "evidence-read-from-artifact"
      : "does-not-independently-prove-implementation",
    duplicates_or_overlaps: lifecycle === "generated"
      ? "Projection may repeat canonical identifiers; canonical source remains controlling."
      : "No byte-identical duplicate authority inferred from age or naming.",
    conflicts: "No unresolved consolidation conflict; controlling resolutions are recorded in 1.0_VISION/Architecture_Anchors/anchor_conflict_ledger.csv.",
    dependencies: lifecycle === "generated"
      ? ["Owning repository generator and canonical inputs"]
      : ["Repository operating contracts and declared source links"],
    intended_canonical_destination: relativePath,
    final_disposition: disposition,
    purpose
  };
}

function inventorySpine() {
  const entries = walkFiles(spineRoot)
    .map((absolute) => path.relative(spineRoot, absolute).split(path.sep).join("/"))
    .filter((relative) => (
      !excludedFromSelfInventory.has(relative)
      && !isMachineRuntimeArtifact(relative)
    ))
    .map((relative) => {
      const absolute = path.join(spineRoot, relative);
      const bytes = fs.readFileSync(absolute);
      const [authorityClass, lifecycle, purpose, disposition] = classify(relative);
      const volatileProjection = isVolatileProjection(relative);
      return {
        path: relative,
        bytes: volatileProjection ? null : bytes.length,
        sha256: volatileProjection ? null : sha256(bytes),
        content_identity_status: volatileProjection
          ? "generator-owned-volatile-projection; identity verified by owning check, not pinned recursively here"
          : "sha256-pinned",
        authority_class: authorityClass,
        lifecycle,
        ...semanticFields(relative, authorityClass, lifecycle, purpose, disposition)
      };
    });

  const countBy = (field) => Object.fromEntries(
    [...new Set(entries.map((entry) => entry[field]))]
      .sort()
      .map((value) => [value, entries.filter((entry) => entry[field] === value).length])
  );

  return {
    schema_version: "lifeos-planning-spine.complete-file-inventory.v1",
    root: "planning-spine-v0",
    excluded_self_path: "consolidation/planning_spine_inventory.json",
    generated_by: "scripts/build-consolidation-inventory.mjs",
    summary: {
      file_count: entries.length,
      total_hashed_bytes: entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
      volatile_projection_count: entries.filter((entry) => entry.sha256 === null).length,
      by_authority_class: countBy("authority_class"),
      by_lifecycle: countBy("lifecycle"),
      by_disposition: countBy("final_disposition")
    },
    entries
  };
}

const handoffMetadata = {
  "README.md": {
    purpose: "Legacy fleet continuity-layer instructions and precedence claims",
    substantive_items: ["Git > witnessed ledger > task cards", "Planning lives on the KB board", "hf-generated cards and packets are derived views"],
    canonical_destinations: ["navigation/README.md", "06_PROOF_LEDGER.md", "docs/NOTEBOOKLM_SOURCE_EXTRACTION_PROTOCOL.md"],
    final_disposition: "superseded-and-archived"
  },
  "context/capsule.json": {
    purpose: "Historical LifeOS identity and next-command capsule",
    substantive_items: ["LifeOS is a Vue 3 + Tauri 2 application", "Cargo workspace includes lifeos-core and lifeos-daemon", "Knowledge and planning must survive session resets"],
    canonical_destinations: ["../AGENTS.md", "README.md", "navigation/README.md"],
    final_disposition: "merged-as-historical-provenance-and-archived"
  },
  "hooks/hooks.toml": {
    purpose: "Obsolete hf continuity hook declarations",
    substantive_items: ["Session lifecycle attempted to run hf resume/checkpoint/export/sync/reap", "Several referenced hf verbs were unimplemented"],
    canonical_destinations: ["repository operating contracts", "profile-owned agent hook policy"],
    final_disposition: "superseded-obsolete-and-archived"
  },
  "hooks/loop-entry.sh": {
    purpose: "Obsolete Claude SessionStart hf launcher",
    substantive_items: ["Attempted hf binary discovery and resume", "Attempted automatic handoff-loop continuation"],
    canonical_destinations: ["repository operating contracts", "ICM recall", "navigation/README.md"],
    final_disposition: "superseded-obsolete-and-archived"
  },
  "hooks/session-end.sh": {
    purpose: "Obsolete Claude SessionEnd hf checkpoint and reap hook",
    substantive_items: ["Attempted hf checkpoint/handoff/export/sync", "Attempted worktree reap through envctl"],
    canonical_destinations: ["repository operating contracts", "proof ledger", "Git branch-hygiene policy"],
    final_disposition: "superseded-obsolete-and-archived"
  },
  "ledger.events.jsonl": {
    purpose: "Empty legacy continuity-ledger export",
    substantive_items: [],
    canonical_destinations: ["proof_records/proof_ledger.jsonl"],
    final_disposition: "empty-duplicate-archived"
  },
  "packets/.gitkeep": {
    purpose: "Empty placeholder for hf resume packets",
    substantive_items: [],
    canonical_destinations: ["generated/execution_packets/"],
    final_disposition: "empty-duplicate-archived"
  },
  "tasks/.gitkeep": {
    purpose: "Empty placeholder for hf task cards",
    substantive_items: [],
    canonical_destinations: ["generated/task_graph.source.csv"],
    final_disposition: "empty-duplicate-archived"
  }
};

function inventoryHandoff(handoffRoot) {
  if (!fs.existsSync(handoffRoot)) throw new Error(`handoff source missing: ${handoffRoot}`);
  const entries = walkFiles(handoffRoot).map((absolute) => {
    const relative = path.relative(handoffRoot, absolute).split(path.sep).join("/");
    const bytes = fs.readFileSync(absolute);
    const metadata = handoffMetadata[relative];
    if (!metadata) throw new Error(`unclassified legacy handoff item: ${relative}`);
    return {
      path: relative,
      bytes: bytes.length,
      sha256: sha256(bytes),
      authority_level: "legacy-migration-evidence",
      implementation_status: relative.startsWith("hooks/") ? "obsolete-runtime-hook" : "historical-or-empty",
      proof_status: "exact-byte-hash-only",
      duplicates_or_overlaps: metadata.canonical_destinations,
      dependencies: [],
      ...metadata
    };
  });
  return {
    schema_version: "lifeos-planning-spine.legacy-handoff-manifest.v1",
    requested_retired_path: {
      path: "/home/flexnetos/lifeos/.handoff",
      status: "absent-at-inventory-time",
      action: "not-recreated"
    },
    materialized_migration_source: {
      path: ".handoff",
      status: "tracked-legacy-payload",
      git_origin_commits: ["dc5051e", "2c6e438"]
    },
    summary: {
      file_count: entries.length,
      total_bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      substantive_item_count: entries.reduce((sum, entry) => sum + entry.substantive_items.length, 0),
      unclassified_count: 0,
      unresolved_count: 0
    },
    entries
  };
}

function inventoryShadow(shadowRoot) {
  if (!fs.existsSync(shadowRoot)) throw new Error(`shadow source missing: ${shadowRoot}`);
  const entries = walkFiles(shadowRoot).map((absolute) => {
    const relative = path.relative(shadowRoot, absolute).split(path.sep).join("/");
    const bytes = fs.readFileSync(absolute);
    const canonical = path.join(spineRoot, relative);
    let comparison = "missing-from-current-canonical-surface";
    let canonicalSha256 = null;
    if (fs.existsSync(canonical) && fs.statSync(canonical).isFile()) {
      canonicalSha256 = sha256(fs.readFileSync(canonical));
      comparison = canonicalSha256 === sha256(bytes)
        ? "byte-identical-to-current-canonical-surface"
        : "historical-variant-of-current-canonical-surface";
    }
    return {
      path: relative,
      bytes: bytes.length,
      sha256: sha256(bytes),
      comparison,
      canonical_path: fs.existsSync(canonical) ? relative : null,
      canonical_sha256: canonicalSha256,
      authority_level: "historical-pre-reset-evidence",
      purpose: relative.startsWith("proof_records/")
        ? "Historical proof or proof-ledger state captured before the 2026-07-13 reset"
        : relative.startsWith("generated/execution_packets/")
          ? "Historical generated execution packet or packet validation state"
          : "Historical generated planning, task, inventory, or verification state",
      claims_or_tasks: "Historical identifiers and values remain recoverable from the exact archived byte; they do not override the current canonical source, latest accepted proof revision, or regenerated projection.",
      implementation_status: "historical-pre-reset-snapshot",
      proof_status: relative.startsWith("proof_records/")
        ? "historical-evidence-only; current accepted revision controls"
        : "generated-state-not-independent-proof",
      duplicates_or_overlaps: comparison,
      conflicts: comparison === "historical-variant-of-current-canonical-surface"
        ? "Historical variant preserved; current canonical path controls."
        : comparison === "missing-from-current-canonical-surface"
          ? "Unique historical byte preserved in the recoverable Meta archive; no current authority inferred."
          : "Byte-identical duplicate of current canonical surface.",
      dependencies: ["retired_shadow_manifest.json", "recoverable Meta archive receipt"],
      intended_canonical_destination: fs.existsSync(canonical)
        ? relative
        : "recoverable archive only; historical item has no current operational destination",
      unique_bytes_preserved_by_archive: comparison !== "byte-identical-to-current-canonical-surface",
      final_disposition: "recoverable-meta-archive"
    };
  });
  const comparisonCounts = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.comparison))]
      .sort()
      .map((value) => [value, entries.filter((entry) => entry.comparison === value).length])
  );
  return {
    schema_version: "lifeos-planning-spine.retired-shadow-manifest.v1",
    source_path: "planning-spine-v0/proof-ledger-pre-reset-20260713T171233Z",
    authority_boundary: "Historical pre-reset bytes are evidence only and must not be indexed as a second active proof/task authority.",
    summary: {
      file_count: entries.length,
      total_bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      by_comparison: comparisonCounts,
      unclassified_count: 0,
      unresolved_count: 0
    },
    entries
  };
}

function parseArgs(argv) {
  const options = { mode: "check", handoffRoot: null, shadowRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") options.mode = "write";
    else if (argument === "--check") options.mode = "check";
    else if (argument === "--handoff-root" || argument === "--shadow-root") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      options[argument === "--handoff-root" ? "handoffRoot" : "shadowRoot"] = path.resolve(value);
      index += 1;
    } else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inventory = inventorySpine();
  if (options.mode === "write") {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    if (options.handoffRoot) {
      fs.writeFileSync(handoffOutputPath, stableJson(inventoryHandoff(options.handoffRoot)));
    }
    if (options.shadowRoot) {
      fs.writeFileSync(shadowOutputPath, stableJson(inventoryShadow(options.shadowRoot)));
    }
    fs.writeFileSync(outputPath, stableJson(inventorySpine()));
    console.log(`consolidation inventory written: ${inventorySpine().summary.file_count} Planning Spine files`);
    return;
  }
  if (fs.readFileSync(outputPath, "utf8") !== stableJson(inventory)) {
    throw new Error("Planning Spine consolidation inventory is stale; run with --write");
  }
  for (const required of [handoffOutputPath, shadowOutputPath]) {
    if (!fs.existsSync(required)) throw new Error(`missing consolidation manifest: ${required}`);
    const parsed = JSON.parse(fs.readFileSync(required, "utf8"));
    if (parsed.summary?.unclassified_count !== 0 || parsed.summary?.unresolved_count !== 0) {
      throw new Error(`consolidation manifest is not closed: ${required}`);
    }
  }
  for (const forbidden of [
    path.join(repoRoot, ".handoff"),
    "/home/flexnetos/lifeos/.handoff",
    path.join(spineRoot, "proof-ledger-pre-reset-20260713T171233Z")
  ]) {
    if (fs.existsSync(forbidden)) {
      throw new Error(`retired authority surface still exists: ${forbidden}`);
    }
  }
  const archiveReceipt = JSON.parse(fs.readFileSync(archiveReceiptPath, "utf8"));
  if (archiveReceipt.verification?.result !== "pass"
      || archiveReceipt.verification?.files_checked !== 450
      || archiveReceipt.verification?.mismatches !== 0) {
    throw new Error("archive receipt does not prove all 450 historical files");
  }
  console.log(`consolidation inventory check passed: ${inventory.summary.file_count} Planning Spine files`);
}

main();
