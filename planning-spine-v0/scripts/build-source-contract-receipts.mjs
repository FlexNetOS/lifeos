import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const metaRoot = path.resolve(repoRoot, "../..");
const registryPath = path.join(metaRoot, ".meta.yaml");
const outputPath = path.join(
  repoRoot,
  "planning-spine-v0",
  "1.0_VISION",
  "Architecture_Anchors",
  "source_contract_receipts.json"
);
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";

const GLOBAL_CONTRACTS = [
  "/home/flexnetos/.codex/AGENTS.md",
  "/home/flexnetos/.codex/AGENTS.rtk.md",
  "/home/flexnetos/.codex/RTK.md",
  "/home/flexnetos/.codex/RULES.md",
  "/home/flexnetos/meta/AGENTS.md",
  "/home/flexnetos/meta/.kb/AGENTS.md",
  "/home/flexnetos/meta/.claude/skills/gitkb/PROCESS.md"
];

const EXACT_CONTRACTS = /^(AGENTS|CLAUDE|RULES|RTK|CONTRIBUTING|SECURITY|ARCHITECTURE|BUILD|BUILDING|DEVELOPMENT|DEVELOPING|TESTING|RELEASE|RELEASING|DEPLOYMENT|OPERATIONS)(\.[^.]+)?$/i;
const README = /^README(?:[._-].*)?(?:\.[^.]+)?$/i;
const DOCUMENT_EXTENSION = /\.(md|mdx|rst|adoc|txt)$/i;
const CONTRACT_DIRECTORY = /(^|\/)(docs?|documentation|architecture|security|testing|build|development|deploy|release|integration|contributing)(\/|$)/i;
const PLANNING_CONTRACT = /(^|\/)planning-spine-v0\/(README\.md|0[0-9]_[^/]+\.md|navigation\/README\.md|docs\/authority\/[^/]+\.md|1\.0_VISION\/(README\.md|ARCHITECTURE_BLUEPRINT_[^/]+\.md|Architecture_Anchors\/README\.md))$/i;
const EXCLUDED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "target",
  "dist",
  "build",
  "coverage",
  "generated",
  "fixtures",
  "testdata",
  "archives",
  "archive",
  "vendor",
  "third_party",
  ".claude",
  ".codex"
]);

