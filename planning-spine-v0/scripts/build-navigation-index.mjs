#!/usr/bin/env bun

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

const TEXT_EXTENSIONS = new Set([
  ".csv",
  ".html",
  ".json",
  ".jsonl",
  ".lock",
  ".md",
  ".mjs",
  ".nix",
  ".nu",
  ".patch",
  ".py",
  ".rs",
  ".sha256",
  ".sh",
  ".toml",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const ROUTE_HUB_ID = "hub:semantic-routes";
const FILE_HUB_ID = "hub:resources";
const TASK_HUB_ID = "hub:tasks";
const SOURCE_HUB_ID = "hub:notebooklm-sources";
const CLAIM_HUB_ID = "hub:claims";
const EVIDENCE_HUB_ID = "hub:evidence";
const PROOF_HUB_ID = "hub:proof-history";
const STRUCTURED_HUB_ID = "hub:structured-sources";

function slash(value) {
  return value.split(path.sep).join("/");
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function normalizeLookup(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value) {
  return normalizeLookup(value).replace(/ /g, "-") || "unnamed";
}

function truncate(value, maximum = 320) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function splitReferences(value) {
  return unique(
    String(value ?? "")
      .split(/\s*;\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegExp(pattern) {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += escapeRegExp(character);
    }
  }
  return new RegExp(`^${expression}$`);
}

function matchesAny(relativePath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(relativePath));
}

function walkFiles(root) {
  const output = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) output.push(absolutePath);
    }
  };
  visit(root);
  return output;
}

function readText(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.includes(0)) return null;
  return bytes.toString("utf8");
}

function countNewlines(bytes) {
  let count = 0;
  for (const byte of bytes) if (byte === 0x0a) count += 1;
  return count;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return {};
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const closing = lines.indexOf("---", 1);
  if (closing < 0) return {};
  const metadata = parseYaml(lines.slice(1, closing).join("\n"), { uniqueKeys: true }) ?? {};
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Markdown frontmatter must be a YAML mapping");
  }
  return metadata;
}

function stripMarkdownCode(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function markdownMetadata(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const frontmatter = parseFrontmatter(normalized);
  const body = normalized.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const headings = unique(
    [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => truncate(match[1].replace(/\s+#+$/, ""), 180))
  );
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^>\s?/gm, "").replace(/^[-*]\s+/gm, "").trim())
    .filter((paragraph) => paragraph && !paragraph.startsWith("#") && !paragraph.startsWith("|") && !paragraph.startsWith("```"));
  return {
    frontmatter,
    title: frontmatter.title || headings[0] || null,
    description: frontmatter.description || truncate(paragraphs[0] ?? "", 360),
    headings: headings.slice(0, 64)
  };
}

export function parseCsv(text) {
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
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map((cell, index) => (index === 0 ? cell.replace(/^\uFEFF/, "") : cell));
  return rows
    .slice(1)
    .filter((cells) => cells.some((cell) => cell !== ""))
    .map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])));
}

function detectMediaType(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const names = {
    ".csv": "text/csv",
    ".html": "text/html",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".md": "text/markdown",
    ".mjs": "text/javascript",
    ".nix": "text/x-nix",
    ".nu": "text/x-nushell",
    ".py": "text/x-python",
    ".rs": "text/x-rust",
    ".sh": "text/x-shellscript",
    ".toml": "application/toml",
    ".tsx": "text/tsx",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".zip": "application/zip"
  };
  return names[extension] ?? (TEXT_EXTENSIONS.has(extension) ? "text/plain" : "application/octet-stream");
}

function classifyFile(packagePath, frontmatter, jsonValue, isExternal = false) {
  const extension = path.extname(packagePath).toLowerCase();
  const basename = path.basename(packagePath);
  let kind = frontmatter.type || "resource";
  let authorityClass = "maintained-contract";
  let lifecycle = "maintained";
  let status = frontmatter.status || jsonValue?.status || jsonValue?.result || "unspecified";

  if (isExternal) {
    if (packagePath === "AGENTS.md") {
      return { kind: "operating-contract", authorityClass: "operating-contract", lifecycle: "maintained", status: "active" };
    }
    return { kind: "external-file", authorityClass: "external-reference", lifecycle: "reference", status: "referenced" };
  }
  if (packagePath === "1.0_VISION/Notebooklm/artifacts.meta.json") {
    kind = "raw-artifact-catalog";
    authorityClass = "canonical-input";
    lifecycle = "maintained";
  } else if (/^1\.0_VISION\/current_state\/(?:SYSTEM_INVENTORY|BUILD_MATRIX|DEPENDENCY_GRAPH|CONVERGENCE)\.md$/.test(packagePath)
    || packagePath === "1.0_VISION/current_state/system_inventory.json") {
    kind = "current-state-projection";
    authorityClass = "derived-projection";
    lifecycle = "generated";
  } else if (packagePath === "navigation/source.json" || packagePath.endsWith(".source.csv")) {
    kind = packagePath === "navigation/source.json" ? "navigation-source" : "canonical-source-table";
    authorityClass = "canonical-input";
  } else if (packagePath === "proof_records/proof_ledger.jsonl") {
    kind = "proof-ledger";
    authorityClass = "exact-evidence";
    lifecycle = "append-only";
  } else if (/^proof_records\/.*\.proof\.json$/.test(packagePath) || packagePath.startsWith("connector_proof/")) {
    kind = "proof-record";
    authorityClass = "exact-evidence";
    lifecycle = "immutable-source";
  } else if (packagePath.startsWith("generated/notebooklm_source_extracts/")) {
    kind = "captured-source";
    authorityClass = "exact-evidence";
    lifecycle = "generated";
  } else if (packagePath.startsWith("generated/notebooklm_claim_verification/")) {
    kind = "verification-evidence";
    authorityClass = "exact-evidence";
    lifecycle = "generated";
  } else if (packagePath.startsWith("1.0_VISION/Notebooklm/") && !["README.md", "artifacts.meta.json"].includes(basename)) {
    kind = extension === ".csv" ? "raw-data-table" : "raw-composite-report";
    authorityClass = "architecture-input";
    lifecycle = "immutable-source";
    status = "cataloged-unverified";
  } else if (packagePath.startsWith("generated/fixtures/") || packagePath.startsWith("proof_records/fixtures/") || packagePath.startsWith("examples/")) {
    kind = packagePath.startsWith("examples/") ? "example" : "test-fixture";
    authorityClass = "example-or-fixture";
    lifecycle = "reference";
  } else if (packagePath.startsWith("generated/") || packagePath.startsWith("state/") || packagePath.startsWith("capability_state/") || packagePath.startsWith("connector_state/") || packagePath.startsWith("weave_state/")) {
    kind = frontmatter.type || (extension === ".md" ? "generated-report" : "generated-projection");
    authorityClass = "derived-projection";
    lifecycle = "generated";
  } else if (packagePath.startsWith("dist/")) {
    kind = "artifact-bundle";
    authorityClass = "artifact-bundle";
    lifecycle = "generated";
  } else if (packagePath.startsWith("scripts/") || packagePath === "test_preserve_artifacts.py" || extension === ".sh" || extension === ".py" || extension === ".mjs") {
    kind = "execution-tool";
    authorityClass = "execution-tooling";
    lifecycle = "executable";
  } else if (packagePath.startsWith("schemas/") || packagePath.startsWith("navigation/schemas/")) {
    kind = extension === ".json" ? "schema" : "gate-contract";
    authorityClass = "maintained-contract";
  } else if (packagePath.startsWith("rfcs/")) {
    kind = "rfc";
    authorityClass = "architecture-input";
    status = status === "unspecified" ? "proposed" : status;
  } else if (packagePath.startsWith("1.0_VISION/") && !frontmatter.type) {
    kind = extension === ".md" ? "vision-input" : "vision-artifact";
    authorityClass = "architecture-input";
  } else if (packagePath.startsWith("docs/authority/")) {
    kind = "authority-contract";
    authorityClass = "maintained-contract";
  } else if (packagePath.startsWith("docs/")) {
    kind = "protocol-or-runbook";
    authorityClass = "maintained-contract";
  } else if (packagePath.startsWith("worldsim/")) {
    kind = extension === ".md" ? "simulation-runbook" : "simulation-environment";
    authorityClass = extension === ".md" ? "maintained-contract" : "execution-tooling";
  } else if (/^(?:0\d_|README\.md|EXECUTION_STATUS\.md|NAVIGATION\.md)/.test(packagePath)) {
    kind = frontmatter.type || "planning-contract";
    authorityClass = "maintained-contract";
  } else if (jsonValue?.$schema || jsonValue?.schema_version) {
    kind = "structured-resource";
  }

  if (/DRAFT/i.test(String(frontmatter.title ?? "")) && status === "unspecified") status = "draft";
  return { kind, authorityClass, lifecycle, status: String(status).toLowerCase() };
}

function jsonMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    title: value.title || value.name || value.task_id || value.proof_id || value.id || value.catalog_id || null,
    description: value.description || value.summary || value.message || value.goal || value.assessment || null,
    aliases: unique([value.id, value.task_id, value.proof_id, value.catalog_id, value.evidence_id].map((item) => item && String(item))),
    status: value.status || value.result || null,
    schemaVersion: value.schema_version || value.$schema || null
  };
}

function resolvePathWithinRepo(repoRoot, sourceAbsolutePath, target, wiki = false) {
  const withoutAlias = wiki ? target.split("|", 1)[0] : target;
  const [pathPart, anchor = ""] = withoutAlias.split("#", 2);
  const trimmed = pathPart.trim();
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(trimmed) || trimmed.startsWith("code:")) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  let absolutePath = wiki ? path.resolve(repoRoot, decoded) : path.resolve(path.dirname(sourceAbsolutePath), decoded);
  if (wiki && !path.extname(absolutePath)) absolutePath += ".md";
  let relativeToRepo = path.relative(repoRoot, absolutePath);
  const outside = relativeToRepo.startsWith("..") || path.isAbsolute(relativeToRepo);
  if (!outside && fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    absolutePath = path.join(absolutePath, "README.md");
    relativeToRepo = path.relative(repoRoot, absolutePath);
  }
  return {
    absolutePath,
    repoPath: slash(relativeToRepo),
    anchor,
    exists: fs.existsSync(absolutePath),
    outside
  };
}

function extractLinks(text) {
  const stripped = stripMarkdownCode(text);
  const markdown = [...stripped.matchAll(/\[[^\]]+\]\((?:<([^>]+)>|([^\s)]+))\)/g)].map((match) => match[1] ?? match[2]);
  const wiki = [...stripped.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]);
  return { markdown, wiki };
}

function sortObjectOfArrays(value) {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, items]) => [key, unique(items).sort()])
  );
}

function addLookup(lookup, key, nodeId) {
  if (!key) return;
  if (!lookup[key]) lookup[key] = [];
  lookup[key].push(nodeId);
}

const NAVIGATION_SCHEMA_PATHS = {
  graph: "navigation/schemas/navigation-graph.schema.json",
  index: "navigation/schemas/navigation-index.schema.json",
  validation: "navigation/schemas/navigation-validation.schema.json"
};

