import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildNavigationArtifacts } from "../planning-spine-v0/scripts/build-navigation-index.mjs";

const repoRoot = process.cwd();
const pkgRoot = path.join(repoRoot, "planning-spine-v0");
const buildTimeout = 240_000;

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const countClaims = (text) => [...text.matchAll(/(\d+)\s+task-graph rows/g)].map((match) => Number(match[1]));

describe("navigation task counts derive from the canonical graph (ARCHBP-036)", () => {
  it("keeps authored navigation free of hard-coded task totals", () => {
    const canonical = readJson(path.join(pkgRoot, "generated", "task_graph.normalized.json"));
    expect(canonical.task_count).toBe(canonical.tasks.length);

    const claims = countClaims(fs.readFileSync(path.join(pkgRoot, "navigation", "README.md"), "utf8"));
    expect(claims).toEqual([]);

    const sourceJson = fs.readFileSync(path.join(pkgRoot, "navigation", "source.json"), "utf8");
    expect(sourceJson).not.toMatch(/task-graph rows/);
  });

  it("derives the canonical count inside navigation generation and check", () => {
    const canonical = readJson(path.join(pkgRoot, "generated", "task_graph.normalized.json"));
    const artifacts = buildNavigationArtifacts({ repoRoot });
    expect(artifacts.validation.checks).toContainEqual(expect.objectContaining({
      name: "canonical_task_counts_are_derived",
      result: "pass",
      observed: canonical.task_count,
      authored_claim_count: 0,
    }));
  }, buildTimeout);

  it("fails generation when prose hard-codes a count or canonical task_count drifts", () => {
    const temporaryBase = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-navcounts-"));
    const isolatedRoot = path.join(temporaryBase, "lifeos");
    fs.mkdirSync(isolatedRoot);
    try {
      fs.cpSync(pkgRoot, path.join(isolatedRoot, "planning-spine-v0"), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, "AGENTS.md"), path.join(isolatedRoot, "AGENTS.md"));

      const isolatedPkgRoot = path.join(isolatedRoot, "planning-spine-v0");
      const readmePath = path.join(isolatedPkgRoot, "navigation", "README.md");
      const canonical = readJson(path.join(isolatedPkgRoot, "generated", "task_graph.normalized.json"));
      const readmeBefore = fs.readFileSync(readmePath, "utf8");
      expect(countClaims(readmeBefore)).toEqual([]);

      const staleReadme = `${readmeBefore}\nExactly ${canonical.task_count} task-graph rows.\n`;
      fs.writeFileSync(readmePath, staleReadme);
      const stale = buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(stale.validation.result).toBe("fail");
      expect(stale.validation.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("must not hard-code"),
      ]));
      expect(stale.validation.checks).toContainEqual(expect.objectContaining({
        name: "canonical_task_counts_are_derived",
        result: "fail",
      }));
      fs.writeFileSync(readmePath, readmeBefore);

      const normalizedPath = path.join(isolatedPkgRoot, "generated", "task_graph.normalized.json");
      const normalized = readJson(normalizedPath);
      normalized.task_count += 1;
      fs.writeFileSync(normalizedPath, `${JSON.stringify(normalized, null, 2)}\n`);

      const grown = buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(grown.validation.result).toBe("fail");
      expect(grown.validation.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("disagrees with its"),
      ]));
      expect(grown.validation.checks).toContainEqual(expect.objectContaining({
        name: "canonical_task_counts_are_derived",
        result: "fail",
      }));
    } finally {
      fs.rmSync(temporaryBase, { recursive: true, force: true });
    }
  }, buildTimeout);
});