function run(cwd, command, args, { allowFailure = false, encoding = "utf8" } = {}) {
  try {
    return execFileSync(rtk, ["proxy", command, ...args], {
      cwd,
      encoding,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 128 * 1024 * 1024
    });
  } catch (error) {
    if (!allowFailure) throw error;
    return null;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function lineCount(bytes) {
  if (bytes.length === 0) return 0;
  let count = 0;
  for (const byte of bytes) if (byte === 0x0a) count += 1;
  return count + (bytes.at(-1) === 0x0a ? 0 : 1);
}

function parseRegistry(text) {
  const projects = [];
  let active = null;
  for (const line of text.split("\n")) {
    const project = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (project) {
      active = { name: project[1], path: null, remote: null };
      projects.push(active);
      continue;
    }
    if (!active) continue;
    const field = /^    (repo|path):\s*(.+?)\s*$/.exec(line);
    if (!field) continue;
    active[field[1] === "repo" ? "remote" : "path"] = field[2];
  }
  projects.push({
    name: "meta",
    path: ".",
    remote: "git@github.com:FlexNetOS/meta.git"
  });
  return projects.sort((left, right) => left.name.localeCompare(right.name));
}

function repositoryPath(repository) {
  if (repository.path === ".") return metaRoot;
  const candidates = [
    repository.path ? path.join(metaRoot, repository.path) : null,
    path.join(metaRoot, repository.name),
    path.join(metaRoot, "src", repository.name)
  ].filter(Boolean);
  return candidates.find((candidate) => isRepository(candidate)) ?? candidates.at(0) ?? null;
}

function isRepository(directory) {
  if (!directory || !fs.existsSync(directory)) return false;
  return run(directory, "git", ["rev-parse", "--is-inside-work-tree"], {
    allowFailure: true
  })?.trim() === "true";
}

function isExcluded(relativePath) {
  return relativePath.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function isContract(relativePath) {
  if (isExcluded(relativePath)) return false;
  const base = path.posix.basename(relativePath);
  if (README.test(base) || EXACT_CONTRACTS.test(base)) return true;
  if (PLANNING_CONTRACT.test(relativePath)) return true;
  return DOCUMENT_EXTENSION.test(base) && CONTRACT_DIRECTORY.test(relativePath);
}

function purpose(relativePath) {
  const base = path.posix.basename(relativePath).toLowerCase();
  const value = relativePath.toLowerCase();
  if (base === "agents.md" || base === "rules.md" || base === "rtk.md") {
    return "operating-contract";
  }
  if (README.test(base)) return "repository-or-component-orientation";
  if (/security/.test(value)) return "security-contract";
  if (/architecture|design/.test(value)) return "architecture-contract";
  if (/build|develop/.test(value)) return "build-development-contract";
  if (/test/.test(value)) return "testing-contract";
  if (/release|deploy|operations/.test(value)) return "release-operations-contract";
  if (/contribut/.test(value)) return "contribution-contract";
  if (/proof[_-]?ledger/.test(value)) return "proof-ledger-contract";
  return "first-party-documentation-contract";
}

function applicability(relativePath) {
  const base = path.posix.basename(relativePath).toLowerCase();
  const value = relativePath.toLowerCase();
  if (base === "agents.md" || base === "rules.md" || base === "rtk.md") {
    return "mandatory-current-operating-contract";
  }
  if (/(^|\/)(history|historical|deprecated|legacy)(\/|$)/.test(value)) {
    return "lower-authority-historical-input";
  }
  if (README.test(base)) return "mandatory-repository-or-component-context";
  return "mandatory-when-repository-or-component-is-touched";
}

function disposition(relativePath) {
  const app = applicability(relativePath);
  if (app === "lower-authority-historical-input") {
    return "read-and-classified; retained for provenance; not promoted over maintained contracts";
  }
  if (app === "mandatory-current-operating-contract") {
    return "read-and-applied; controls work under its directory scope";
  }
  return "read-and-applied for repository discovery, dependency selection, and verification gates";
}

function headings(bytes) {
  if (bytes.includes(0)) return [];
  const text = bytes.toString("utf8");
  const rows = [];
  for (const [index, line] of text.split("\n").entries()) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) rows.push({ line: index + 1, level: heading[1].length, text: heading[2] });
  }
  return rows;
}

function conflictMarkers(bytes) {
  if (bytes.includes(0)) return [];
  const text = bytes.toString("utf8");
  const markers = [];
  const checks = [
    ["optional-language", /\boptional(?:ly)?\b/i],
    ["non-bun-js-tooling", /\b(?:npm|npx|pnpm|yarn)\b/i],
    ["noncanonical-durable-storage", /\b(?:sqlite|json file|app[_ -]?data)\b/i],
    ["stale-runtime-frontdoor", /~\/\.local\/bin|\/home\/flexnetos\/\.local\/bin|\/nix\/store\//i],
    ["framework-conflict-candidate", /\b(?:svelte|react)\b/i]
  ];
  for (const [name, pattern] of checks) if (pattern.test(text)) markers.push(name);
  return markers;
}

function gitText(directory, args, allowFailure = false) {
  return run(directory, "git", args, { allowFailure })?.trim() ?? null;
}

function trackedPaths(directory) {
  const atHead = run(directory, "git", ["ls-tree", "-rz", "--name-only", "HEAD"], {
    encoding: null
  });
  const inIndex = run(directory, "git", ["ls-files", "-z"], { encoding: null });
  return [...new Set(
    Buffer.concat([atHead, inIndex])
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .filter(isContract)
  )].sort();
}

function committedBytes(directory, relativePath) {
  return run(directory, "git", ["show", `HEAD:${relativePath}`], {
    allowFailure: true,
    encoding: null
  });
}

function workingTreeBytes(workingPath) {
  if (!fs.existsSync(workingPath)) return null;
  const stat = fs.lstatSync(workingPath);
  if (stat.isSymbolicLink()) return Buffer.from(fs.readlinkSync(workingPath));
  if (stat.isFile()) return fs.readFileSync(workingPath);
  return null;
}

function parseWorktrees(text, repositoryName) {
  const rows = [];
  let row = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (row) rows.push(row);
      row = {
        repository: repositoryName,
        path: line.slice("worktree ".length),
        head: null,
        branch: null,
        detached: false,
        locked: false,
        prunable: false
      };
    } else if (row && line.startsWith("HEAD ")) {
      row.head = line.slice("HEAD ".length);
    } else if (row && line.startsWith("branch ")) {
      row.branch = line.slice("branch refs/heads/".length);
    } else if (row && line === "detached") {
      row.detached = true;
    } else if (row && line.startsWith("locked")) {
      row.locked = true;
    } else if (row && line.startsWith("prunable")) {
      row.prunable = true;
    }
  }
  if (row) rows.push(row);
  return rows;
}