export function validateNavigationArtifactSchemas(artifacts) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const errors = [];
  for (const [name, relativePath] of Object.entries(NAVIGATION_SCHEMA_PATHS)) {
    const schema = JSON.parse(fs.readFileSync(path.join(artifacts.pkgRoot, relativePath), "utf8"));
    const validate = ajv.compile(schema);
    if (validate(artifacts[name])) continue;
    for (const error of validate.errors ?? []) {
      errors.push(`${name}${error.instancePath || "/"} ${error.message}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function buildNavigationArtifacts(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const pkgRoot = path.join(repoRoot, "planning-spine-v0");
  const sourcePath = path.join(pkgRoot, "navigation", "source.json");
  if (!fs.existsSync(sourcePath)) throw new Error(`Navigation source not found: ${sourcePath}`);
  const sourceBytes = fs.readFileSync(sourcePath);
  const source = JSON.parse(sourceBytes.toString("utf8"));
  const errors = [];
  const warnings = [];
  const checks = [];
  const nodes = new Map();
  const edges = new Map();
  const fileNodeByPackagePath = new Map();
  const fileNodeByRepoPath = new Map();
  const contentByNode = new Map();
  const unresolvedLinks = [];
  const strictLinks = new Set(source.strict_link_documents);
  const allowedExternalReferences = new Set(source.external_reference_paths ?? []);
  const observedExternalReferences = new Set();

  const addNode = (node) => {
    if (nodes.has(node.id)) {
      errors.push(`duplicate node id: ${node.id}`);
      return nodes.get(node.id);
    }
    nodes.set(node.id, node);
    return node;
  };
  const addEdge = (from, to, kind, detail = null) => {
    const key = `${from}\u0000${kind}\u0000${to}\u0000${detail ?? ""}`;
    if (!edges.has(key)) edges.set(key, { from, to, kind, ...(detail ? { detail } : {}) });
  };

  addNode({
    id: source.root_node_id,
    kind: "planning-spine",
    title: source.title,
    description: source.description,
    path: "planning-spine-v0",
    status: "active",
    authority_class: "maintained-contract",
    lifecycle: "maintained",
    aliases: ["LifeOS Planning Spine v0", "planning spine"],
    tags: ["lifeos", "planning-spine", "navigation"],
    identifiers: [source.id],
    headings: [],
    routes: ["start-here"],
    content: null,
    metadata: { source_schema_version: source.schema_version }
  });
  for (const [id, title, description] of [
    [FILE_HUB_ID, "Planning resources", "All included planning-spine files organized by directory containment."],
    [ROUTE_HUB_ID, "Semantic routes", "Curated topic routes for rapid agent retrieval."],
    [TASK_HUB_ID, "Canonical tasks", "Tasks loaded from the normalized projection of task_graph.source.csv."],
    [SOURCE_HUB_ID, "NotebookLM sources", "Captured NotebookLM source objects and their extracts."],
    [CLAIM_HUB_ID, "Claims and verification queue", "Normalized source claims and their verification state."],
    [EVIDENCE_HUB_ID, "Evidence", "Claim evidence records and exact source relationships."],
    [PROOF_HUB_ID, "Proof history", "Accepted append-only proof-ledger revisions."],
    [STRUCTURED_HUB_ID, "Structured planning entities", "Coverage anchors, gaps, conflicts, and capability rows."]
  ]) {
    addNode({
      id,
      kind: "hub",
      title,
      description,
      path: null,
      status: "active",
      authority_class: "derived-projection",
      lifecycle: "generated",
      aliases: [title],
      tags: ["navigation", "hub"],
      identifiers: [],
      headings: [],
      routes: [],
      content: null,
      metadata: {}
    });
    addEdge(source.root_node_id, id, "contains");
  }

  for (const route of source.routes) {
    const routeId = `route:${route.id}`;
    addNode({
      id: routeId,
      kind: "semantic-route",
      title: route.title,
      description: route.description,
      path: null,
      status: "active",
      authority_class: "canonical-input",
      lifecycle: "maintained",
      aliases: route.aliases,
      tags: route.tags,
      identifiers: [route.id],
      headings: [],
      routes: [route.id],
      content: null,
      metadata: { entrypoints: route.entrypoints, task_prefixes: route.task_prefixes ?? [] }
    });
    addEdge(ROUTE_HUB_ID, routeId, "contains");
  }

  const normalizedGraphPath = path.join(pkgRoot, "generated/task_graph.normalized.json");
  const normalizedGraph = JSON.parse(fs.readFileSync(normalizedGraphPath, "utf8"));
  const taskStatusProjection = JSON.parse(fs.readFileSync(path.join(pkgRoot, "generated/task_graph.status.json"), "utf8"));
  const projectedTaskById = new Map(taskStatusProjection.tasks.map((task) => [task.task_id, task]));
  const taskIds = new Set(normalizedGraph.tasks.map((task) => task.task_id));
  const claimRows = parseCsv(fs.readFileSync(path.join(pkgRoot, "generated/notebooklm_source_claims.source.csv"), "utf8"));
  const claimIds = new Set(claimRows.map((row) => row.claim_id));
  const sourceRows = parseCsv(fs.readFileSync(path.join(pkgRoot, "generated/notebooklm_source_registry.source.csv"), "utf8"));
  const sourceIds = new Set(sourceRows.map((row) => row.capture_task_id));
  const knownIdentifiers = [...taskIds, ...claimIds, ...sourceIds].sort((left, right) => right.length - left.length);

  const allAbsoluteFiles = walkFiles(pkgRoot);
  const excludedExisting = [];
  const includedFiles = [];
  const selfExcludedOutputs = new Set(Object.values(source.outputs));
  for (const absolutePath of allAbsoluteFiles) {
    const packagePath = slash(path.relative(pkgRoot, absolutePath));
    if (matchesAny(packagePath, source.excluded_paths)) {
      if (!selfExcludedOutputs.has(packagePath)) excludedExisting.push(packagePath);
    }
    else includedFiles.push({ absolutePath, packagePath });
  }

  const directoryIds = new Map([["", FILE_HUB_ID]]);
  const ensureDirectory = (directory) => {
    if (directoryIds.has(directory)) return directoryIds.get(directory);
    const parent = slash(path.posix.dirname(directory));
    const normalizedParent = parent === "." ? "" : parent;
    const parentId = ensureDirectory(normalizedParent);
    const id = `dir:planning-spine-v0/${directory}`;
    addNode({
      id,
      kind: "directory",
      title: path.posix.basename(directory),
      description: `Directory planning-spine-v0/${directory}.`,
      path: `planning-spine-v0/${directory}`,
      status: "active",
      authority_class: "derived-projection",
      lifecycle: "generated",
      aliases: [directory, path.posix.basename(directory)],
      tags: ["directory", ...directory.split("/").map(slug)],
      identifiers: [],
      headings: [],
      routes: [],
      content: null,
      metadata: {}
    });
    directoryIds.set(directory, id);
    addEdge(parentId, id, "contains");
    return id;
  };

  const addFileNode = (absolutePath, packagePath = null) => {
    const repoPath = slash(path.relative(repoRoot, absolutePath));
    if (fileNodeByRepoPath.has(repoPath)) return fileNodeByRepoPath.get(repoPath);
    const external = packagePath === null;
    const bytes = fs.readFileSync(absolutePath);
    const text = bytes.includes(0) ? null : bytes.toString("utf8");
    let frontmatter = {};
    let title = null;
    let description = null;
    let headings = [];
    let jsonValue = null;
    let aliases = [];
    let schemaVersion = null;
    const effectivePath = packagePath ?? repoPath;
    if (text !== null && path.extname(absolutePath).toLowerCase() === ".md") {
      const metadata = markdownMetadata(text);
      frontmatter = metadata.frontmatter;
      title = metadata.title;
      description = metadata.description;
      headings = metadata.headings;
      aliases = Array.isArray(frontmatter.aliases) ? frontmatter.aliases.map(String) : [];
    } else if (text !== null && path.extname(absolutePath).toLowerCase() === ".json") {
      try {
        jsonValue = JSON.parse(text);
        const metadata = jsonMetadata(jsonValue);
        title = metadata.title;
        description = metadata.description;
        aliases = metadata.aliases ?? [];
        schemaVersion = metadata.schemaVersion;
      } catch {
        // Invalid JSON remains visible as a file node; package verification owns parse failure.
      }
    }
    const classification = classifyFile(effectivePath, frontmatter, jsonValue, external);
    const basename = path.basename(effectivePath);
    const stem = basename.replace(/\.[^.]+$/, "");
    let identifiers = text === null
      ? []
      : knownIdentifiers.filter((identifier) => new RegExp(`(^|[^A-Z0-9-])${escapeRegExp(identifier)}([^A-Z0-9-]|$)`).test(text));
    const tags = unique([
      "lifeos",
      "planning-spine",
      classification.kind,
      classification.authorityClass,
      ...effectivePath.split("/").slice(0, -1).map(slug),
      ...(Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [])
    ]).map(slug);
    const volatile = packagePath !== null && source.volatile_paths.includes(packagePath);
    if (volatile) {
      title = stem.replace(/[-_]+/g, " ");
      description = `Volatile verifier report at ${repoPath}; path and role are indexed, while run-specific content is intentionally omitted.`;
      aliases = [];
      identifiers = [];
      schemaVersion = null;
      classification.status = "volatile";
    }
    const nodeId = external ? `external-file:${repoPath}` : `file:planning-spine-v0/${packagePath}`;
    const node = addNode({
      id: nodeId,
      kind: classification.kind,
      title: truncate(title || stem.replace(/[-_]+/g, " "), 220),
      description: truncate(description || `${classification.kind} resource at ${repoPath}.`, 360),
      path: repoPath,
      status: classification.status,
      authority_class: classification.authorityClass,
      lifecycle: classification.lifecycle,
      aliases: unique([basename, stem, title, frontmatter.id, ...aliases].map((item) => item && String(item))),
      tags,
      identifiers: unique([frontmatter.id, ...identifiers].map((item) => item && String(item))),
      headings,
      routes: [],
      content: {
        media_type: detectMediaType(effectivePath),
        byte_count: volatile ? null : bytes.length,
        newline_count: volatile ? null : countNewlines(bytes),
        sha256: volatile ? null : sha256Bytes(bytes),
        volatile
      },
      metadata: {
        package_path: packagePath,
        frontmatter_id: frontmatter.id ?? null,
        schema_version: schemaVersion,
        raw_source_preserved: classification.lifecycle === "immutable-source",
        frontmatter: Object.keys(frontmatter).length ? frontmatter : null
      }
    });
    fileNodeByRepoPath.set(repoPath, nodeId);
    if (packagePath !== null) {
      fileNodeByPackagePath.set(packagePath, nodeId);
      addEdge(ensureDirectory(slash(path.posix.dirname(packagePath)) === "." ? "" : slash(path.posix.dirname(packagePath))), nodeId, "contains");
    }
    if (text !== null) contentByNode.set(nodeId, volatile ? `${title} volatile verifier report`.toLowerCase() : text.toLowerCase());
    return node.id;
  };

  const addExternalReferenceNode = (repoPath) => {
    if (fileNodeByRepoPath.has(repoPath)) return fileNodeByRepoPath.get(repoPath);
    const basename = path.posix.basename(repoPath);
    const stem = basename.replace(/\.[^.]+$/, "");
    const nodeId = `external-reference:${repoPath}`;
    addNode({
      id: nodeId,
      kind: "external-reference",
      title: stem.replace(/[-_]+/g, " "),
      description: `Reference outside the LifeOS repository at ${repoPath}; target bytes are intentionally not imported into the deterministic planning graph.`,
      path: repoPath,
      status: "referenced",
      authority_class: "external-reference",
      lifecycle: "reference",
      aliases: unique([basename, stem, repoPath]),
      tags: ["external-reference", "cross-repository"],
      identifiers: [],
      headings: [],
      routes: [],
      content: null,
      metadata: {
        scope: "outside-repository",
        content_imported: false
      }
    });
    fileNodeByRepoPath.set(repoPath, nodeId);
    contentByNode.set(nodeId, `${basename} ${repoPath}`.toLowerCase());
    return nodeId;
  };

  for (const file of includedFiles) addFileNode(file.absolutePath, file.packagePath);

  for (const outputPath of Object.values(source.outputs)) {
    const repoPath = `planning-spine-v0/${outputPath}`;
    const nodeId = `navigation-output:${outputPath}`;
    addNode({
      id: nodeId,
      kind: "generated-navigation-output",
      title: path.basename(outputPath),
      description: `Deterministic navigation output ${repoPath}; excluded from its own input inventory to prevent self-referential hashes.`,
      path: repoPath,
      status: "generated",
      authority_class: "derived-projection",
      lifecycle: "generated",
      aliases: [path.basename(outputPath), outputPath],
      tags: ["navigation", "generated-output"],
      identifiers: [],
      headings: [],
      routes: ["start-here"],
      content: { media_type: "application/json", byte_count: null, newline_count: null, sha256: null, volatile: true },
      metadata: { package_path: outputPath, self_excluded: true }
    });
    fileNodeByRepoPath.set(repoPath, nodeId);
    fileNodeByPackagePath.set(outputPath, nodeId);
    const directory = slash(path.posix.dirname(outputPath));
    addEdge(ensureDirectory(directory === "." ? "" : directory), nodeId, "contains");
  }

  const strictUnresolved = [];
  for (const { absolutePath, packagePath } of includedFiles.filter((file) => path.extname(file.packagePath).toLowerCase() === ".md")) {
    const sourceNodeId = fileNodeByPackagePath.get(packagePath);
    const text = fs.readFileSync(absolutePath, "utf8");
    const links = extractLinks(text);
    for (const [kind, targets] of [["markdown-link", links.markdown], ["wiki-link", links.wiki]]) {
      for (const target of targets) {
        const resolved = resolvePathWithinRepo(repoRoot, absolutePath, target, kind === "wiki-link");
        if (!resolved) continue;
        if (resolved.outside) {
          if (!allowedExternalReferences.has(resolved.repoPath)) {
            const finding = { source: packagePath, kind, target, reason: "unapproved-external-reference" };
            unresolvedLinks.push(finding);
            errors.push(`unapproved external reference in ${packagePath}: ${target}`);
            if (strictLinks.has(packagePath)) strictUnresolved.push(finding);
            continue;
          }
          observedExternalReferences.add(resolved.repoPath);
          addEdge(sourceNodeId, addExternalReferenceNode(resolved.repoPath), kind, resolved.anchor || null);
          continue;
        }
        const declaredTargetNodeId = fileNodeByRepoPath.get(resolved.repoPath);
        if (declaredTargetNodeId) {
          addEdge(sourceNodeId, declaredTargetNodeId, kind, resolved.anchor || null);
          continue;
        }
        if (!resolved.exists) {
          const finding = { source: packagePath, kind, target, reason: "missing" };
          unresolvedLinks.push(finding);
          if (strictLinks.has(packagePath)) strictUnresolved.push(finding);
          continue;
        }
        const targetNodeId = addFileNode(resolved.absolutePath, null);
        addEdge(sourceNodeId, targetNodeId, kind, resolved.anchor || null);
      }
    }
  }
  if (strictUnresolved.length) {
    errors.push(...strictUnresolved.map((finding) => `broken ${finding.kind} in ${finding.source}: ${finding.target}`));
  }
  checks.push({ name: "strict_links_resolve", result: strictUnresolved.length ? "fail" : "pass", observed: strictUnresolved.length });
  const missingExternalReferences = [...allowedExternalReferences].filter((target) => !observedExternalReferences.has(target));
  if (missingExternalReferences.length) {
    errors.push(...missingExternalReferences.map((target) => `allowlisted external reference is not linked: ${target}`));
  }
  checks.push({
    name: "external_references_are_explicitly_allowlisted",
    result: missingExternalReferences.length || [...unresolvedLinks].some((finding) => finding.reason === "unapproved-external-reference") ? "fail" : "pass",
    observed: observedExternalReferences.size,
    expected: allowedExternalReferences.size
  });

  const historicalTaskIds = new Set();
  const taskNodeId = (taskId) => {
    if (taskIds.has(taskId)) return `task:${taskId}`;
    if (source.allowed_historical_task_ids.includes(taskId)) {
      const nodeId = `historical-task:${taskId}`;
      if (!nodes.has(nodeId)) {
        addNode({
          id: nodeId,
          kind: "historical-task",
          title: taskId,
          description: "Historical proof subject retained in the ledger but absent from the canonical current task graph.",
          path: null,
          status: "historical",
          authority_class: "exact-evidence",
          lifecycle: "append-only",
          aliases: [taskId],
          tags: ["historical-task", "proof-history"],
          identifiers: [taskId],
          headings: [],
          routes: ["proof-and-verification"],
          content: null,
          metadata: {}
        });
        addEdge(TASK_HUB_ID, nodeId, "contains");
      }
      historicalTaskIds.add(taskId);
      return nodeId;
    }
    errors.push(`unknown task reference: ${taskId}`);
    return null;
  };

  for (const task of normalizedGraph.tasks) {
    const nodeId = `task:${task.task_id}`;
    const projectedTask = projectedTaskById.get(task.task_id);
    if (!projectedTask) errors.push(`task status projection is missing ${task.task_id}`);
    const effectiveStatus = projectedTask?.lifecycle_state ?? task.status;
    addNode({
      id: nodeId,
      kind: "task",
      title: task.title,
      description: truncate(task.goal, 500),
      path: null,
      status: effectiveStatus,
      authority_class: "canonical-input",
      lifecycle: "maintained",
      aliases: [task.task_id, task.title],
      tags: unique(["task", task.phase, effectiveStatus, task.task_id.split("-", 1)[0]]).map(slug),
      identifiers: [task.task_id],
      headings: [],
      routes: [],
      content: null,
      metadata: {
        source_row_number: task.source_row_number,
        phase: task.phase,
        owner_agent: task.owner_agent,
        parent_ids: task.parent_ids,
        source_status: task.status,
        projected_status: projectedTask?.lifecycle_state ?? null,
        projected_proof: projectedTask?.proof ?? null,
        simulation_required: task.simulation_required,
        verification_gate: task.verification_gate,
        proof_uri: task.proof_uri,
        next_action: task.next_action
      }
    });
    addEdge(TASK_HUB_ID, nodeId, "contains");
    addEdge(nodeId, fileNodeByPackagePath.get("generated/task_graph.source.csv"), "defined-in");
  }
  checks.push({
    name: "task_status_projection_covers_canonical_tasks",
    result: normalizedGraph.tasks.every((task) => projectedTaskById.has(task.task_id)) ? "pass" : "fail",
    observed: projectedTaskById.size,
    expected: normalizedGraph.tasks.length
  });
  for (const task of normalizedGraph.tasks) {
    for (const parentId of task.parent_ids) {
      const parentNode = taskNodeId(parentId);
      if (parentNode) addEdge(parentNode, `task:${task.task_id}`, "parent-of");
    }
    const proofPath = String(task.proof_uri ?? "").replace(/^planning-spine-v0\//, "");
    if (fileNodeByPackagePath.has(proofPath)) addEdge(`task:${task.task_id}`, fileNodeByPackagePath.get(proofPath), "declares-proof");
  }
  checks.push({ name: "task_parents_resolve", result: errors.some((error) => error.startsWith("unknown task reference")) ? "fail" : "pass", observed: normalizedGraph.tasks.length });

  for (const [packagePath, fileNodeId] of fileNodeByPackagePath) {
    const node = nodes.get(fileNodeId);
    for (const identifier of node.identifiers) {
      if (taskIds.has(identifier)) addEdge(fileNodeId, `task:${identifier}`, "references-task");
    }
  }

  const sourceNodeIds = new Map();
  for (const row of sourceRows) {
    const captureId = row.capture_task_id;
    const nodeId = `source:${captureId}`;
    sourceNodeIds.set(captureId, nodeId);
    addNode({
      id: nodeId,
      kind: "notebooklm-source",
      title: row.title,
      description: `${row.object_type} captured as ${captureId}; ${row.claim_count} claims, ${row.verification_required_count} requiring verification.`,
      path: null,
      status: row.capture_status,
      authority_class: "exact-evidence",
      lifecycle: "immutable-source",
      aliases: [captureId, row.title, row.object_id],
      tags: ["notebooklm", "source", slug(row.object_type), slug(row.capture_status)],
      identifiers: [captureId, row.notebook_id, row.object_id],
      headings: [],
      routes: ["notebooklm-provenance"],
      content: null,
      metadata: {
        notebook_id: row.notebook_id,
        object_id: row.object_id,
        object_type: row.object_type,
        content_sha256: row.content_sha256,
        byte_count: Number(row.byte_count),
        line_count: Number(row.line_count),
        next_source_gate: row.next_source_gate
      }
    });
    addEdge(SOURCE_HUB_ID, nodeId, "contains");
    addEdge(nodeId, fileNodeByPackagePath.get("generated/notebooklm_source_registry.source.csv"), "registered-in");
    const extract = [...fileNodeByPackagePath.keys()].find((candidate) => candidate.startsWith(`generated/notebooklm_source_extracts/${captureId}-`));
    if (extract) addEdge(nodeId, fileNodeByPackagePath.get(extract), "materialized-as");
    for (const taskId of splitReferences(row.mapped_task_ids)) {
      const target = taskNodeId(taskId);
      if (target) addEdge(nodeId, target, "maps-to-task");
    }
  }

  const claimNodeIds = new Map();
  for (const row of claimRows) {
    const nodeId = `claim:${row.claim_id}`;
    claimNodeIds.set(row.claim_id, nodeId);
    addNode({
      id: nodeId,
      kind: "claim",
      title: row.claim_id,
      description: truncate(row.claim, 600),
      path: null,
      status: row.coverage_status,
      authority_class: "canonical-input",
      lifecycle: "maintained",
      aliases: [row.claim_id, truncate(row.claim, 120)],
      tags: ["claim", slug(row.classification), slug(row.coverage_status), slug(row.evidence_state)],
      identifiers: [row.claim_id, row.capture_id, row.object_id],
      headings: [],
      routes: ["notebooklm-provenance"],
      content: null,
      metadata: {
        capture_id: row.capture_id,
        object_id: row.object_id,
        section: row.section,
        classification: row.classification,
        evidence_state: row.evidence_state,
        required_resolution: row.required_resolution
      }
    });
    addEdge(CLAIM_HUB_ID, nodeId, "contains");
    addEdge(nodeId, fileNodeByPackagePath.get("generated/notebooklm_source_claims.source.csv"), "defined-in");
    const sourceNode = sourceNodeIds.get(row.capture_id);
    if (sourceNode) addEdge(sourceNode, nodeId, "asserts");
    else errors.push(`claim ${row.claim_id} references unknown source ${row.capture_id}`);
    for (const taskId of splitReferences(row.task_ids)) {
      const target = taskNodeId(taskId);
      if (target) addEdge(nodeId, target, "maps-to-task");
    }
  }

  const queueRows = parseCsv(fs.readFileSync(path.join(pkgRoot, "generated/notebooklm_claim_verification_queue.source.csv"), "utf8"));
  for (const row of queueRows) {
    const nodeId = `verification-queue:${row.queue_id}`;
    addNode({
      id: nodeId,
      kind: "verification-queue-item",
      title: `${row.queue_id}: ${row.claim_id}`,
      description: truncate(row.next_action || row.required_primary_evidence, 500),
      path: null,
      status: row.verification_status,
      authority_class: "canonical-input",
      lifecycle: "maintained",
      aliases: [row.queue_id, row.claim_id],
      tags: ["verification-queue", slug(row.claim_type), slug(row.verification_status)],
      identifiers: [row.queue_id, row.claim_id, row.capture_id],
      headings: [],
      routes: ["notebooklm-provenance", "proof-and-verification"],
      content: null,
      metadata: {
        claim_type: row.claim_type,
        verification_method: row.verification_method,
        required_primary_evidence: row.required_primary_evidence,
        resolution: row.resolution,
        proof_uri: row.proof_uri,
        notes: row.notes
      }
    });
    addEdge(CLAIM_HUB_ID, nodeId, "contains");
    addEdge(nodeId, fileNodeByPackagePath.get("generated/notebooklm_claim_verification_queue.source.csv"), "defined-in");
    const claimNode = claimNodeIds.get(row.claim_id);
    if (claimNode) addEdge(claimNode, nodeId, "verified-through");
    else errors.push(`verification queue ${row.queue_id} references unknown claim ${row.claim_id}`);
    for (const taskId of splitReferences(row.blocking_task_ids)) {
      const target = taskNodeId(taskId);
      if (target) addEdge(nodeId, target, "blocked-by-task");
    }
    const proofPath = String(row.proof_uri ?? "").replace(/^planning-spine-v0\//, "");
    if (fileNodeByPackagePath.has(proofPath)) addEdge(nodeId, fileNodeByPackagePath.get(proofPath), "resolved-by-proof");
  }

  const pendingEvidenceReferences = [];
  const evidenceRows = parseCsv(fs.readFileSync(path.join(pkgRoot, "generated/notebooklm_claim_evidence.source.csv"), "utf8"));
  for (const row of evidenceRows) {
    const nodeId = `evidence:${row.evidence_id}`;
    addNode({
      id: nodeId,
      kind: "claim-evidence",
      title: `${row.evidence_id}: ${row.evidence_type}`,
      description: truncate(row.assessment || row.exact_pointer, 500),
      path: null,
      status: row.status,
      authority_class: "exact-evidence",
      lifecycle: "immutable-source",
      aliases: [row.evidence_id, row.evidence_type],
      tags: ["evidence", slug(row.evidence_level), slug(row.relationship), slug(row.status)],
      identifiers: [row.evidence_id],
      headings: [],
      routes: ["notebooklm-provenance", "proof-and-verification"],
      content: null,
      metadata: {
        evidence_type: row.evidence_type,
        evidence_level: row.evidence_level,
        source_uri: row.source_uri,
        version_or_commit: row.version_or_commit,
        content_sha256: row.content_sha256,
        exact_pointer: row.exact_pointer,
        relationship: row.relationship
      }
    });
    addEdge(EVIDENCE_HUB_ID, nodeId, "contains");
    addEdge(nodeId, fileNodeByPackagePath.get("generated/notebooklm_claim_evidence.source.csv"), "defined-in");
    for (const claimId of splitReferences(row.claim_ids)) {
      const target = claimNodeIds.get(claimId);
      if (target) addEdge(nodeId, target, slug(row.relationship) || "relates-to-claim");
      else pendingEvidenceReferences.push({ evidenceNodeId: nodeId, evidenceId: row.evidence_id, identifier: claimId, relationship: row.relationship });
    }
    const localPath = String(row.source_uri ?? "").replace(/^planning-spine-v0\//, "");
    if (fileNodeByPackagePath.has(localPath)) addEdge(nodeId, fileNodeByPackagePath.get(localPath), "sourced-from");
  }

  for (const adapter of source.structured_sources) {
    const adapterRows = parseCsv(fs.readFileSync(path.join(pkgRoot, adapter.path), "utf8"));
    adapterRows.forEach((row, index) => {
      const identifier = row[adapter.id_column] || `row-${index + 1}`;
      let nodeId = `structured:${adapter.kind}:${slug(identifier)}`;
      if (nodes.has(nodeId)) nodeId = `${nodeId}:${index + 1}`;
      addNode({
        id: nodeId,
        kind: adapter.kind,
        title: truncate(row[adapter.title_column] || identifier, 260),
        description: truncate(row[adapter.description_column] || `${adapter.kind} ${identifier}`, 500),
        path: null,
        status: String(row.status || row.coverage_status || row.decomposition_status || "unspecified").toLowerCase(),
        authority_class: "canonical-input",
        lifecycle: "maintained",
        aliases: unique([identifier, row[adapter.title_column]]),
        tags: ["structured-source", slug(adapter.kind)],
        identifiers: [identifier],
        headings: [],
        routes: [],
        content: null,
        metadata: { source_path: adapter.path, source_row_number: index + 2 }
      });
      addEdge(STRUCTURED_HUB_ID, nodeId, "contains");
      addEdge(nodeId, fileNodeByPackagePath.get(adapter.path), "defined-in");
      for (const column of adapter.task_columns) {
        const cell = String(row[column] ?? "");
        for (const taskId of [...taskIds, ...source.allowed_historical_task_ids]) {
          if (!new RegExp(`(^|[^A-Z0-9-])${escapeRegExp(taskId)}([^A-Z0-9-]|$)`).test(cell)) continue;
          const target = taskNodeId(taskId);
          if (target) addEdge(nodeId, target, "maps-to-task");
        }
      }
    });
  }

  const semanticNodesByIdentifier = new Map();
  for (const node of nodes.values()) {
    if (node.path !== null || ["hub", "semantic-route"].includes(node.kind)) continue;
    for (const identifier of node.identifiers) {
      if (!semanticNodesByIdentifier.has(identifier)) semanticNodesByIdentifier.set(identifier, []);
      semanticNodesByIdentifier.get(identifier).push(node.id);
    }
  }
  for (const reference of pendingEvidenceReferences) {
    const targets = semanticNodesByIdentifier.get(reference.identifier) ?? [];
    if (!targets.length) {
      warnings.push(`evidence ${reference.evidenceId} references an identifier not modeled as a claim, task, or structured entity: ${reference.identifier}`);
      continue;
    }
    for (const target of targets) addEdge(reference.evidenceNodeId, target, slug(reference.relationship) || "relates-to-entity");
  }

  const ledgerPath = path.join(pkgRoot, "proof_records/proof_ledger.jsonl");
  const ledgerRows = fs.readFileSync(ledgerPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const portableProofPath = (proofUri) => {
    const value = String(proofUri ?? "");
    if (path.isAbsolute(value)) return `proof_records/${path.basename(value)}`;
    return value.replace(/^planning-spine-v0\//, "");
  };
  const latestByPortablePath = new Map();
  for (const row of ledgerRows) latestByPortablePath.set(portableProofPath(row.proof_uri), row);
  for (const row of ledgerRows) {
    const nodeId = `proof-ledger:${row.sequence}`;
    addNode({
      id: nodeId,
      kind: "proof-ledger-entry",
      title: `${row.task_id} proof revision ${row.revision ?? "legacy"}`,
      description: `Accepted ledger sequence ${row.sequence} with status ${row.status} and digest ${row.proof_sha256}.`,
      path: null,
      status: row.status,
      authority_class: "exact-evidence",
      lifecycle: "append-only",
      aliases: [row.task_id, `${row.task_id} revision ${row.revision ?? "legacy"}`],
      tags: ["proof", "ledger", slug(row.status)],
      identifiers: [row.task_id, String(row.sequence), row.proof_sha256],
      headings: [],
      routes: ["proof-and-verification"],
      content: null,
      metadata: {
        sequence: row.sequence,
        revision: row.revision,
        proof_uri: row.proof_uri,
        proof_sha256: row.proof_sha256,
        observed_at: row.observed_at
      }
    });
    addEdge(PROOF_HUB_ID, nodeId, "contains");
    addEdge(nodeId, fileNodeByPackagePath.get("proof_records/proof_ledger.jsonl"), "recorded-in");
    const subject = taskNodeId(row.task_id);
    if (subject) addEdge(nodeId, subject, "proves-task");
    const proofPath = portableProofPath(row.proof_uri);
    const proofNode = fileNodeByPackagePath.get(proofPath);
    if (!proofNode) errors.push(`ledger sequence ${row.sequence} proof URI does not resolve: ${row.proof_uri}`);
    else {
      addEdge(nodeId, proofNode, "proof-artifact");
      if (latestByPortablePath.get(proofPath) === row && nodes.get(proofNode).content.sha256 !== row.proof_sha256) {
        errors.push(`latest ledger digest mismatch for ${row.proof_uri}`);
      }
    }
  }
  checks.push({ name: "ledger_uris_and_latest_digests_resolve", result: errors.some((error) => error.startsWith("ledger sequence") || error.startsWith("latest ledger")) ? "fail" : "pass", observed: ledgerRows.length });

  const artifactCatalogPath = "1.0_VISION/Notebooklm/artifacts.meta.json";
  const artifactCatalog = JSON.parse(fs.readFileSync(path.join(pkgRoot, artifactCatalogPath), "utf8"));
  for (const artifact of artifactCatalog.artifacts) {
    const nodeId = `raw-artifact:${artifact.id}`;
    const artifactPath = artifact.path.replace(/^\.\//, "1.0_VISION/Notebooklm/");
    addNode({
      id: nodeId,
      kind: "raw-artifact",
      title: artifact.title || artifact.id,
      description: `${artifact.artifact_type}; exact bytes cataloged with incomplete provenance and no implementation authority.`,
      path: null,
      status: artifact.provenance.identity_status,
      authority_class: "architecture-input",
      lifecycle: "immutable-source",
      aliases: [artifact.id, artifact.title].filter(Boolean),
      tags: ["raw-artifact", "notebooklm", slug(artifact.artifact_type)],
      identifiers: [artifact.id, artifact.sha256],
      headings: [],
      routes: ["notebooklm-provenance"],
      content: null,
      metadata: {
        sha256: artifact.sha256,
        byte_count: artifact.byte_count,
        newline_count: artifact.newline_count,
        provenance: artifact.provenance
      }
    });
    addEdge(SOURCE_HUB_ID, nodeId, "contains");
    addEdge(fileNodeByPackagePath.get(artifactCatalogPath), nodeId, "catalogs");
    if (fileNodeByPackagePath.has(artifactPath)) addEdge(nodeId, fileNodeByPackagePath.get(artifactPath), "identifies-bytes");
    else errors.push(`raw artifact catalog path is not indexed: ${artifact.path}`);
  }

  const requiredArtifactLinkErrors = [];
  const hasEdge = (from, to, kind) => [...edges.values()].some((edge) => edge.from === from && edge.to === to && edge.kind === kind);
  for (const requirement of source.required_artifact_links ?? []) {
    const artifact = artifactCatalog.artifacts.find((candidate) => candidate.id === requirement.artifact_id);
    const artifactNodeId = `raw-artifact:${requirement.artifact_id}`;
    const fileNodeId = fileNodeByPackagePath.get(requirement.path);
    const crossReferenceNodeId = fileNodeByPackagePath.get(requirement.cross_reference);
    const frontmatterSource = nodes.get(crossReferenceNodeId)?.metadata?.frontmatter?.source_artifact;
    if (!artifact) requiredArtifactLinkErrors.push(`${requirement.artifact_id} is absent from ${artifactCatalogPath}`);
    if (!fileNodeId) requiredArtifactLinkErrors.push(`${requirement.path} is absent from the file inventory`);
    if (!crossReferenceNodeId) requiredArtifactLinkErrors.push(`${requirement.cross_reference} is absent from the file inventory`);
    if (artifact?.path !== requirement.path || artifact?.sha256 !== requirement.sha256) {
      requiredArtifactLinkErrors.push(`${requirement.artifact_id} catalog identity does not match its required path and SHA-256`);
    }
    if (fileNodeId && nodes.get(fileNodeId)?.content?.sha256 !== requirement.sha256) {
      requiredArtifactLinkErrors.push(`${requirement.path} bytes do not match required SHA-256 ${requirement.sha256}`);
    }
    if (!hasEdge(artifactNodeId, fileNodeId, "identifies-bytes")) {
      requiredArtifactLinkErrors.push(`${requirement.artifact_id} does not identify its exact file node`);
    }
    if (!hasEdge(crossReferenceNodeId, fileNodeId, "markdown-link") || !hasEdge(crossReferenceNodeId, fileNodeId, "wiki-link")) {
      requiredArtifactLinkErrors.push(`${requirement.cross_reference} must retain Markdown and wiki links to ${requirement.path}`);
    }
    if (frontmatterSource?.path !== requirement.path || frontmatterSource?.sha256 !== requirement.sha256) {
      requiredArtifactLinkErrors.push(`${requirement.cross_reference} frontmatter does not bind the required artifact path and SHA-256`);
    }
  }
  errors.push(...requiredArtifactLinkErrors.map((error) => `required artifact link: ${error}`));
  checks.push({
    name: "required_artifacts_are_hash_bound_and_cross_referenced",
    result: requiredArtifactLinkErrors.length ? "fail" : "pass",
    observed: (source.required_artifact_links ?? []).length
  });

  const routeMembership = new Map();
  for (const route of source.routes) {
    routeMembership.set(route.id, new Set());
    for (const node of nodes.values()) {
      if (node.kind === "semantic-route" || node.kind === "hub" || node.kind === "directory" || node.id === source.root_node_id) continue;
      const packagePath = node.metadata?.package_path;
      const taskPrefixMatch = node.identifiers.some((identifier) => (route.task_prefixes ?? []).some((prefix) => identifier.startsWith(prefix)));
      const pathMatch = packagePath && (route.entrypoints.includes(packagePath) || route.path_prefixes.some((prefix) => packagePath.startsWith(prefix)));
      const searchText = [node.title, node.description, node.path, ...node.aliases, ...node.tags, ...node.identifiers, ...node.headings, contentByNode.get(node.id) ?? ""]
        .join(" ")
        .toLowerCase();
      const keywordMatch = route.keywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
      if (taskPrefixMatch || pathMatch || keywordMatch || node.routes.includes(route.id)) {
        routeMembership.get(route.id).add(node.id);
        addEdge(`route:${route.id}`, node.id, route.entrypoints.includes(packagePath) ? "entrypoint" : "routes-to");
      }
    }
  }
  for (const route of source.routes) {
    const entrypointNodes = route.entrypoints.map((entrypoint) => fileNodeByPackagePath.get(entrypoint)).filter(Boolean);
    if (entrypointNodes.length !== route.entrypoints.length) errors.push(`route ${route.id} has a missing entrypoint`);
    if (!routeMembership.get(route.id).size) errors.push(`route ${route.id} has no resources`);
  }
  checks.push({ name: "semantic_routes_have_entrypoints_and_resources", result: errors.some((error) => error.startsWith("route ")) ? "fail" : "pass", observed: source.routes.length });

  for (const node of nodes.values()) {
    node.routes = source.routes.filter((route) => routeMembership.get(route.id)?.has(node.id)).map((route) => route.id);
  }

  const sortedEdges = [...edges.values()].sort((left, right) =>
    left.from.localeCompare(right.from) || left.kind.localeCompare(right.kind) || left.to.localeCompare(right.to) || String(left.detail ?? "").localeCompare(String(right.detail ?? ""))
  );
  for (const edge of sortedEdges) {
    if (!nodes.has(edge.from)) errors.push(`edge source does not resolve: ${edge.from}`);
    if (!nodes.has(edge.to)) errors.push(`edge target does not resolve: ${edge.to}`);
  }

  const incomingCounts = {};
  const outgoingCounts = {};
  for (const edge of sortedEdges) {
    incomingCounts[edge.to] = (incomingCounts[edge.to] ?? 0) + 1;
    outgoingCounts[edge.from] = (outgoingCounts[edge.from] ?? 0) + 1;
  }
  for (const node of nodes.values()) {
    node.relations = { incoming: incomingCounts[node.id] ?? 0, outgoing: outgoingCounts[node.id] ?? 0 };
    if (!node.title || !node.description || !node.kind || !node.authority_class || !node.lifecycle || !Array.isArray(node.aliases) || !Array.isArray(node.tags)) {
      errors.push(`node metadata incomplete: ${node.id}`);
    }
  }
  checks.push({ name: "every_node_has_rich_metadata", result: errors.some((error) => error.startsWith("node metadata incomplete")) ? "fail" : "pass", observed: nodes.size });

  const adjacency = new Map();
  for (const edge of sortedEdges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  const visited = new Set();
  const queue = [source.root_node_id];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  const unreachable = [...nodes.keys()].filter((nodeId) => !visited.has(nodeId));
  if (unreachable.length) errors.push(`unreachable nodes from root: ${unreachable.join(", ")}`);
  checks.push({ name: "all_nodes_reachable_from_root", result: unreachable.length ? "fail" : "pass", observed: unreachable.length });

  const fileNodeCount = [...nodes.values()].filter((node) => node.id.startsWith("file:planning-spine-v0/")).length;
  if (fileNodeCount !== includedFiles.length) errors.push(`file inventory mismatch: ${fileNodeCount} nodes for ${includedFiles.length} included files`);
  checks.push({ name: "every_included_file_has_one_node", result: fileNodeCount === includedFiles.length ? "pass" : "fail", observed: fileNodeCount, expected: includedFiles.length });

  if (unresolvedLinks.length) {
    warnings.push(`${unresolvedLinks.length} non-gated or strict link target(s) are unresolved; strict failures are listed in errors.`);
  }
  if (historicalTaskIds.size) {
    warnings.push(`${historicalTaskIds.size} explicit historical proof subject(s) are absent from the current task graph and retained as historical-task nodes.`);
  }
  const cacheArtifacts = excludedExisting.filter((item) => /(?:__pycache__|\.py[co]$|\.pid$|\.pytest_cache)/.test(item));
  if (cacheArtifacts.length) warnings.push(`${cacheArtifacts.length} local cache/process artifact(s) were excluded from navigation.`);
  warnings.push("GitNexus and GitKB are optional projections, never planning authority; verify each tool's repository and worktree identity before using its results.");

  const sortedNodes = [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
  const inventoryInputs = [...nodes.values()].filter((node) => (
    node.path
    && node.content
    && !node.metadata?.self_excluded
    && node.authority_class !== "external-reference"
  ));
  const inventoryIdentity = inventoryInputs
    .map((node) => `${node.path}\u0000${node.content.sha256 ?? "volatile"}\u0000${node.content.byte_count}`)
    .sort()
    .join("\n");
  const inventorySha256 = sha256Bytes(inventoryIdentity);
  const sourceSha256 = sha256Bytes(sourceBytes);

  const graph = {
    schema_version: "lifeos-planning-spine.navigation-graph.v0",
    id: "lifeos.planning-spine.v0.navigation-graph",
    title: "LifeOS Planning Spine Navigation Graph",
    description: "Deterministic file, task, claim, evidence, proof, and semantic-route graph for agent recall.",
    source: {
      path: "planning-spine-v0/navigation/source.json",
      sha256: sourceSha256,
      inventory_sha256: inventorySha256,
      deterministic: true,
      generated_at: null
    },
    root_node_id: source.root_node_id,
    nodes: sortedNodes,
    edges: sortedEdges
  };

  const byPath = {};
  const byKind = {};
  const byTaskId = Object.fromEntries([
    ...[...taskIds].map((identifier) => [identifier, `task:${identifier}`]),
    ...[...historicalTaskIds].map((identifier) => [identifier, `historical-task:${identifier}`])
  ].sort(([left], [right]) => left.localeCompare(right)));
  const byClaimId = Object.fromEntries([...claimIds].sort().map((identifier) => [identifier, `claim:${identifier}`]));
  const bySourceId = Object.fromEntries([...sourceIds].sort().map((identifier) => [identifier, `source:${identifier}`]));
  const byAlias = {};
  const byTag = {};
  const byRoute = {};
  const records = {};
  for (const node of sortedNodes) {
    if (node.path) byPath[node.path] = node.id;
    addLookup(byKind, node.kind, node.id);
    for (const alias of node.aliases) addLookup(byAlias, normalizeLookup(alias), node.id);
    for (const tag of node.tags) addLookup(byTag, normalizeLookup(tag), node.id);
    for (const route of node.routes) addLookup(byRoute, route, node.id);
    records[node.id] = {
      title: node.title,
      description: node.description,
      kind: node.kind,
      path: node.path,
      status: node.status,
      authority_class: node.authority_class,
      lifecycle: node.lifecycle,
      aliases: node.aliases,
      tags: node.tags,
      identifiers: node.identifiers,
      headings: node.headings,
      routes: node.routes
    };
  }
  const index = {
    schema_version: "lifeos-planning-spine.navigation-index.v0",
    id: "lifeos.planning-spine.v0.navigation-index",
    title: "LifeOS Planning Spine Agent Recall Index",
    description: "Compact exact lookup and neighbor index derived from the navigation graph.",
    source: {
      graph_path: "planning-spine-v0/navigation/generated/navigation_graph.json",
      source_sha256: sourceSha256,
      inventory_sha256: inventorySha256,
      deterministic: true,
      generated_at: null
    },
    entrypoints: source.entrypoints.map((packagePath) => ({
      path: `planning-spine-v0/${packagePath}`,
      node_id: fileNodeByPackagePath.get(packagePath) ?? null
    })),
    records,
    by_path: Object.fromEntries(Object.entries(byPath).sort(([left], [right]) => left.localeCompare(right))),
    by_kind: sortObjectOfArrays(byKind),
    by_task_id: byTaskId,
    by_claim_id: byClaimId,
    by_source_id: bySourceId,
    by_alias: sortObjectOfArrays(byAlias),
    by_tag: sortObjectOfArrays(byTag),
    by_route: sortObjectOfArrays(byRoute)
  };

  const kindCounts = {};
  const authorityCounts = {};
  for (const node of sortedNodes) {
    kindCounts[node.kind] = (kindCounts[node.kind] ?? 0) + 1;
    authorityCounts[node.authority_class] = (authorityCounts[node.authority_class] ?? 0) + 1;
  }
  const schemaCheck = {
    name: "generated_artifacts_match_declared_schemas",
    result: "pass",
    observed: Object.keys(NAVIGATION_SCHEMA_PATHS).length
  };
  checks.push(schemaCheck);
  const validation = {
    schema_version: "lifeos-planning-spine.navigation-validation.v0",
    source_path: "planning-spine-v0/navigation/source.json",
    source_sha256: sourceSha256,
    inventory_sha256: inventorySha256,
    result: errors.length || checks.some((check) => check.result === "fail") ? "fail" : "pass",
    deterministic: true,
    generated_at: null,
    counts: {
      included_package_files: includedFiles.length,
      repository_local_link_targets: inventoryInputs.filter((node) => node.metadata?.package_path === null).length,
      external_link_targets: [...nodes.values()].filter((node) => node.authority_class === "external-reference").length,
      nodes: sortedNodes.length,
      edges: sortedEdges.length,
      tasks: taskIds.size,
      historical_tasks: historicalTaskIds.size,
      notebooklm_sources: sourceRows.length,
      claims: claimRows.length,
      verification_queue_items: queueRows.length,
      evidence_records: evidenceRows.length,
      proof_ledger_entries: ledgerRows.length,
      semantic_routes: source.routes.length,
      unresolved_links: unresolvedLinks.length,
      strict_unresolved_links: strictUnresolved.length,
      excluded_existing_paths: excludedExisting.length
    },
    kind_counts: Object.fromEntries(Object.entries(kindCounts).sort(([left], [right]) => left.localeCompare(right))),
    authority_counts: Object.fromEntries(Object.entries(authorityCounts).sort(([left], [right]) => left.localeCompare(right))),
    checks,
    historical_task_ids: [...historicalTaskIds].sort(),
    excluded_existing_paths: excludedExisting.sort(),
    unresolved_links: unresolvedLinks,
    warnings,
    errors
  };
  const artifacts = { source, graph, index, validation, outputs: source.outputs, repoRoot, pkgRoot };
  const schemaValidation = validateNavigationArtifactSchemas(artifacts);
  if (!schemaValidation.ok) {
    schemaCheck.result = "fail";
    schemaCheck.observed = schemaValidation.errors.length;
    errors.push(...schemaValidation.errors.map((error) => `schema validation: ${error}`));
    validation.result = "fail";
  }
  return artifacts;
}

export function renderNavigationArtifacts(artifacts) {
  return {
    [artifacts.outputs.graph]: stableJson(artifacts.graph),
    [artifacts.outputs.index]: stableJson(artifacts.index),
    [artifacts.outputs.validation]: stableJson(artifacts.validation)
  };
}

export function writeNavigationArtifacts(options = {}) {
  const artifacts = buildNavigationArtifacts(options);
  if (artifacts.validation.result !== "pass") {
    throw new Error(`navigation generation failed: ${artifacts.validation.errors.join("; ")}`);
  }
  const rendered = renderNavigationArtifacts(artifacts);
  for (const [relativePath, contents] of Object.entries(rendered)) {
    const outputPath = path.join(artifacts.pkgRoot, relativePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, contents, "utf8");
  }
  return artifacts;
}

export function checkNavigationArtifacts(options = {}) {
  const artifacts = buildNavigationArtifacts(options);
  const rendered = renderNavigationArtifacts(artifacts);
  const drift = [];
  for (const [relativePath, expected] of Object.entries(rendered)) {
    const outputPath = path.join(artifacts.pkgRoot, relativePath);
    if (!fs.existsSync(outputPath)) drift.push(`${relativePath} is missing`);
    else if (fs.readFileSync(outputPath, "utf8") !== expected) drift.push(`${relativePath} is stale`);
  }
  if (artifacts.validation.result !== "pass") drift.push(...artifacts.validation.errors);
  return { ok: drift.length === 0, drift, artifacts };
}

export function searchNavigationIndex(index, query, limit = 12) {
  const normalizedQuery = normalizeLookup(query);
  const terms = normalizedQuery.split(" ").filter(Boolean);
  if (!terms.length) return [];
  const results = [];
  for (const [nodeId, record] of Object.entries(index.records)) {
    const normalized = {
      id: normalizeLookup(nodeId),
      title: normalizeLookup(record.title),
      description: normalizeLookup(record.description),
      path: normalizeLookup(record.path ?? ""),
      aliases: record.aliases.map(normalizeLookup),
      tags: record.tags.map(normalizeLookup),
      identifiers: record.identifiers.map(normalizeLookup),
      headings: record.headings.map(normalizeLookup),
      routes: record.routes.map(normalizeLookup)
    };
    let score = 0;
    const matched = [];
    if (normalized.id === normalizedQuery || normalized.path === normalizedQuery || normalized.aliases.includes(normalizedQuery) || normalized.identifiers.includes(normalizedQuery)) {
      score += 150;
      matched.push("exact");
    }
    if (["task", "historical-task", "claim", "notebooklm-source", "claim-evidence", "verification-queue-item"].includes(record.kind)
      && normalized.identifiers.includes(normalizedQuery)) {
      score += 100;
      matched.push("primary-entity");
    }
    for (const term of terms) {
      let termScore = 0;
      if (normalized.identifiers.some((value) => value.includes(term))) termScore = Math.max(termScore, 35);
      if (normalized.aliases.some((value) => value.includes(term))) termScore = Math.max(termScore, 28);
      if (normalized.title.includes(term)) termScore = Math.max(termScore, 24);
      if (normalized.tags.some((value) => value.includes(term))) termScore = Math.max(termScore, 18);
      if (normalized.routes.some((value) => value.includes(term))) termScore = Math.max(termScore, 16);
      if (normalized.path.includes(term)) termScore = Math.max(termScore, 12);
      if (normalized.headings.some((value) => value.includes(term))) termScore = Math.max(termScore, 10);
      if (normalized.description.includes(term)) termScore = Math.max(termScore, 7);
      if (termScore) matched.push(term);
      score += termScore;
    }
    if (score) results.push({ node_id: nodeId, score, matched: unique(matched), ...record });
  }
  return results.sort((left, right) => right.score - left.score || left.node_id.localeCompare(right.node_id)).slice(0, limit);
}

export function explainNavigationNode(graph, index, query) {
  const nodeId = index.records[query]
    ? query
    : index.by_path[query]
      ?? index.by_path[`planning-spine-v0/${query}`]
      ?? searchNavigationIndex(index, query, 1)[0]?.node_id;
  if (!nodeId) throw new Error(`No navigation node matches: ${query}`);
  const incoming = [];
  const outgoing = [];
  for (const edge of graph.edges) {
    if (edge.to === nodeId) incoming.push(edge.detail ? [edge.kind, edge.from, edge.detail] : [edge.kind, edge.from]);
    if (edge.from === nodeId) outgoing.push(edge.detail ? [edge.kind, edge.to, edge.detail] : [edge.kind, edge.to]);
  }
  return { node_id: nodeId, record: index.records[nodeId], incoming, outgoing };
}

function printSearchResults(index, query, jsonOutput) {
  const results = searchNavigationIndex(index, query);
  if (jsonOutput) {
    console.log(JSON.stringify({ query, result_count: results.length, results }, null, 2));
    return;
  }
  if (!results.length) {
    console.log(`No navigation results for: ${query}`);
    return;
  }
  for (const result of results) {
    console.log(`${result.score}\t${result.node_id}\t${result.title}${result.path ? `\t${result.path}` : ""}`);
  }
}

function printExplanation(graph, index, query, jsonOutput) {
  const explanation = explainNavigationNode(graph, index, query);
  if (jsonOutput) console.log(JSON.stringify(explanation, null, 2));
  else {
    console.log(`${explanation.node_id}\n${explanation.record.title}\n${explanation.record.description}`);
    console.log(`incoming=${explanation.incoming.length} outgoing=${explanation.outgoing.length}`);
    for (const edge of explanation.outgoing.slice(0, 20)) console.log(`  ${edge[0]} -> ${edge[1]}`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const jsonOutput = args.includes("--json");
  if (args.includes("--check")) {
    const result = checkNavigationArtifacts();
    if (!result.ok) {
      console.error(`planning-spine navigation check failed:\n- ${result.drift.join("\n- ")}`);
      process.exit(1);
    }
    console.log(`planning-spine navigation check passed: ${result.artifacts.graph.nodes.length} nodes, ${result.artifacts.graph.edges.length} edges`);
    return;
  }
  const queryIndex = args.indexOf("--query");
  const explainIndex = args.indexOf("--explain");
  if (queryIndex >= 0 || explainIndex >= 0) {
    const indexPath = path.join(process.cwd(), "planning-spine-v0/navigation/generated/navigation_index.json");
    if (!fs.existsSync(indexPath)) throw new Error("Navigation index is missing; run with --write first");
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (queryIndex >= 0) printSearchResults(index, args[queryIndex + 1] ?? "", jsonOutput);
    else {
      const graphPath = path.join(process.cwd(), "planning-spine-v0/navigation/generated/navigation_graph.json");
      if (!fs.existsSync(graphPath)) throw new Error("Navigation graph is missing; run with --write first");
      const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
      printExplanation(graph, index, args[explainIndex + 1] ?? "", jsonOutput);
    }
    return;
  }
  const artifacts = writeNavigationArtifacts();
  console.log(`planning-spine navigation generated: ${artifacts.graph.nodes.length} nodes, ${artifacts.graph.edges.length} edges`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`planning-spine navigation: ${error.message}`);
    process.exit(1);
  });
}
