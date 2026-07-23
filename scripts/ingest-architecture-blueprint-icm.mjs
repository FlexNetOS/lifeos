import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(scriptDir, "..");
export const SOURCE_PATH = path.join(
  REPO_ROOT,
  "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"
);
export const INVENTORY_PATH = path.join(
  REPO_ROOT,
  "planning-spine-v0",
  "1.0_VISION",
  "Architecture_Anchors",
  "section_inventory.json"
);

export const SOURCE_ID = "ARCHANCHOR-001";
export const SOURCE_SHA256 =
  "78d8584d73957e795320d0ca9eb8e5593f1ab6286463e77b4537757dfef220ee";
export const SOURCE_BYTES = 977_386;
export const SOURCE_LINES = 6_347;
export const MEMOIR_NAME = "architecture-data-pipeline-ruvector";
export const TOPIC_PREFIX = MEMOIR_NAME;
export const MAX_RAW_CHUNK_BYTES = 8_192;
export const EXPECTED_EMBEDDING_DIMENSION = 1_152;
export const FAST_EMBEDDING_MODEL = "Xenova/all-MiniLM-L12-v2";
export const PRIMARY_EMBEDDING_MODEL =
  "jinaai/jina-embeddings-v2-base-code";

const RTK_BIN = "/home/flexnetos/.nix-profile/bin/rtk";
const ICM_BIN = "/home/flexnetos/.nix-profile/bin/icm";
function resolveProfilePsql() {
  const profileClient = "/home/flexnetos/.nix-profile/toolbin/psql";
  if (fs.existsSync(profileClient)) return profileClient;

  // A profile generation can retain a dangling toolbin link while its exact
  // combined PostgreSQL frontdoor remains installed. Accept only that
  // profile-owned derivation as a recovery path; never fall back to PATH.
  const candidates = fs.readdirSync("/nix/store")
    .filter((entry) =>
      entry.includes("flexnetos-foundation-postgresql-frontdoors-17.10-ruvector-0.3.0") &&
      !entry.endsWith(".drv")
    )
    .map((entry) => path.join("/nix/store", entry, "bin", "psql"))
    .filter((candidate) => fs.existsSync(candidate));
  if (candidates.length) return candidates.sort().at(-1);
  fail(
    "profile PostgreSQL front door is unavailable: expected " +
      `${profileClient} or one exact FlexNetOS PostgreSQL frontdoor derivation`
  );
}

const PSQL_BIN = resolveProfilePsql();
const ICM_CONFIG_PATH = "/home/flexnetos/.config/icm/config.toml";
const PG_SOCKET = "/home/flexnetos/meta/var/run/postgresql";
const PG_DATABASE = "icm";
const ICM_POSTGRES_URL = process.env.ICM_POSTGRES_URL ??
  `postgresql://${encodeURIComponent(process.env.USER ?? "flexnetos")}@/${PG_DATABASE}` +
  `?host=${encodeURIComponent(PG_SOCKET)}&application_name=lifeos_blueprint_ingestion`;
const MAX_PROCESS_BUFFER = 64 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 30 * 60 * 1_000;

const MEMOIR_DESCRIPTION =
  `Permanent, lossless concept map of ${SOURCE_ID}, the RuVector fully expanded ` +
  `architecture and data-pipeline blueprint. Generic memories preserve all ` +
  `${SOURCE_BYTES} source bytes in ordered raw chunks (SHA-256 ${SOURCE_SHA256}); ` +
  "concepts map every named Markdown section, and relations reproduce explicit " +
  "heading containment only.";

const RELATION_TYPES = new Set([
  "part-of",
  "depends-on",
  "related-to",
  "contradicts",
  "refines",
  "alternative-to",
  "caused-by",
  "instance-of",
  "superseded-by"
]);

const NAMED_COMPONENTS = [
  "AgentDB",
  "ATAS",
  "CodeDB",
  "Cognitum",
  "envctl",
  "FastGRNN",
  "GitKB",
  "GitNexus",
  "ICM",
  "MicroLoRA",
  "MinCut",
  "Nix",
  "nu_plugin",
  "Nushell",
  "OpenPencil",
  "PostgreSQL",
  "redb",
  "rtk",
  "rtk_nu",
  "Ruflo",
  "rUv",
  "RuVector",
  "RuvLTRA",
  "RVF",
  "SONA",
  "Tauri",
  "Vue",
  "witness-chain",
  "Yazelix",
  "Zellij"
];

const CRITICAL_TITLE_PATTERNS = [
  /hard execution rules/i,
  /operational invariants and acceptance/i
];

const HIGH_TITLE_PATTERNS = [
  /all-data/i,
  /authority/i,
  /byte/i,
  /canonical/i,
  /codedb/i,
  /envctl/i,
  /ingress/i,
  /postgresql/i,
  /redb/i,
  /release/i,
  /security/i,
  /source of truth/i
];

const RECALL_PROBES = [
  {
    id: "hard-rules",
    query: "HARD EXECUTION RULES EVERYTHING means EVERYTHING every byte"
  },
  {
    id: "postgresql-ruvector",
    query:
      "PostgreSQL RuVector canonical durable macro-state Swarm Primary Runtime"
  },
  {
    id: "redb",
    query:
      "redb transient shared low-latency state plane mmap projection ordered wakeup"
  },
  {
    id: "envctl",
    query:
      "envctl sole authoritative PostgreSQL RuVector ingress committer security boundary"
  },
  {
    id: "codedb",
    query:
      "nu_plugin CodeDB byte-complete ingress raw bytes hashes manifests pointers"
  },
  {
    id: "release-gate",
    query:
      "database-gated envctl-activated release zero undeclared loss release gate"
  }
];