function repositoryReceipt(repository) {
  const absolutePath = repositoryPath(repository);
  if (!isRepository(absolutePath)) {
    return {
      ...repository,
      absolute_path: absolutePath,
      availability: "missing-from-active-workspace",
      commit: null,
      branch: null,
      origin: null,
      origin_is_flexnetos_ssh: false,
      status: [],
      status_sha256: sha256(""),
      contracts: [],
      worktrees: []
    };
  }

  const commit = gitText(absolutePath, ["rev-parse", "HEAD"]);
  const branch = gitText(absolutePath, ["branch", "--show-current"]);
  const origin = gitText(absolutePath, ["remote", "get-url", "origin"], true);
  const statusText = run(absolutePath, "git", ["status", "--porcelain=v1", "--untracked-files=all"]);
  const status = statusText.split("\n").filter(Boolean);
  const contracts = trackedPaths(absolutePath).map((relativePath) => {
    const committed = committedBytes(absolutePath, relativePath);
    const workingPath = path.join(absolutePath, relativePath);
    const working = workingTreeBytes(workingPath);
    const authoritative = working ?? committed ?? Buffer.alloc(0);
    const fileHeadings = headings(authoritative);
    return {
      path: relativePath,
      absolute_path: workingPath,
      purpose: purpose(relativePath),
      applicability: applicability(relativePath),
      disposition: disposition(relativePath),
      mandatory_formerly_optional: true,
      bytes: authoritative.length,
      lines: lineCount(authoritative),
      sha256: sha256(authoritative),
      committed_sha256: committed ? sha256(committed) : null,
      working_tree_sha256: working ? sha256(working) : null,
      working_tree_differs_from_commit:
        committed && working ? !committed.equals(working) : committed === null,
      heading_count: fileHeadings.length,
      headings_sha256: sha256(stableJson(fileHeadings)),
      conflict_markers: conflictMarkers(authoritative)
    };
  });
  const worktreeText = run(absolutePath, "git", ["worktree", "list", "--porcelain"]);
  return {
    ...repository,
    absolute_path: absolutePath,
    availability: "available",
    commit,
    branch: branch || null,
    origin,
    origin_is_flexnetos_ssh: /^git@github\.com:FlexNetOS\//.test(origin ?? ""),
    status,
    status_sha256: sha256(statusText),
    contracts,
    worktrees: parseWorktrees(worktreeText, repository.name)
  };
}

