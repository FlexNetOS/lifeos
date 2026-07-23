import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const anchorDirectory = path.join(
  repoRoot,
  "planning-spine-v0",
  "1.0_VISION",
  "Architecture_Anchors"
);
const anchorPath = path.join(
  anchorDirectory,
  "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"
);
const immutableSourcePath =
  "/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md";
const sectionInventoryPath = path.join(anchorDirectory, "section_inventory.json");
const parentCrosswalkPath = path.join(anchorDirectory, "anchor_claim_task_crosswalk.csv");
const jsonOutputPath = path.join(anchorDirectory, "anchor_atomic_requirement_crosswalk.json");
const csvOutputPath = path.join(anchorDirectory, "anchor_atomic_requirement_crosswalk.csv");

const expectedAnchor = {
  id: "ARCHANCHOR-001",
  sha256: "78d8584d73957e795320d0ca9eb8e5593f1ab6286463e77b4537757dfef220ee",
  bytes: 977386,
  lines: 6347
};

const parentVerification = {
  "ANCHOR-REQ-001": [
    "PostgreSQL/RuVector migration and schema gates",
    "raw-byte and derived-representation parity",
    "all-data import and reconstruction drill"
  ],
  "ANCHOR-REQ-002": [
    "profile-owned yzx exact-argv PTY test",
    "ordered binary channel parity",
    "session detach, restart, and reconnect test"
  ],
  "ANCHOR-REQ-003": [
    "logical-hop order fixtures",
    "physical path-walk identity and witness continuity",
    "complete request/effect/response round trip"
  ],
  "ANCHOR-REQ-004": [
    "rtk_nu binary, invalid-UTF-8, interleave, signal, and parse-failure corpus",
    "JSONL, JSON, and Nuon envelope schema gates"
  ],
  "ANCHOR-REQ-005": [
    "CodeDB command inventory and typed signature test",
    "raw-object digest and canonical identity parity",
    "Nu child-plugin protocol integration"
  ],
  "ANCHOR-REQ-006": [
    "single writable redb owner denial test",
    "atomic mmap generation and checksum parity",
    "UDS ordering, crash, gap, replay, and spool recovery"
  ],
  "ANCHOR-REQ-007": [
    "envctl capability and negative direct-write tests",
    "idempotent drain/embed/commit/restart",
    "LSN, generation, and witness acknowledgement"
  ],
  "ANCHOR-REQ-008": [
    "component package and revision closure",
    "cognition/model/forecast evidence return",
    "database-gated promotion and rollback"
  ],
  "ANCHOR-REQ-009": [
    "COW isolation and branch lineage",
    "semantic/graph/MinCut analysis",
    "witnessed merge, approval, promotion, and exact rollback"
  ],
  "ANCHOR-REQ-010": [
    "synthetic secret lifecycle and custody-byte parity",
    "grant, lease, renewal, rotation, revocation, and denial audit",
    "negative plaintext and capability tests"
  ],
  "ANCHOR-REQ-011": [
    "GitKB integrity/fsck/verify/status/context/graph checks",
    "ICM continuity and topic hygiene",
    "repository index and executor evidence round trip"
  ],
  "ANCHOR-REQ-012": [
    "database-issued import/refactor/format/consolidate/upgrade/multi-merge jobs",
    "clean build and test effects",
    "zero-loss export and reconstruction"
  ],
  "ANCHOR-REQ-013": [
    "Nix clean-shell and package closure",
    "runner build/test/release manifest",
    "atomic activation, session reload, rejection, and rollback"
  ],
  "ANCHOR-REQ-014": [
    "WAL archive and replica consistency",
    "base backup and selected-LSN PITR",
    "byte/schema/vector/graph/witness/release reconstruction"
  ],
  "ANCHOR-REQ-015": [
    "immutable full-file digest and contiguous line coverage",
    "atomic requirement and component-table completeness",
    "parser, stale-projection, path-walk, and release-gate checks"
  ]
};