function fail(message) {
  throw new Error(message);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function countLines(buffer) {
  let total = 0;
  for (const byte of buffer) {
    if (byte === 0x0a) total += 1;
  }
  return total;
}

function splitLinesPreservingEndings(text) {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

export function normalizeSearchText(raw) {
  return raw
    .normalize("NFC")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n");
}

function slugTokens(value) {
  return (
    value
      .normalize("NFKD")
      .toLowerCase()
      .match(/[\p{L}\p{N}_-]{2,}/gu) ?? []
  ).map((token) => token.replace(/^-+|-+$/g, ""));
}

function sectionTopic(section) {
  return `${TOPIC_PREFIX}:${section.section_id.toLowerCase()}`;
}

function sectionImportance(section) {
  if (CRITICAL_TITLE_PATTERNS.some((pattern) => pattern.test(section.title))) {
    return "critical";
  }
  if (HIGH_TITLE_PATTERNS.some((pattern) => pattern.test(section.title))) {
    return "high";
  }
  return "medium";
}

function sectionKeywords(section, raw, headingPath) {
  const searchable = `${section.title}\n${headingPath.join("\n")}\n${raw}`;
  const keywords = new Set([
    "architecture-blueprint",
    "ruvector",
    SOURCE_ID.toLowerCase(),
    section.section_id.toLowerCase(),
    ...slugTokens(section.title),
    ...headingPath.flatMap(slugTokens)
  ]);
  for (const component of NAMED_COMPONENTS) {
    if (searchable.toLowerCase().includes(component.toLowerCase())) {
      keywords.add(component.toLowerCase());
    }
  }
  return [...keywords].filter(Boolean).sort();
}

function memorySummary(logicalId, metadata, searchableText) {
  return [
    `ICM-BLUEPRINT-ID: ${logicalId}`,
    `Source: ${SOURCE_ID}`,
    ...Object.entries(metadata).map(([key, value]) => `${key}: ${value}`),
    "",
    "Searchable text:",
    searchableText
  ].join("\n");
}

function logicalIdFromSummary(summary) {
  const match = /^ICM-BLUEPRINT-ID: ([^\n]+)$/m.exec(summary);
  return match?.[1] ?? null;
}

function exactSource(sourcePath = SOURCE_PATH) {
  const bytes = fs.readFileSync(sourcePath);
  const actual = {
    sha256: sha256(bytes),
    bytes: bytes.length,
    lines: countLines(bytes)
  };
  const expected = {
    sha256: SOURCE_SHA256,
    bytes: SOURCE_BYTES,
    lines: SOURCE_LINES
  };
  for (const field of Object.keys(expected)) {
    if (actual[field] !== expected[field]) {
      fail(
        `${SOURCE_ID} ${field} mismatch: expected ${expected[field]}, got ${actual[field]}`
      );
    }
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    fail(`${SOURCE_ID} is not exact round-trippable UTF-8`);
  }
  return { bytes, text };
}

function exactInventory(inventoryPath = INVENTORY_PATH) {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  const anchor = inventory.anchors?.find(
    (candidate) => candidate.anchor_id === SOURCE_ID
  );
  if (!anchor) fail(`${SOURCE_ID} is absent from ${inventoryPath}`);
  if (
    anchor.total_lines !== SOURCE_LINES ||
    anchor.coverage?.first_line !== 1 ||
    anchor.coverage?.last_line !== SOURCE_LINES ||
    anchor.coverage?.contiguous !== true ||
    anchor.coverage?.complete !== true
  ) {
    fail(`${SOURCE_ID} committed section inventory is not complete and contiguous`);
  }
  return anchor;
}

function lineOffsets(lines) {
  const offsets = [0];
  for (const line of lines) {
    offsets.push(offsets.at(-1) + Buffer.byteLength(line, "utf8"));
  }
  return offsets;
}

function headingPaths(sections) {
  const stack = [];
  const paths = new Map();
  for (const section of sections) {
    if (section.level === 0) {
      paths.set(section.section_id, []);
      continue;
    }
    while (stack.length && stack.at(-1).level >= section.level) stack.pop();
    const pathTitles = [...stack.map((item) => item.title), section.title];
    paths.set(section.section_id, pathTitles);
    stack.push(section);
  }
  return paths;
}

function buildChunks(section, sectionLines, offsets, headingPath) {
  const chunks = [];
  let chunkLines = [];
  let chunkBytes = 0;
  let chunkStartLine = section.start_line;

  const flush = () => {
    if (!chunkLines.length) return;
    const raw = chunkLines.join("");
    const index = chunks.length + 1;
    const endLine = chunkStartLine + chunkLines.length - 1;
    const logicalId = `${section.section_id}-CHUNK-${String(index).padStart(
      3,
      "0"
    )}`;
    const byteStart = offsets[chunkStartLine - 1] + 1;
    const byteEnd = offsets[endLine];
    const importance = sectionImportance(section);
    const keywords = sectionKeywords(section, raw, headingPath);
    chunks.push({
      kind: "chunk",
      logicalId,
      topic: sectionTopic(section),
      summary: memorySummary(
        logicalId,
        {
          "Section ID": section.section_id,
          Heading: section.title,
          "Heading path": headingPath.join(" > ") || "Preamble",
          Lines: `${chunkStartLine}-${endLine}`,
          Bytes: `${byteStart}-${byteEnd}`,
          "Raw SHA-256": sha256(Buffer.from(raw, "utf8"))
        },
        normalizeSearchText(raw)
      ),
      raw,
      keywords,
      importance,
      sectionId: section.section_id,
      startLine: chunkStartLine,
      endLine,
      byteStart,
      byteEnd,
      rawSha256: sha256(Buffer.from(raw, "utf8"))
    });
    chunkLines = [];
    chunkBytes = 0;
    chunkStartLine = endLine + 1;
  };

  for (const line of sectionLines) {
    const bytes = Buffer.byteLength(line, "utf8");
    if (bytes > MAX_RAW_CHUNK_BYTES) {
      fail(
        `${section.section_id} contains a ${bytes}-byte line exceeding the ` +
          `${MAX_RAW_CHUNK_BYTES}-byte raw chunk bound`
      );
    }
    if (chunkLines.length && chunkBytes + bytes > MAX_RAW_CHUNK_BYTES) flush();
    chunkLines.push(line);
    chunkBytes += bytes;
  }
  flush();
  return chunks;
}

function buildRelations(sections) {
  const relations = [];
  const stack = [];
  for (const section of sections.filter((candidate) => candidate.level > 0)) {
    while (stack.length && stack.at(-1).level >= section.level) stack.pop();
    if (stack.length) {
      const parent = stack.at(-1);
      relations.push({
        from: `${section.section_id} — ${section.title}`,
        to: `${parent.section_id} — ${parent.title}`,
        relation: "part-of",
        evidence: {
          basis: "Markdown heading containment",
          child_section_id: section.section_id,
          child_heading: section.title,
          child_heading_level: section.level,
          child_source_line: section.start_line,
          parent_section_id: parent.section_id,
          parent_heading: parent.title,
          parent_heading_level: parent.level,
          parent_source_line: parent.start_line
        }
      });
    } else if (section.level !== 1) {
      fail(
        `${section.section_id} level-${section.level} heading has no explicit ancestor`
      );
    }
    stack.push(section);
  }
  return relations;
}

function conceptDefinition(section, headingPath, raw) {
  const excerpt = normalizeSearchText(raw).slice(0, 1_200);
  return [
    `Named Markdown section ${section.section_id} in ${SOURCE_ID}.`,
    `Heading level: ${section.level}.`,
    `Heading path: ${headingPath.join(" > ")}.`,
    `Exact source lines: ${section.start_line}-${section.end_line}.`,
    `Section SHA-256: ${section.sha256}.`,
    `Associated generic-memory topic: ${sectionTopic(section)}.`,
    `Searchable definition: ${excerpt}`
  ].join(" ");
}

function buildManifestMemory(chunks, sections) {
  const logicalId = `${SOURCE_ID}-MANIFEST`;
  const manifest = {
    source_id: SOURCE_ID,
    source_sha256: SOURCE_SHA256,
    source_bytes: SOURCE_BYTES,
    source_lines: SOURCE_LINES,
    section_count: sections.length,
    named_section_count: sections.filter((section) => section.level > 0).length,
    chunk_count: chunks.length,
    max_raw_chunk_bytes: MAX_RAW_CHUNK_BYTES,
    ordered_chunks: chunks.map((chunk) => ({
      id: chunk.logicalId,
      topic: chunk.topic,
      section_id: chunk.sectionId,
      lines: [chunk.startLine, chunk.endLine],
      bytes: [chunk.byteStart, chunk.byteEnd],
      raw_sha256: chunk.rawSha256
    }))
  };
  return {
    kind: "manifest",
    logicalId,
    topic: `${TOPIC_PREFIX}:manifest`,
    summary: memorySummary(
      logicalId,
      {
        "Source SHA-256": SOURCE_SHA256,
        "Source bytes": SOURCE_BYTES,
        "Source lines": SOURCE_LINES
      },
      JSON.stringify(manifest)
    ),
    raw: null,
    keywords: [
      "architecture-blueprint",
      "chunk-manifest",
      "exact-bytes",
      "lossless",
      "ruvector",
      SOURCE_ID.toLowerCase()
    ].sort(),
    importance: "critical"
  };
}

function buildRelationEvidenceMemory(relations) {
  const logicalId = `${SOURCE_ID}-RELATION-EVIDENCE`;
  const evidence = {
    source_id: SOURCE_ID,
    source_sha256: SOURCE_SHA256,
    allowed_relation_types: [...RELATION_TYPES].sort(),
    emitted_relation_types: [...new Set(relations.map((item) => item.relation))],
    relation_count: relations.length,
    rule:
      "Only source-evidenced relations are emitted; Markdown heading containment supports child part-of parent.",
    relations
  };
  return {
    kind: "relation-evidence",
    logicalId,
    topic: `${TOPIC_PREFIX}:relation-evidence`,
    summary: memorySummary(
      logicalId,
      {
        "Source SHA-256": SOURCE_SHA256,
        "Relation count": relations.length,
        "Evidence rule": "explicit Markdown heading containment only"
      },
      JSON.stringify(evidence)
    ),
    raw: null,
    keywords: [
      "architecture-blueprint",
      "evidence-backed",
      "heading-containment",
      "part-of",
      "relation-ledger",
      SOURCE_ID.toLowerCase()
    ].sort(),
    importance: "critical"
  };
}

export function buildIngestionPlan({
  sourcePath = SOURCE_PATH,
  inventoryPath = INVENTORY_PATH
} = {}) {
  const source = exactSource(sourcePath);
  const inventory = exactInventory(inventoryPath);
  const lines = splitLinesPreservingEndings(source.text);
  if (lines.length !== SOURCE_LINES) {
    fail(`expected ${SOURCE_LINES} preserved lines, got ${lines.length}`);
  }
  const offsets = lineOffsets(lines);
  const paths = headingPaths(inventory.sections);
  const chunks = [];

  let expectedStartLine = 1;
  for (const section of inventory.sections) {
    if (section.start_line !== expectedStartLine) {
      fail(
        `${section.section_id} starts at ${section.start_line}; expected ${expectedStartLine}`
      );
    }
    const sectionLines = lines.slice(section.start_line - 1, section.end_line);
    const sectionRaw = sectionLines.join("");
    const sectionHash = sha256(Buffer.from(sectionRaw, "utf8"));
    if (
      sectionHash !== section.sha256 ||
      sectionLines.length !== section.line_count
    ) {
      fail(`${section.section_id} digest or line-count mismatch`);
    }
    chunks.push(
      ...buildChunks(
        section,
        sectionLines,
        offsets,
        paths.get(section.section_id)
      )
    );
    expectedStartLine = section.end_line + 1;
  }
  if (expectedStartLine !== SOURCE_LINES + 1) {
    fail(`section coverage ended at line ${expectedStartLine - 1}`);
  }

  const reconstructed = Buffer.from(
    chunks.map((chunk) => chunk.raw).join(""),
    "utf8"
  );
  if (!reconstructed.equals(source.bytes)) {
    fail("ordered raw chunks do not reconstruct the exact source bytes");
  }

  const namedSections = inventory.sections.filter(
    (section) => section.level > 0
  );
  const concepts = namedSections.map((section) => {
    const topic = sectionTopic(section);
    const importance = sectionImportance(section);
    return {
      name: `${section.section_id} — ${section.title}`,
      definition: conceptDefinition(
        section,
        paths.get(section.section_id),
        lines.slice(section.start_line - 1, section.end_line).join("")
      ),
      labels: [
        `blueprint:${MEMOIR_NAME}`,
        `importance:${importance}`,
        `level:${section.level}`,
        `section:${section.section_id.toLowerCase()}`,
        `source:${SOURCE_ID.toLowerCase()}`,
        `topic:${topic}`
      ].sort(),
      sectionId: section.section_id,
      topic,
      importance
    };
  });
  const relations = buildRelations(inventory.sections);
  for (const relation of relations) {
    if (!RELATION_TYPES.has(relation.relation)) {
      fail(`unsupported relation type: ${relation.relation}`);
    }
  }

  const memories = [
    ...chunks,
    buildManifestMemory(chunks, inventory.sections),
    buildRelationEvidenceMemory(relations)
  ];
  if (new Set(memories.map((memory) => memory.logicalId)).size !== memories.length) {
    fail("logical memory identifiers are not unique");
  }

  return {
    source: {
      id: SOURCE_ID,
      path: sourcePath,
      sha256: SOURCE_SHA256,
      bytes: SOURCE_BYTES,
      lines: SOURCE_LINES
    },
    sectionCount: inventory.sections.length,
    namedSectionCount: namedSections.length,
    chunks,
    memories,
    concepts,
    relations,
    memoir: {
      name: MEMOIR_NAME,
      description: MEMOIR_DESCRIPTION
    }
  };
}

function normalizedKeywords(keywords) {
  return [...keywords].sort();
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

export function reconcileMemories(expectedMemories, actualMemories) {
  const expectedById = new Map(
    expectedMemories.map((memory) => [memory.logicalId, memory])
  );
  const actualById = new Map();
  const unexpected = [];
  const drift = [];

  for (const memory of actualMemories) {
    const logicalId = logicalIdFromSummary(memory.summary);
    if (!logicalId || actualById.has(logicalId)) {
      unexpected.push(logicalId ?? `<unmarked:${memory.id}>`);
      continue;
    }
    actualById.set(logicalId, memory);
    const expected = expectedById.get(logicalId);
    if (!expected) {
      unexpected.push(logicalId);
      continue;
    }
    const fields = {
      topic: [expected.topic, memory.topic],
      summary: [expected.summary, memory.summary],
      raw: [expected.raw, memory.raw],
      importance: [expected.importance, memory.importance],
      keywords: [
        normalizedKeywords(expected.keywords),
        normalizedKeywords(memory.keywords ?? [])
      ]
    };
    for (const [field, [wanted, observed]] of Object.entries(fields)) {
      if (!sameJson(wanted, observed)) drift.push(`${logicalId}.${field}`);
    }
  }

  const missing = expectedMemories.filter(
    (memory) => !actualById.has(memory.logicalId)
  );
  return { missing, unexpected: [...new Set(unexpected)].sort(), drift };
}

function relationKey(relation) {
  return `${relation.from}\u0000${relation.relation.replaceAll("_", "-")}\u0000${relation.to}`;
}

export function reconcileGraph(plan, graph) {
  if (!graph) {
    return {
      memoirMissing: true,
      missingConcepts: plan.concepts,
      missingRelations: plan.relations,
      unexpectedConcepts: [],
      unexpectedRelations: [],
      drift: []
    };
  }
  const drift = [];
  if (graph.memoir?.description !== plan.memoir.description) {
    drift.push("memoir.description");
  }

  const expectedConcepts = new Map(
    plan.concepts.map((concept) => [concept.name, concept])
  );
  const actualConcepts = new Map(
    (graph.concepts ?? []).map((concept) => [concept.name, concept])
  );
  const unexpectedConcepts = [...actualConcepts.keys()].filter(
    (name) => !expectedConcepts.has(name)
  );
  const missingConcepts = plan.concepts.filter(
    (concept) => !actualConcepts.has(concept.name)
  );
  for (const [name, expected] of expectedConcepts) {
    const actual = actualConcepts.get(name);
    if (!actual) continue;
    if (actual.definition !== expected.definition) {
      drift.push(`concept:${name}.definition`);
    }
    if (
      !sameJson(
        normalizedKeywords(expected.labels),
        normalizedKeywords(actual.labels ?? [])
      )
    ) {
      drift.push(`concept:${name}.labels`);
    }
  }

  const expectedRelations = new Map(
    plan.relations.map((relation) => [relationKey(relation), relation])
  );
  const actualRelations = new Map(
    (graph.links ?? []).map((link) => [
      relationKey({
        from: link.source,
        to: link.target,
        relation: link.relation
      }),
      link
    ])
  );
  const unexpectedRelations = [...actualRelations.keys()].filter(
    (key) => !expectedRelations.has(key)
  );
  const missingRelations = plan.relations.filter(
    (relation) => !actualRelations.has(relationKey(relation))
  );

  return {
    memoirMissing: false,
    missingConcepts,
    missingRelations,
    unexpectedConcepts,
    unexpectedRelations,
    drift
  };
}

function parseArgs(argv) {
  const options = {
    batchSize: 32,
    dryRun: false,
    forceEmbed: false,
    skipEmbed: false,
    skipRecall: false,
    verifyOnly: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--batch-size") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 512) {
        fail("--batch-size must be an integer from 1 through 512");
      }
      options.batchSize = value;
      index += 1;
    } else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--force-embed") options.forceEmbed = true;
    else if (argument === "--skip-embed") options.skipEmbed = true;
    else if (argument === "--skip-recall") options.skipRecall = true;
    else if (argument === "--verify-only") options.verifyOnly = true;
    else fail(`unknown argument: ${argument}`);
  }
  if (options.dryRun && options.verifyOnly) {
    fail("--dry-run and --verify-only are mutually exclusive");
  }
  if (options.forceEmbed && options.skipEmbed) {
    fail("--force-embed and --skip-embed are mutually exclusive");
  }
  return options;
}

function runRtk(command, args, { timeout = PROCESS_TIMEOUT_MS } = {}) {
  const result = spawnSync(RTK_BIN, ["proxy", command, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ICM_DB_BACKEND: "postgres",
      ICM_POSTGRES_URL,
      NO_COLOR: "1"
    },
    maxBuffer: MAX_PROCESS_BUFFER,
    timeout
  });
  if (result.error) {
    fail(`${path.basename(command)} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `${path.basename(command)} exited ${result.status}\n` +
        `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
    );
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function runIcm(args, options = {}) {
  const finalArgs = [...args];
  if (options.readOnly && !finalArgs.includes("--read-only")) {
    finalArgs.push("--read-only");
  }
  return runRtk(ICM_BIN, finalArgs, {
    timeout: options.timeout
  });
}

function runPsql(sql) {
  return runRtk(PSQL_BIN, [
    "-X",
    "--no-psqlrc",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    PG_SOCKET,
    "-d",
    PG_DATABASE,
    "-qAt",
    "-c",
    sql
  ]).stdout.trim();
}

function runPsqlJson(sql) {
  const output = runPsql(sql);
  if (!output) fail("PostgreSQL query returned no JSON");
  return JSON.parse(output);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseEmbeddingConfig() {
  const realPath = fs.realpathSync(ICM_CONFIG_PATH);
  if (
    !realPath.startsWith("/home/flexnetos/meta/src/envctl/") &&
    !realPath.startsWith("/nix/store/")
  ) {
    fail(`ICM config is not profile/envctl-owned: ${realPath}`);
  }
  const text = fs.readFileSync(ICM_CONFIG_PATH, "utf8");
  const lines = text.split("\n");
  const sectionStart = lines.findIndex(
    (line) => line.trim() === "[embeddings]"
  );
  if (sectionStart === -1) {
    fail(`${ICM_CONFIG_PATH} has no [embeddings] section`);
  }
  const tail = lines.slice(sectionStart + 1);
  const nextSection = tail.findIndex((line) =>
    line.trim().startsWith("[")
  );
  const section = (nextSection === -1 ? tail : tail.slice(0, nextSection)).join(
    "\n"
  );
  const value = (key) => {
    const match = new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m").exec(section);
    return match?.[1] ?? null;
  };
  const config = {
    path: realPath,
    primaryModel: value("model"),
    fastModel: value("fast_model")
  };
  if (
    config.primaryModel !== PRIMARY_EMBEDDING_MODEL ||
    config.fastModel !== FAST_EMBEDDING_MODEL
  ) {
    fail(
      "active ICM cascade mismatch: expected " +
        `${FAST_EMBEDDING_MODEL} + ${PRIMARY_EMBEDDING_MODEL}, got ` +
        `${config.fastModel} + ${config.primaryModel}`
    );
  }
  return config;
}

function preflightDatabase() {
  const receipt = runPsqlJson(`
    SELECT json_build_object(
      'embedding_type', (
        SELECT format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'memories'::regclass
          AND attribute.attname = 'embedding'
          AND NOT attribute.attisdropped
      ),
      'embedding_dims_metadata', (
        SELECT value FROM icm_metadata WHERE key = 'embedding_dims'
      ),
      'memoirs_table', to_regclass('public.memoirs') IS NOT NULL,
      'concepts_table', to_regclass('public.concepts') IS NOT NULL,
      'concept_links_table', to_regclass('public.concept_links') IS NOT NULL,
      'wrong_existing_dimensions', (
        SELECT count(*) FROM memories
        WHERE embedding IS NOT NULL
          AND vector_dims(embedding) <> ${EXPECTED_EMBEDDING_DIMENSION}
      )
    )`);
  if (
    receipt.embedding_type !== `vector(${EXPECTED_EMBEDDING_DIMENSION})` ||
    Number(receipt.embedding_dims_metadata) !== EXPECTED_EMBEDDING_DIMENSION ||
    !receipt.memoirs_table ||
    !receipt.concepts_table ||
    !receipt.concept_links_table ||
    Number(receipt.wrong_existing_dimensions) !== 0
  ) {
    fail(`production PostgreSQL ICM preflight failed: ${JSON.stringify(receipt)}`);
  }
  return receipt;
}

function readImportMemories() {
  return runPsqlJson(`
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', id,
          'topic', topic,
          'summary', summary,
          'raw', raw_excerpt,
          'keywords', COALESCE(keywords, '[]')::json,
          'importance', importance,
          'embedding_dim', CASE
            WHEN embedding IS NULL THEN NULL
            ELSE vector_dims(embedding)
          END
        )
        ORDER BY topic, summary
      ),
      '[]'::json
    )
    FROM memories
    WHERE topic LIKE ${sqlLiteral(`${TOPIC_PREFIX}:%`)}`);
}

function memoirExists() {
  return Number(
    runPsql(`
      SELECT count(*) FROM memoirs WHERE name = ${sqlLiteral(MEMOIR_NAME)}`)
  );
}

function readGraph({ readOnly = false } = {}) {
  if (memoirExists() === 0) return null;
  const output = runIcm(
    [
      "memoir",
      "export",
      "--memoir",
      MEMOIR_NAME,
      "--format",
      "json",
      "--no-embeddings"
    ],
    { readOnly }
  ).stdout;
  return JSON.parse(output);
}

function assertNoDrift(memoryState, graphState) {
  const problems = [
    ...memoryState.unexpected.map((item) => `unexpected memory ${item}`),
    ...memoryState.drift.map((item) => `memory drift ${item}`),
    ...graphState.unexpectedConcepts.map(
      (item) => `unexpected concept ${item}`
    ),
    ...graphState.unexpectedRelations.map(
      (item) => `unexpected relation ${JSON.stringify(item)}`
    ),
    ...graphState.drift.map((item) => `graph drift ${item}`)
  ];
  if (problems.length) {
    fail(`idempotence guard refused divergent state:\n${problems.join("\n")}`);
  }
}

export function storeMemoryArgs(memory) {
  const args = [
    "store",
    "--topic",
    memory.topic,
    "--content",
    memory.summary,
    "--importance",
    memory.importance,
    "--keywords",
    memory.keywords.join(","),
    "--no-embeddings"
  ];
  if (memory.raw !== null) args.push(`--raw=${memory.raw}`);
  return args;
}

function storeMemory(memory) {
  runIcm(storeMemoryArgs(memory));
}

function addConcept(concept) {
  runIcm([
    "memoir",
    "add-concept",
    "--memoir",
    MEMOIR_NAME,
    "--name",
    concept.name,
    "--definition",
    concept.definition,
    "--labels",
    concept.labels.join(","),
    "--no-embeddings"
  ]);
}

function addRelation(relation) {
  runIcm([
    "memoir",
    "link",
    "--memoir",
    MEMOIR_NAME,
    "--from",
    relation.from,
    "--to",
    relation.to,
    "--relation",
    relation.relation,
    "--no-embeddings"
  ]);
}

function embedFingerprint() {
  const payload = {
    dimension: EXPECTED_EMBEDDING_DIMENSION,
    fast_model: FAST_EMBEDDING_MODEL,
    normalization: "per-model-l2-before-concatenation",
    order: ["fast_model", "primary_model"],
    primary_model: PRIMARY_EMBEDDING_MODEL,
    source_sha256: SOURCE_SHA256
  };
  return { payload, sha256: sha256(stableJson(payload)) };
}

function readFingerprintMetadata() {
  return runPsqlJson(`
    SELECT COALESCE(
      json_object_agg(key, value),
      '{}'::json
    )
    FROM icm_metadata
    WHERE key LIKE ${sqlLiteral(`${MEMOIR_NAME}.%`)}`);
}

function blueprintTopics(plan) {
  return Array.from(new Set(plan.memories.map((memory) => memory.topic))).sort();
}

function embedBlueprintTopics(topics, options) {
  const uniqueTopics = [...new Set(topics.filter(Boolean))];
  const force = options.force || options.forceEmbed;
  for (const topic of uniqueTopics) {
    const args = [
      "embed",
      "--topic",
      topic,
      "--batch-size",
      String(options.batchSize)
    ];
    if (force) args.push("--force");
    runIcm(args);
  }
}

export function verifyCascadeSegments(rows, tolerance = 0.0005) {
  const fastNorms = [];
  const primaryNorms = [];
  const norm = (values) =>
    Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

  for (const row of rows) {
    const vector =
      typeof row.embedding === "string"
        ? JSON.parse(row.embedding)
        : row.embedding;
    if (
      !Array.isArray(vector) ||
      vector.length !== EXPECTED_EMBEDDING_DIMENSION
    ) {
      fail(
        `${row.logical_id} embedding does not contain ` +
          `${EXPECTED_EMBEDDING_DIMENSION} values`
      );
    }
    const fastNorm = norm(vector.slice(0, 384));
    const primaryNorm = norm(vector.slice(384));
    if (
      Math.abs(fastNorm - 1) > tolerance ||
      Math.abs(primaryNorm - 1) > tolerance
    ) {
      fail(
        `${row.logical_id} cascade segment norms are not unit length: ` +
          `fast=${fastNorm}, primary=${primaryNorm}`
      );
    }
    fastNorms.push(fastNorm);
    primaryNorms.push(primaryNorm);
  }
  if (!rows.length) fail("no cascade embeddings were available to verify");

  return {
    verified_vectors: rows.length,
    tolerance,
    fast_384d_norm: {
      min: Math.min(...fastNorms),
      max: Math.max(...fastNorms)
    },
    primary_768d_norm: {
      min: Math.min(...primaryNorms),
      max: Math.max(...primaryNorms)
    }
  };
}

function verifyExactState(plan, memories, graph) {
  const state = reconcileMemories(plan.memories, memories);
  if (state.missing.length || state.unexpected.length || state.drift.length) {
    fail(
      `generic memory verification failed: ${JSON.stringify({
        missing: state.missing.map((item) => item.logicalId),
        unexpected: state.unexpected,
        drift: state.drift
      })}`
    );
  }
  const graphState = reconcileGraph(plan, graph);
  if (
    graphState.memoirMissing ||
    graphState.missingConcepts.length ||
    graphState.missingRelations.length ||
    graphState.unexpectedConcepts.length ||
    graphState.unexpectedRelations.length ||
    graphState.drift.length
  ) {
    fail(`memoir graph verification failed: ${JSON.stringify(graphState)}`);
  }

  const actualById = new Map(
    memories.map((memory) => [logicalIdFromSummary(memory.summary), memory])
  );
  const rawChunks = plan.chunks.map((chunk) => {
    const actual = actualById.get(chunk.logicalId);
    if (!actual || actual.raw === null) {
      fail(`${chunk.logicalId} has no stored raw excerpt`);
    }
    if (Buffer.byteLength(actual.raw, "utf8") > MAX_RAW_CHUNK_BYTES) {
      fail(`${chunk.logicalId} exceeds the raw chunk byte bound`);
    }
    if (sha256(Buffer.from(actual.raw, "utf8")) !== chunk.rawSha256) {
      fail(`${chunk.logicalId} stored raw hash mismatch`);
    }
    return actual.raw;
  });
  const reconstructed = Buffer.from(rawChunks.join(""), "utf8");
  if (
    reconstructed.length !== SOURCE_BYTES ||
    countLines(reconstructed) !== SOURCE_LINES ||
    sha256(reconstructed) !== SOURCE_SHA256
  ) {
    fail("stored raw chunks do not reconstruct the complete source");
  }

  const conceptNames = new Set(graph.concepts.map((concept) => concept.name));
  for (const link of graph.links) {
    if (!conceptNames.has(link.source) || !conceptNames.has(link.target)) {
      fail(`relation target is absent: ${link.source} -> ${link.target}`);
    }
    const normalized = link.relation.replaceAll("_", "-");
    if (!RELATION_TYPES.has(normalized)) {
      fail(`exported unsupported relation: ${link.relation}`);
    }
    if (
      !plan.relations.some(
        (relation) =>
          relation.from === link.source &&
          relation.to === link.target &&
          relation.relation === normalized &&
          relation.evidence.basis === "Markdown heading containment"
      )
    ) {
      fail(`relation lacks source evidence: ${link.source} -> ${link.target}`);
    }
  }

  const dbConsistency = runPsqlJson(`
    SELECT json_build_object(
      'duplicate_memory_logical_ids', (
        SELECT count(*) FROM (
          SELECT substring(summary FROM 'ICM-BLUEPRINT-ID: ([^' || chr(10) || ']+)') AS logical_id
          FROM memories
          WHERE topic LIKE ${sqlLiteral(`${TOPIC_PREFIX}:%`)}
          GROUP BY 1 HAVING count(*) > 1
        ) AS duplicates
      ),
      'memoir_count', (
        SELECT count(*) FROM memoirs WHERE name = ${sqlLiteral(MEMOIR_NAME)}
      ),
      'orphan_concepts', (
        SELECT count(*) FROM concepts AS concept
        LEFT JOIN memoirs AS memoir ON memoir.id = concept.memoir_id
        WHERE memoir.id IS NULL
      ),
      'orphan_links', (
        SELECT count(*) FROM concept_links AS link
        LEFT JOIN concepts AS source ON source.id = link.source_id
        LEFT JOIN concepts AS target ON target.id = link.target_id
        WHERE source.id IS NULL OR target.id IS NULL
      ),
      'import_memory_count', (
        SELECT count(*) FROM memories
        WHERE topic LIKE ${sqlLiteral(`${TOPIC_PREFIX}:%`)}
      ),
      'import_embedded_count', (
        SELECT count(*) FROM memories
        WHERE topic LIKE ${sqlLiteral(`${TOPIC_PREFIX}:%`)}
          AND embedding IS NOT NULL
          AND vector_dims(embedding) = ${EXPECTED_EMBEDDING_DIMENSION}
      )
    )`);
  const expectedMemoryCount = plan.memories.length;
  if (
    Number(dbConsistency.duplicate_memory_logical_ids) !== 0 ||
    Number(dbConsistency.memoir_count) !== 1 ||
    Number(dbConsistency.orphan_concepts) !== 0 ||
    Number(dbConsistency.orphan_links) !== 0 ||
    Number(dbConsistency.import_memory_count) !== expectedMemoryCount ||
    Number(dbConsistency.import_embedded_count) !== expectedMemoryCount
  ) {
    fail(`PostgreSQL consistency verification failed: ${JSON.stringify(dbConsistency)}`);
  }

  const cascadeRows = runPsqlJson(`
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'logical_id',
          replace(
            split_part(summary, E'\\n', 1),
            'ICM-BLUEPRINT-ID: ',
            ''
          ),
          'embedding',
          embedding::text
        )
        ORDER BY topic, summary
      ),
      '[]'::json
    )
    FROM memories
    WHERE topic LIKE ${sqlLiteral(`${TOPIC_PREFIX}:%`)}
      AND embedding IS NOT NULL`);
  const cascadeReceipt = verifyCascadeSegments(cascadeRows);
  if (cascadeReceipt.verified_vectors !== plan.memories.length) {
    fail(
      `verified ${cascadeReceipt.verified_vectors} cascade vectors; ` +
        `expected ${plan.memories.length}`
    );
  }

  return { cascadeReceipt, dbConsistency, reconstructed };
}

function semanticRecall({ readOnly = false } = {}) {
  const receipts = [];
  for (const probe of RECALL_PROBES) {
    const output = runIcm(
      [
        "recall",
        probe.query,
        "--limit",
        "8",
        "--format",
        "json"
      ],
      { readOnly }
    ).stdout;
    const results = JSON.parse(output);
    const match = results.find((result) =>
      result.topic?.startsWith(`${TOPIC_PREFIX}:`)
    );
    if (!match) {
      fail(`semantic recall probe did not retrieve the blueprint: ${probe.id}`);
    }
    receipts.push({
      id: probe.id,
      matched_memory_id: logicalIdFromSummary(match.summary),
      score: match.score,
      topic: match.topic
    });
  }
  return receipts;
}

function canonicalGraph(graph) {
  return {
    memoir: {
      name: graph.memoir.name,
      description: graph.memoir.description
    },
    concepts: graph.concepts
      .map((concept) => ({
        name: concept.name,
        definition: concept.definition,
        labels: normalizedKeywords(concept.labels)
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    links: graph.links
      .map((link) => ({
        source: link.source,
        target: link.target,
        relation: link.relation.replaceAll("_", "-"),
        weight: link.weight
      }))
      .sort((left, right) =>
        relationKey({
          from: left.source,
          to: left.target,
          relation: left.relation
        }).localeCompare(
          relationKey({
            from: right.source,
            to: right.target,
            relation: right.relation
          })
        )
      )
  };
}

function stateDigest(plan, memories, graph, metadata) {
  const normalizedMemories = memories
    .map((memory) => ({
      logical_id: logicalIdFromSummary(memory.summary),
      topic: memory.topic,
      summary_sha256: sha256(memory.summary),
      raw_sha256:
        memory.raw === null ? null : sha256(Buffer.from(memory.raw, "utf8")),
      keywords: normalizedKeywords(memory.keywords),
      importance: memory.importance,
      embedding_dim: memory.embedding_dim
    }))
    .sort((left, right) => left.logical_id.localeCompare(right.logical_id));
  return sha256(
    stableJson({
      source: plan.source,
      memories: normalizedMemories,
      graph: canonicalGraph(graph),
      embedding_metadata: metadata
    })
  );
}

function execute(options) {
  const plan = buildIngestionPlan();
  const config = parseEmbeddingConfig();
  const database = preflightDatabase();
  let memories = readImportMemories();
  let graph = readGraph({ readOnly: options.verifyOnly });
  let memoryState = reconcileMemories(plan.memories, memories);
  let graphState = reconcileGraph(plan, graph);
  assertNoDrift(memoryState, graphState);

  const mutations = {
    memories: 0,
    memoirs: 0,
    concepts: 0,
    relations: 0,
    embeddings: 0,
    metadata: 0
  };

  if (options.dryRun) {
    return {
      mode: "dry-run",
      source: plan.source,
      sections: plan.sectionCount,
      named_sections: plan.namedSectionCount,
      raw_chunks: plan.chunks.length,
      generic_memories: plan.memories.length,
      concepts: plan.concepts.length,
      evidence_backed_relations: plan.relations.length,
      planned: {
        memories: memoryState.missing.length,
        memoirs: graphState.memoirMissing ? 1 : 0,
        concepts: graphState.missingConcepts.length,
        relations: graphState.missingRelations.length
      },
      cascade: config,
      database
    };
  }

  if (options.verifyOnly) {
    if (
      memoryState.missing.length ||
      graphState.memoirMissing ||
      graphState.missingConcepts.length ||
      graphState.missingRelations.length
    ) {
      fail("--verify-only found incomplete ingestion state");
    }
  } else {
    for (const [index, memory] of memoryState.missing.entries()) {
      storeMemory(memory);
      mutations.memories += 1;
      if ((index + 1) % 25 === 0) {
        console.error(
          `stored ${index + 1}/${memoryState.missing.length} generic memories`
        );
      }
    }

    if (graphState.memoirMissing) {
      runIcm([
        "memoir",
        "create",
        "--name",
        MEMOIR_NAME,
        "--description",
        MEMOIR_DESCRIPTION,
        "--no-embeddings"
      ]);
      mutations.memoirs += 1;
    }

    graph = readGraph();
    graphState = reconcileGraph(plan, graph);
    assertNoDrift(reconcileMemories(plan.memories, readImportMemories()), graphState);
    for (const [index, concept] of graphState.missingConcepts.entries()) {
      addConcept(concept);
      mutations.concepts += 1;
      if ((index + 1) % 25 === 0) {
        console.error(
          `stored ${index + 1}/${graphState.missingConcepts.length} concepts`
        );
      }
    }

    graph = readGraph();
    graphState = reconcileGraph(plan, graph);
    assertNoDrift(reconcileMemories(plan.memories, readImportMemories()), graphState);
    for (const [index, relation] of graphState.missingRelations.entries()) {
      addRelation(relation);
      mutations.relations += 1;
      if ((index + 1) % 25 === 0) {
        console.error(
          `stored ${index + 1}/${graphState.missingRelations.length} relations`
        );
      }
    }
  }

  memories = readImportMemories();
  const missingEmbeddings = memories.filter(
    (memory) =>
      memory.embedding_dim === null ||
      memory.embedding_dim !== EXPECTED_EMBEDDING_DIMENSION
  );
  const fingerprint = embedFingerprint();
  if (options.verifyOnly && options.forceEmbed) {
    fail("--verify-only cannot be combined with --force-embed");
  }
  if (options.skipEmbed && missingEmbeddings.length) {
    fail(
      `--skip-embed cannot complete ` +
        `${options.verifyOnly ? "verification" : "ingest"}: ` +
        `${missingEmbeddings.length} import memories lack a 1152-dimensional embedding`
    );
  }

  if (options.verifyOnly) {
    if (missingEmbeddings.length) {
      fail(
        `${missingEmbeddings.length} import memories lack a 1152-dimensional ` +
          "embedding"
      );
    }
    graph = readGraph({ readOnly: true });
  } else {
    if (options.forceEmbed || missingEmbeddings.length) {
      const topicsToEmbed = options.forceEmbed
        ? blueprintTopics(plan)
        : missingEmbeddings.map((memory) => memory.topic);
      embedBlueprintTopics(topicsToEmbed, options);
      mutations.embeddings = options.forceEmbed
        ? plan.memories.length
        : missingEmbeddings.length;
    }

    memories = readImportMemories();
    graph = readGraph();
  }

  const exact = verifyExactState(plan, memories, graph);

  const recall = options.skipRecall
    ? []
    : semanticRecall({ readOnly: options.verifyOnly });
  const health = runIcm(
    ["health", "--no-embeddings"],
    { readOnly: options.verifyOnly }
  ).stdout.trim();
  const stats = runIcm(
    ["stats", "--no-embeddings"],
    { readOnly: options.verifyOnly }
  ).stdout.trim();
  const metadata = readFingerprintMetadata();

  return {
    mode: options.verifyOnly ? "verify-only" : "ingest",
    source: plan.source,
    sections: plan.sectionCount,
    named_sections: plan.namedSectionCount,
    raw_chunks: plan.chunks.length,
    generic_memories: plan.memories.length,
    concepts: plan.concepts.length,
    evidence_backed_relations: plan.relations.length,
    relation_types_emitted: [
      ...new Set(plan.relations.map((relation) => relation.relation))
    ],
    raw_reconstruction: {
      sha256: sha256(exact.reconstructed),
      bytes: exact.reconstructed.length,
      lines: countLines(exact.reconstructed)
    },
    cascade: {
      fast_model: config.fastModel,
      primary_model: config.primaryModel,
      dimension: EXPECTED_EMBEDDING_DIMENSION,
      fingerprint: fingerprint.sha256,
      normalization: fingerprint.payload.normalization,
      numeric_verification: exact.cascadeReceipt
    },
    database: exact.dbConsistency,
    semantic_recall: recall,
    health: health.split("\n").at(0),
    stats: stats.split("\n").at(0),
    mutations,
    state_digest: stateDigest(plan, memories, graph, metadata)
  };
}

export function main(argv = process.argv.slice(2)) {
  const result = execute(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const invokedPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`blueprint ICM ingestion failed: ${error.message}`);
    process.exitCode = 1;
  }
}