function globalContractReceipt(absolutePath) {
  if (!fs.existsSync(absolutePath)) {
    return {
      absolute_path: absolutePath,
      availability: "missing-required-contract",
      sha256: null,
      bytes: null,
      lines: null,
      purpose: "operating-contract",
      applicability: "mandatory-current-operating-contract",
      disposition: "blocking-gap; owning source/config must materialize this contract"
    };
  }
  const bytes = fs.readFileSync(absolutePath);
  return {
    absolute_path: absolutePath,
    availability: "available",
    sha256: sha256(bytes),
    bytes: bytes.length,
    lines: lineCount(bytes),
    purpose: "operating-contract",
    applicability: "mandatory-current-operating-contract",
    disposition: "read-and-applied",
    headings: headings(bytes)
  };
}

function receipt() {
  const registryBytes = fs.readFileSync(registryPath);
  const repositories = parseRegistry(registryBytes.toString("utf8")).map(repositoryReceipt);
  let sequence = 0;
  for (const repository of repositories) {
    for (const contract of repository.contracts) {
      sequence += 1;
      contract.requirement_id = `SOURCE-CONTRACT-${String(sequence).padStart(5, "0")}`;
    }
  }
  const worktrees = repositories
    .flatMap((repository) => repository.worktrees)
    .filter(
      (worktree, index, rows) =>
        rows.findIndex((candidate) => candidate.path === worktree.path) === index
    )
    .sort((left, right) => left.path.localeCompare(right.path));
  const contracts = repositories.flatMap((repository) => repository.contracts);
  const globalContracts = GLOBAL_CONTRACTS.map(globalContractReceipt);
  return {
    schema_version: "lifeos-planning-spine.source-contract-receipts.v2",
    authority_order: [
      "current owner instructions and applicable AGENTS.md, RULES.md, RTK, and repository contracts",
      "immutable architecture anchor",
      "owner-ratified decisions and maintained implementation contracts",
      "canonical task, claim, proof-ledger, and source records",
      "generated indexes, graphs, reports, and navigation artifacts as projections only"
    ],
    generated_from: {
      workspace_registry: registryPath,
      workspace_registry_sha256: sha256(registryBytes),
      repository_bytes: "HEAD blobs plus separately receipted working-tree bytes when different",
      shell_frontdoor: rtk
    },
    discovery_rule: "Every repository declared by the active Meta registry plus the Meta root; every tracked root or nested README, AGENTS/RULES/RTK contract, and first-party build/development/architecture/security/testing/release/contribution document outside dependency, generated, archive, fixture, and third-party trees.",
    summary: {
      declared_repositories: repositories.length,
      available_repositories: repositories.filter((repository) => repository.availability === "available").length,
      missing_repositories: repositories.filter((repository) => repository.availability !== "available").length,
      discovered_worktrees: worktrees.length,
      contracts: contracts.length,
      dirty_contracts: contracts.filter((contract) => contract.working_tree_differs_from_commit).length,
      missing_global_contracts: globalContracts.filter((contract) => contract.availability !== "available").length,
      non_ssh_origins: repositories.filter(
        (repository) => repository.availability === "available" && !repository.origin_is_flexnetos_ssh
      ).length
    },
    global_contracts: globalContracts,
    worktrees,
    repositories
  };
}

function main() {
  const mode = process.argv.at(2) ?? "--check";
  if (!["--write", "--check"].includes(mode)) throw new Error("use --write or --check");
  const generated = stableJson(receipt());
  if (mode === "--write") {
    fs.writeFileSync(outputPath, generated);
    const summary = JSON.parse(generated).summary;
    console.log(
      `source contract receipt written: ${summary.available_repositories}/${summary.declared_repositories} repositories, ${summary.discovered_worktrees} worktrees, ${summary.contracts} contracts`
    );
    return;
  }
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== generated) {
    throw new Error("source contract receipt is stale; run with --write");
  }
  const summary = JSON.parse(generated).summary;
  console.log(
    `source contract receipt check passed: ${summary.available_repositories}/${summary.declared_repositories} repositories, ${summary.discovered_worktrees} worktrees, ${summary.contracts} contracts`
  );
}

main();
