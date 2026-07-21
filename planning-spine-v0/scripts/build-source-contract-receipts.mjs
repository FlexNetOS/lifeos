import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const metaRoot = path.resolve(repoRoot, "../..");
const registryPath = path.join(metaRoot, ".meta.yaml");
const anchorPath = path.join(
  repoRoot,
  "planning-spine-v0",
  "1.0_VISION",
  "Architecture_Anchors",
  "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"
);
const outputPath = path.join(
  repoRoot,
  "planning-spine-v0",
  "1.0_VISION",
  "Architecture_Anchors",
  "source_contract_receipts.json"
);

const PRIMARY_CONTRACT_NAMES = new Set([
  "AGENTS.md",
  "RULES.md",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "ARCHITECTURE.md",
  "DEVELOPMENT.md",
  "BUILD.md",
  "TESTING.md",
  "RELEASE.md",
  "DEPLOYMENT.md",
  "OPERATIONS.md"
]);

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

function command(cwd, commandName, args) {
  return execFileSync("rtk", ["proxy", commandName, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseRegistry(text) {
  const projects = new Map();
  let active = null;
  for (const line of text.split("\n")) {
    const project = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (project) {
      active = project[1];
      projects.set(active, { name: active });
      continue;
    }
    if (!active) continue;
    const field = /^    (repo|path):\s*(.+)\s*$/.exec(line);
    if (field) projects.get(active)[field[1]] = field[2];
  }
  return projects;
}

function repositoryPath(project) {
  const candidates = [
    project.path && path.join(metaRoot, project.path),
    path.join(metaRoot, project.name),
    path.join(metaRoot, "src", project.name)
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, ".git"))) ?? null;
}

function anchorRepositories(anchorText, projects) {
  const names = new Set();
  for (const match of anchorText.matchAll(/https:\/\/github\.com\/FlexNetOS\/([A-Za-z0-9_.-]+)/g)) {
    names.add(match[1]);
  }
  // The immutable anchor names these adjacent workspace sources in its install order even
  // where it cites an upstream location for the package implementation.
  for (const name of ["loop_lib", "meta_plugin_protocol", "meta-ruvector", "ruflo"]) {
    if (new RegExp(`\\b${name.replace("-", "[-_]")}\\b`, "i").test(anchorText)) names.add(name);
  }
  names.add("meta");
  return [...names]
    .sort()
    .map((name) => {
      if (name === "meta") {
        return {
          name,
          registry_path: ".",
          remote: "git@github.com:FlexNetOS/meta.git",
          absolute_path: metaRoot
        };
      }
      const project = projects.get(name);
      return {
        name,
        registry_path: project?.path ?? null,
        remote: project?.repo ?? `https://github.com/FlexNetOS/${name}`,
        absolute_path: project ? repositoryPath(project) : null
      };
    });
}

function isContract(relativePath) {
  const segments = relativePath.split("/");
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;
  const base = path.posix.basename(relativePath);
  if (PRIMARY_CONTRACT_NAMES.has(base)) return true;
  if (!/\.(md|mdx|rst|txt)$/i.test(base)) return false;
  return /(?:^|\/)(docs?|documentation|architecture|security|testing|test|build|development|deploy|release|integration|contributing)(?:\/|$)/i.test(relativePath);
}

function purpose(relativePath) {
  const value = relativePath.toLowerCase();
  if (/(^|\/)(agents|rules)\.md$/.test(value)) return "operating-contract";
  if (/readme\.md$/.test(value)) return "repository-orientation";
  if (/security/.test(value)) return "security";
  if (/architecture|design/.test(value)) return "architecture";
  if (/build|develop/.test(value)) return "build-development";
  if (/test/.test(value)) return "testing";
  if (/release|deploy|operations/.test(value)) return "release-operations";
  if (/contribut/.test(value)) return "contribution";
  return "repository-contract";
}

function disposition(repository, relativePath) {
  const reviewed = {
    lifeos: new Set([
      "AGENTS.md",
      "README.md",
      "design-system-reference/README.md",
      "planning-spine-v0/navigation/README.md"
    ]),
    meta: new Set(["AGENTS.md"]),
    icm: new Set(["README.md"]),
    "rtk-tokenkill": new Set([
      "README.md",
      "CONTRIBUTING.md",
      "docs/contributing/ARCHITECTURE.md"
    ]),
    yazelix: new Set([
      "README.md",
      "docs/customization.md",
      "docs/posix_xdg.md",
      "docs/zellij-configuration.md",
      "docs/contracts/runtime_root_contract.md",
      "docs/troubleshooting.md",
      "home_manager/README.md"
    ])
  };
  if (reviewed[repository.name]?.has(relativePath)) return "read_applied_for_current_work";
  return "inventory_receipt_no_source_mutation_in_this_repository";
}

function contractsFor(repository) {
  if (!repository.absolute_path) {
    return {
      ...repository,
      availability: "missing_from_workspace",
      commit: null,
      origin: null,
      contracts: []
    };
  }
  const tracked = command(repository.absolute_path, "git", ["ls-files", "-z"])
    .split("\0")
    .filter(Boolean)
    .filter(isContract)
    .sort();
  return {
    ...repository,
    availability: "available",
    commit: command(repository.absolute_path, "git", ["rev-parse", "HEAD"]),
    origin: command(repository.absolute_path, "git", ["remote", "get-url", "origin"]),
    contracts: tracked.map((relativePath) => {
      const bytes = fs.readFileSync(path.join(repository.absolute_path, relativePath));
      return {
        path: relativePath,
        sha256: sha256(bytes),
        bytes: bytes.length,
        purpose: purpose(relativePath),
        applicability: "first_party_source_contract_or_documentation",
        disposition: disposition(repository, relativePath)
      };
    })
  };
}

function receipt() {
  const registry = parseRegistry(fs.readFileSync(registryPath, "utf8"));
  const anchorBytes = fs.readFileSync(anchorPath);
  const anchorText = anchorBytes.toString("utf8");
  const repositories = anchorRepositories(anchorText, registry).map(contractsFor);
  const contracts = repositories.flatMap((repository) => repository.contracts);
  return {
    schema_version: "lifeos-planning-spine.source-contract-receipts.v1",
    generated_from: {
      immutable_anchor: {
        path: "1.0_VISION/Architecture_Anchors/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
        sha256: sha256(anchorBytes),
        bytes: anchorBytes.length
      },
      workspace_registry: "/home/flexnetos/meta/.meta.yaml"
    },
    discovery_rule: "Union of exact FlexNetOS GitHub references in the immutable anchor, explicitly named adjacent source repositories in the anchor install order, and the Meta root; registry entries resolve local source paths. Only Git-tracked first-party contract/documentation files are listed.",
    exclusion_rule: "Dependency caches, node_modules, target, build output, generated runtime trees, archives, worktrees, and vendored third-party documents are excluded unless a checked-in first-party contract explicitly makes them authoritative.",
    summary: {
      repositories: repositories.length,
      available_repositories: repositories.filter((repository) => repository.availability === "available").length,
      contracts: contracts.length,
      read_applied_for_current_work: contracts.filter((contract) => contract.disposition === "read_applied_for_current_work").length
    },
    repositories
  };
}

function main() {
  const mode = process.argv.slice(2).at(0) ?? "--check";
  if (!["--write", "--check"].includes(mode)) throw new Error("use --write or --check");
  const generated = stableJson(receipt());
  if (mode === "--write") {
    fs.writeFileSync(outputPath, generated);
    console.log(`source contract receipt written: ${JSON.parse(generated).summary.contracts} contracts`);
    return;
  }
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== generated) {
    throw new Error("source contract receipt is stale; run bun run planning-spine:source-contracts:write");
  }
  const parsed = JSON.parse(generated);
  console.log(`source contract receipt check passed: ${parsed.summary.repositories} repositories, ${parsed.summary.contracts} contracts`);
}

main();