const componentRules = [
  [/(?:postgres|ruvector|sql|wal|pitr|replica|database)/i, ["PostgreSQL/RuVector", "lifeos"]],
  [/(?:lifeos|tauri|glass|xterm|pty|codex)/i, ["lifeos"]],
  [/(?:yazelix|zellij|helix|yazi|neovim|\byzx\b)/i, ["yazelix"]],
  [/(?:rtk_nu|\brtk\b)/i, ["rtk-tokenkill", "rtk_nu"]],
  [/(?:nu_plugin|codedb|nushell|nuon|messagepack)/i, ["nu_plugin/CodeDB"]],
  [/\bredb\b/i, ["redb owner and projection", "nu_plugin/CodeDB"]],
  [/\benvctl\b/i, ["envctl"]],
  [/(?:agentdb|rvf|ruvllm|sona|microlora|fastgrnn|ruflo|ruvltra|atas)/i, ["RuVector model and cognition fleet"]],
  [/(?:gitkb|\bgit\b|\bmeta\b|beads|\bbr\b|\bicm\b|weave|rusty-idd|network-control)/i, ["Meta coordination and knowledge fleet"]],
  [/(?:secret|vault|broker|mint|relay|credential|keyring)/i, ["FlexNetOS secret lifecycle"]],
  [/(?:nix|runner|release|activation|package|compiler|cuda|gpu)/i, ["yazelix", "meta release fleet"]]
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function lineCount(bytes) {
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines += 1;
  return lines;
}

function readVerifiedAnchor(filePath) {
  const bytes = fs.readFileSync(filePath);
  const actual = { sha256: sha256(bytes), bytes: bytes.length, lines: lineCount(bytes) };
  for (const field of ["sha256", "bytes", "lines"]) {
    if (actual[field] !== expectedAnchor[field]) {
      throw new Error(
        `${filePath} ${field} mismatch: expected ${expectedAnchor[field]}, got ${actual[field]}`
      );
    }
  }
  return bytes;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  if (quoted) throw new Error("unterminated quoted CSV field");
  return values;
}

function readParentCrosswalk() {
  const lines = fs.readFileSync(parentCrosswalkPath, "utf8").trimEnd().split("\n");
  const headers = parseCsvLine(lines.shift());
  return new Map(
    lines.map((line) => {
      const values = parseCsvLine(line);
      if (values.length !== headers.length) {
        throw new Error(`parent crosswalk column mismatch: ${line}`);
      }
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
      return [record.anchor_requirement_id, record];
    })
  );
}

function headingContext(stack) {
  return stack.filter(Boolean).map(({ level, title, line }) => ({ level, title, line }));
}

function isHeading(line) {
  return /^(#{1,6})\s+(.+)$/.exec(line);
}

function isFence(line) {
  return /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
}

function isListItem(line) {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

function isTableLine(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line) {
  if (!isTableLine(line)) return false;
  const cells = line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function optionalityTerms(text) {
  const terms = new Set();
  const patterns = [
    ["optional", /\boptional(?:ly)?\b/gi],
    ["alternative", /\balternative(?:s)?\b/gi],
    ["may", /\bmay\b/gi],
    ["can", /\bcan\b/gi],
    ["dry-run/apply", /\bdry[- ]run\b|\bapply\b/gi],
    ["permissions", /\bpermissions?\b/gi],
    ["network access", /\bnetwork access\b/gi],
    ["fan-out", /\bfan[- ]out\b/gi],
    ["worktree/direct", /\bworktree\b|\bdirect execution\b/gi]
  ];
  for (const [term, pattern] of patterns) if (pattern.test(text)) terms.add(term);
  return [...terms];
}

function classifyParents(text, headings) {
  const context = `${headings.map((heading) => heading.title).join(" / ")}\n${text}`;
  const parents = new Set(["ANCHOR-REQ-015"]);
  const add = (...ids) => ids.forEach((id) => parents.add(id));

  if (/(?:all data|every byte|raw bytes|primary runtime|bootstrap|operational phase)/i.test(context)) add("ANCHOR-REQ-001");
  if (/(?:glass|lifeos|tauri|xterm|pty|zellij session|terminal lifecycle|engine room)/i.test(context)) add("ANCHOR-REQ-002");
  if (/(?:physical pipeline|logical front-door|return path|round.trip|request|response|acknowledg)/i.test(context)) add("ANCHOR-REQ-003");
  if (/(?:rtk_nu|jsonl|nuon|invalid utf-8|raw-frame|pre-transform tee)/i.test(context)) add("ANCHOR-REQ-004");
  if (/(?:nu_plugin|codedb|ingest-envelope|messagepack|child-plugin|raw_object)/i.test(context)) add("ANCHOR-REQ-005");
  if (/(?:redb|mmap|unix-domain|local_seq|spool|live projection)/i.test(context)) add("ANCHOR-REQ-006");
  if (/(?:envctl|durable materialization|authoritative.*commit|commit lsn|projection manager)/i.test(context)) add("ANCHOR-REQ-007");
  if (/(?:agentdb|rvf|ruvllm|sona|microlora|fastgrnn|ruflo|ruvltra|atas|forecast|cognition)/i.test(context)) add("ANCHOR-REQ-008");
  if (/(?:copy-on-write|\bcow\b|mincut|semantic sql|promotion|witness chain|rollback)/i.test(context)) add("ANCHOR-REQ-009");
  if (/(?:secret|vault|broker|mint|relay|credential|plaintext|encrypted)/i.test(context)) add("ANCHOR-REQ-010");
  if (/(?:gitkb|\bmeta\b|beads|\bicm\b|weave|rusty-idd|runner|coordination)/i.test(context)) add("ANCHOR-REQ-011");
  if (/(?:import|transformation|export|reconstruct|refactor|format|consolidat|upgrade|multi-merge)/i.test(context)) add("ANCHOR-REQ-012");
  if (/(?:nix|build|release|activation|reload|package|clean shell)/i.test(context)) add("ANCHOR-REQ-013");
  if (/(?:wal|replication|base backup|pitr|restore|recovery)/i.test(context)) add("ANCHOR-REQ-014");
  return [...parents].sort();
}

function componentsFor(text, headings) {
  const context = `${headings.map((heading) => heading.title).join(" / ")}\n${text}`;
  const components = new Set();
  for (const [pattern, matches] of componentRules) {
    if (pattern.test(context)) matches.forEach((match) => components.add(match));
  }
  if (components.size === 0) components.add("FlexNetOS architecture fleet");
  return [...components].sort();
}

function parseUnits(lines) {
  const units = [];
  const headingStack = [];
  let lineIndex = 0;

  const addUnit = (kind, startIndex, endIndex, substantive, context = headingContext(headingStack)) => {
    const exactText = lines.slice(startIndex, endIndex + 1).join("\n");
    units.push({
      unit_id: `ARCHANCHOR-001-UNIT-${String(units.length + 1).padStart(4, "0")}`,
      kind,
      start_line: startIndex + 1,
      end_line: endIndex + 1,
      line_count: endIndex - startIndex + 1,
      sha256: sha256(Buffer.from(`${exactText}\n`)),
      exact_text: exactText,
      heading_path: context,
      substantive
    });
  };

  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line.trim() === "") {
      let end = lineIndex;
      while (end + 1 < lines.length && lines[end + 1].trim() === "") end += 1;
      addUnit("blank", lineIndex, end, false);
      lineIndex = end + 1;
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      const level = heading[1].length;
      headingStack.length = level - 1;
      headingStack[level - 1] = { level, title: heading[2], line: lineIndex + 1 };
      addUnit("heading", lineIndex, lineIndex, false, headingContext(headingStack));
      lineIndex += 1;
      continue;
    }

    const fence = isFence(line);
    if (fence) {
      const marker = fence[1];
      const closingPattern = new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`);
      let end = lineIndex + 1;
      while (end < lines.length && !closingPattern.test(lines[end])) end += 1;
      if (end >= lines.length) throw new Error(`unterminated code fence at line ${lineIndex + 1}`);
      addUnit("code_block", lineIndex, end, true);
      lineIndex = end + 1;
      continue;
    }

    if (isTableLine(line)) {
      const structural = isTableSeparator(line) || isTableSeparator(lines[lineIndex + 1] ?? "");
      addUnit(structural ? "table_structure" : "table_row", lineIndex, lineIndex, !structural);
      lineIndex += 1;
      continue;
    }

    if (isListItem(line)) {
      let end = lineIndex;
      while (end + 1 < lines.length) {
        const candidate = lines[end + 1];
        if (
          candidate.trim() === "" ||
          isHeading(candidate) ||
          isFence(candidate) ||
          isTableLine(candidate) ||
          isListItem(candidate)
        ) break;
        end += 1;
      }
      addUnit("list_item", lineIndex, end, true);
      lineIndex = end + 1;
      continue;
    }

    let end = lineIndex;
    while (end + 1 < lines.length) {
      const candidate = lines[end + 1];
      if (
        candidate.trim() === "" ||
        isHeading(candidate) ||
        isFence(candidate) ||
        isTableLine(candidate) ||
        isListItem(candidate)
      ) break;
      end += 1;
    }
    addUnit("paragraph", lineIndex, end, true);
    lineIndex = end + 1;
  }

  return units;
}

function splitSemicolon(value) {
  return value.split(";").map((item) => item.trim()).filter(Boolean);
}

function buildCrosswalk() {
  const repositoryBytes = readVerifiedAnchor(anchorPath);
  if (fs.existsSync(immutableSourcePath)) {
    const sourceBytes = readVerifiedAnchor(immutableSourcePath);
    if (!sourceBytes.equals(repositoryBytes)) {
      throw new Error("repository anchor is not byte-identical to the immutable owner source");
    }
  }

  const text = repositoryBytes.toString("utf8");
  if (Buffer.byteLength(text, "utf8") !== repositoryBytes.length) {
    throw new Error("anchor is not valid UTF-8");
  }
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const units = parseUnits(lines);
  const parents = readParentCrosswalk();
  const sections = JSON.parse(fs.readFileSync(sectionInventoryPath, "utf8"));
  const anchorSections = sections.anchors.find((anchor) => anchor.anchor_id === expectedAnchor.id);
  if (!anchorSections?.coverage?.complete || !anchorSections.coverage.contiguous) {
    throw new Error("section inventory does not prove complete contiguous anchor coverage");
  }

  let expectedStart = 1;
  for (const unit of units) {
    if (unit.start_line !== expectedStart) {
      throw new Error(`unit coverage gap at line ${expectedStart}`);
    }
    expectedStart = unit.end_line + 1;
  }
  if (expectedStart !== expectedAnchor.lines + 1) {
    throw new Error(`unit inventory ends at ${expectedStart - 1}, expected ${expectedAnchor.lines}`);
  }

  let requirementIndex = 0;
  const requirements = units.filter((unit) => unit.substantive).map((unit) => {
    requirementIndex += 1;
    const parentIds = classifyParents(unit.exact_text, unit.heading_path);
    const parentRecords = parentIds.map((id) => {
      const record = parents.get(id);
      if (!record) throw new Error(`missing parent requirement ${id}`);
      return record;
    });
    const terms = optionalityTerms(unit.exact_text);
    return {
      anchor_requirement_id: `ARCHANCHOR-001-ATOMIC-${String(requirementIndex).padStart(4, "0")}`,
      source_unit_id: unit.unit_id,
      source_path: immutableSourcePath,
      repository_copy: path.relative(repoRoot, anchorPath),
      start_line: unit.start_line,
      end_line: unit.end_line,
      line_count: unit.line_count,
      source_sha256: unit.sha256,
      source_kind: unit.kind,
      heading_path: unit.heading_path,
      exact_text: unit.exact_text,
      mandatory: true,
      owner_approved_tier_b_session_toggle: false,
      optionality_terms: terms,
      optional_or_alternative_language_treated_as_mandatory: terms.length > 0,
      parent_requirement_ids: parentIds,
      repositories_components: componentsFor(unit.exact_text, unit.heading_path),
      state: parentRecords.map((record) => record.implementation_state).filter((value, index, all) => all.indexOf(value) === index),
      task_ids: parentRecords.flatMap((record) => splitSemicolon(record.task_ids)).filter((value, index, all) => all.indexOf(value) === index),
      dependencies: parentIds,
      contracts: parentRecords.map((record) => record.canonical_authority).filter((value, index, all) => all.indexOf(value) === index),
      tests: parentIds.flatMap((id) => parentVerification[id] ?? []).filter((value, index, all) => all.indexOf(value) === index),
      proof_artifacts: [
        "planning-spine-v0/1.0_VISION/Architecture_Anchors/receipts.json",
        "planning-spine-v0/1.0_VISION/Architecture_Anchors/section_inventory.json",
        "planning-spine-v0/1.0_VISION/Architecture_Anchors/anchor_claim_task_crosswalk.csv"
      ],
      proof_state: parentRecords.map((record) => record.proof_state).filter((value, index, all) => all.indexOf(value) === index),
      conflict_ids: parentRecords.flatMap((record) => splitSemicolon(record.conflict_ids)).filter((value, index, all) => all.indexOf(value) === index),
      conflict_handling: parentRecords.map((record) => record.final_resolution).filter((value, index, all) => all.indexOf(value) === index),
      final_status: "in_progress"
    };
  });

  const integrationRows = requirements.filter(
    (requirement) =>
      requirement.source_kind === "table_row" &&
      requirement.heading_path.some((heading) => heading.title === "Complete component integration table")
  );
  if (integrationRows.length !== 548) {
    throw new Error(`component integration table row mismatch: expected 548, got ${integrationRows.length}`);
  }
  if (requirements.some((requirement) => !requirement.mandatory || requirement.parent_requirement_ids.length === 0)) {
    throw new Error("unclassified or non-mandatory atomic requirement detected");
  }

  return {
    schema_version: "lifeos-planning-spine.anchor-atomic-requirement-crosswalk.v1",
    authority_order: [
      "current owner instructions and applicable AGENTS.md, RULES.md, RTK, and repository contracts",
      "immutable architecture anchor",
      "owner-ratified decisions and maintained implementation contracts",
      "canonical task, claim, proof-ledger, and source records",
      "generated indexes, graphs, reports, and navigation artifacts as projections only"
    ],
    optionality_rule: "Every requirement, capability, extension, alternative, and optional item is mandatory. Only an explicitly owner-approved Tier-B session toggle may remain optional; no such approval is inferred by this projection.",
    anchor_receipt: {
      anchor_id: expectedAnchor.id,
      absolute_path: immutableSourcePath,
      repository_copy: path.relative(repoRoot, anchorPath),
      sha256: expectedAnchor.sha256,
      bytes: expectedAnchor.bytes,
      lines: expectedAnchor.lines,
      source_present_and_verified: true,
      repository_copy_verified: true,
      byte_identical: true,
      headings: anchorSections.sections.filter((section) => section.level > 0).map((section) => ({
        section_id: section.section_id,
        level: section.level,
        title: section.title,
        start_line: section.start_line,
        end_line: section.end_line,
        sha256: section.sha256
      })),
      contiguous_line_range_receipt: {
        first_line: 1,
        last_line: expectedAnchor.lines,
        complete: true,
        contiguous: true,
        unit_count: units.length,
        section_count: anchorSections.section_count
      }
    },
    summary: {
      units: units.length,
      substantive_requirements: requirements.length,
      component_integration_rows: integrationRows.length,
      optional_or_alternative_language_records: requirements.filter(
        (requirement) => requirement.optional_or_alternative_language_treated_as_mandatory
      ).length,
      unclassified_requirements: 0,
      non_mandatory_requirements: 0,
      final_status_counts: { in_progress: requirements.length }
    },
    units,
    requirements
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function csvField(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function crosswalkCsv(crosswalk) {
  const fields = [
    "anchor_requirement_id",
    "source_unit_id",
    "source_path",
    "start_line",
    "end_line",
    "source_sha256",
    "source_kind",
    "heading_path",
    "mandatory",
    "owner_approved_tier_b_session_toggle",
    "optionality_terms",
    "parent_requirement_ids",
    "repositories_components",
    "state",
    "task_ids",
    "dependencies",
    "contracts",
    "tests",
    "proof_artifacts",
    "proof_state",
    "conflict_ids",
    "conflict_handling",
    "final_status",
    "exact_text"
  ];
  const rows = crosswalk.requirements.map((requirement) => {
    const flattened = {
      ...requirement,
      heading_path: requirement.heading_path.map((heading) => `${heading.title} [${heading.line}]`)
    };
    return fields.map((field) => csvField(flattened[field])).join(",");
  });
  return `${fields.map(csvField).join(",")}\n${rows.join("\n")}\n`;
}

function parseArgs(argv) {
  if (argv.length !== 1 || !["--write", "--check"].includes(argv[0])) {
    throw new Error("usage: build-anchor-requirement-crosswalk.mjs --write|--check");
  }
  return argv[0];
}

function main() {
  const mode = parseArgs(process.argv.slice(2));
  const crosswalk = buildCrosswalk();
  const json = stableJson(crosswalk);
  const csv = crosswalkCsv(crosswalk);
  if (mode === "--write") {
    fs.writeFileSync(jsonOutputPath, json);
    fs.writeFileSync(csvOutputPath, csv);
  } else {
    if (!fs.existsSync(jsonOutputPath) || fs.readFileSync(jsonOutputPath, "utf8") !== json) {
      throw new Error("atomic anchor requirement JSON crosswalk is missing or stale");
    }
    if (!fs.existsSync(csvOutputPath) || fs.readFileSync(csvOutputPath, "utf8") !== csv) {
      throw new Error("atomic anchor requirement CSV crosswalk is missing or stale");
    }
  }
  console.log(
    `anchor atomic crosswalk ${mode.slice(2)} passed: ${crosswalk.summary.substantive_requirements} requirements, ${crosswalk.summary.component_integration_rows} integration rows, lines 1-${expectedAnchor.lines}`
  );
}

main();
