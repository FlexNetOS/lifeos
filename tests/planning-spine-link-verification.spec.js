import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { collectNavigationLinkFindings } from "../scripts/verify-planning-spine.mjs";
import * as navigation from "../planning-spine-v0/scripts/build-navigation-index.mjs";

const repoRoot = process.cwd();
const pkgRoot = path.join(repoRoot, "planning-spine-v0");
const buildTimeout = 240_000;

const strictVerifierDocs = [
  "README.md",
  "ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md",
  "1.0_VISION/README.md",
  "1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md",
  "1.0_VISION/Notebooklm/README.md",
  "1.0_VISION/FOUNDATION_ECOSYSTEM_MAP.md",
  "1.0_VISION/FOUNDATION_META_PORTABILITY_MODEL.md",
  "docs/NOTEBOOKLM_SOURCE_EXTRACTION_PROTOCOL.md",
  "task_tables/README.md",
];

let index;
let allowedExternalReferences;

const findingsFor = (relativeDoc, text) => collectNavigationLinkFindings({
  repoRoot,
  docPath: path.join(pkgRoot, relativeDoc),
  text,
  index,
  allowedExternalReferences,
});

describe("strict navigation link verification (ARCHBP-033)", () => {
  beforeAll(() => {
    const artifacts = navigation.buildNavigationArtifacts({ repoRoot });
    index = artifacts.index;
    allowedExternalReferences = new Set(artifacts.source.external_reference_paths ?? []);
  }, buildTimeout);

  it("ignores Markdown link examples inside inline code spans and fenced blocks", () => {
    const text = [
      "Use dual links: `[Markdown link](path)` for portable local navigation.",
      "",
      "```md",
      "[fenced example](another/missing/example.md)",
      "[[Fenced Wiki Example That Does Not Exist]]",
      "```",
    ].join("\n");
    expect(findingsFor("1.0_VISION/README.md", text)).toEqual([]);
  });

  it("resolves document-relative bare wiki targets exactly like the generator", () => {
    const text = [
      "[[NORTH_STAR]]",
      "[[EXECUTION_STATUS]]",
      "[[Notebooklm/Architecture Blueprint - LifeOS Core Foundation]]",
    ].join("\n");
    expect(findingsFor("1.0_VISION/README.md", text)).toEqual([]);
  });

  it("resolves bare wiki aliases through the maintained navigation index", () => {
    expect(navigation.resolveWikiAliasThroughIndex(index, "Planning spine navigation"))
      .toEqual(["planning-spine-v0/navigation/README.md"]);
    expect(findingsFor("1.0_VISION/README.md", "[[Planning spine navigation]]\n")).toEqual([]);
  });

  it("still fails genuinely missing Markdown and wiki targets", () => {
    expect(findingsFor("1.0_VISION/README.md", "[broken](./definitely-missing-target.md)\n")).toEqual([
      expect.objectContaining({ kind: "markdown-link", reason: "missing" }),
    ]);
    expect(findingsFor("1.0_VISION/README.md", "[[Definitely Absent Fixture Alias]]\n")).toEqual([
      expect.objectContaining({ kind: "wiki-link", reason: "missing" }),
    ]);
  });

  it("fails ambiguous wiki aliases instead of guessing", () => {
    const ambiguousIndex = {
      records: {
        "file:planning-spine-v0/a.md": { path: "planning-spine-v0/a.md" },
        "file:planning-spine-v0/b.md": { path: "planning-spine-v0/b.md" },
      },
      by_alias: {
        "shared fixture alias": ["file:planning-spine-v0/a.md", "file:planning-spine-v0/b.md"],
      },
    };
    const findings = collectNavigationLinkFindings({
      repoRoot,
      docPath: path.join(pkgRoot, "1.0_VISION/README.md"),
      text: "[[Shared Fixture Alias]]\n",
      index: ambiguousIndex,
      allowedExternalReferences,
    });
    expect(findings).toEqual([
      expect.objectContaining({ kind: "wiki-link", reason: "ambiguous-alias" }),
    ]);
  });

  it("still rejects absolute and parent-escaping targets while honoring the explicit allowlist", () => {
    expect(findingsFor("task_tables/README.md", "[[/etc/passwd]]\n")).toEqual([
      expect.objectContaining({ kind: "wiki-link", reason: "escapes-repository" }),
    ]);
    expect(findingsFor("task_tables/README.md", "[[../../../../fixture-escape-target]]\n")).toEqual([
      expect.objectContaining({ kind: "wiki-link", reason: "escapes-repository" }),
    ]);
    expect(findingsFor("task_tables/README.md", "[escape](../../../../fixture-escape-target.md)\n")).toEqual([
      expect.objectContaining({ kind: "markdown-link", reason: "escapes-repository" }),
    ]);
    expect(findingsFor("task_tables/README.md", "[approved](../../../nu_plugin/docs/INTEGRATION_CONTRACTS.md)\n")).toEqual([]);
  });

  it("verifies every live strict document with zero findings, matching the passing generator", () => {
    const failures = [];
    for (const relativeDoc of strictVerifierDocs) {
      const text = fs.readFileSync(path.join(pkgRoot, relativeDoc), "utf8");
      for (const finding of findingsFor(relativeDoc, text)) {
        failures.push(`${finding.reason} ${finding.kind} in ${relativeDoc}: ${finding.target}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("resolves unique bare aliases in the generator, fails ambiguous and missing ones, and rejects escapes", () => {
    const temporaryBase = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-linkverify-"));
    const isolatedRoot = path.join(temporaryBase, "lifeos");
    fs.mkdirSync(isolatedRoot);
    try {
      fs.cpSync(pkgRoot, path.join(isolatedRoot, "planning-spine-v0"), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, "AGENTS.md"), path.join(isolatedRoot, "AGENTS.md"));

      const aliasTargetPath = path.join(isolatedRoot, "planning-spine-v0", "docs", "fixture-unique-alias-target.md");
      fs.writeFileSync(aliasTargetPath, [
        "---",
        "id: lifeos.fixture.unique-alias-target",
        "title: Fixture Unique Alias Target",
        "aliases:",
        "  - Fixture Unique Wiki Alias",
        "---",
        "",
        "# Fixture Unique Alias Target",
        "",
      ].join("\n"));
      const navigationReadmePath = path.join(isolatedRoot, "planning-spine-v0", "navigation", "README.md");
      const readmeBefore = fs.readFileSync(navigationReadmePath, "utf8");
      fs.writeFileSync(navigationReadmePath, `${readmeBefore}\nAlias fixture: [[Fixture Unique Wiki Alias]]\n`);

      const resolved = navigation.buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(resolved.validation.result).toBe("pass");
      expect(resolved.validation.counts.strict_unresolved_links).toBe(0);
      expect(resolved.validation.counts.unresolved_links).toBe(0);
      const sourceNodeId = resolved.index.by_path["planning-spine-v0/navigation/README.md"];
      const targetNodeId = resolved.index.by_path["planning-spine-v0/docs/fixture-unique-alias-target.md"];
      expect(resolved.graph.edges).toContainEqual(expect.objectContaining({
        from: sourceNodeId,
        to: targetNodeId,
        kind: "wiki-link",
      }));
      expect(collectNavigationLinkFindings({
        repoRoot: isolatedRoot,
        docPath: navigationReadmePath,
        text: "[[Fixture Unique Wiki Alias]]\n",
        index: resolved.index,
        allowedExternalReferences: new Set(resolved.source.external_reference_paths ?? []),
      })).toEqual([]);

      const duplicateAliasPath = path.join(isolatedRoot, "planning-spine-v0", "docs", "fixture-duplicate-alias-target.md");
      fs.writeFileSync(duplicateAliasPath, [
        "---",
        "id: lifeos.fixture.duplicate-alias-target",
        "title: Fixture Duplicate Alias Target",
        "aliases:",
        "  - Fixture Unique Wiki Alias",
        "---",
        "",
        "# Fixture Duplicate Alias Target",
        "",
      ].join("\n"));
      fs.writeFileSync(navigationReadmePath, [
        `${readmeBefore}`,
        "Alias fixture: [[Fixture Unique Wiki Alias]]",
        "Missing fixture: [[Definitely Absent Fixture Alias]]",
        "Escape fixture: [[../../../fixture-escape-target]]",
        "",
      ].join("\n"));

      const broken = navigation.buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(broken.validation.result).toBe("fail");
      expect(broken.validation.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("ambiguous wiki-link in navigation/README.md: Fixture Unique Wiki Alias"),
        expect.stringContaining("broken wiki-link in navigation/README.md: Definitely Absent Fixture Alias"),
        expect.stringContaining("unapproved external reference in navigation/README.md"),
      ]));
    } finally {
      fs.rmSync(temporaryBase, { recursive: true, force: true });
    }
  }, buildTimeout);
});
