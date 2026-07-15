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
  it("states only canonical task totals in authored navigation claims", () => {
    const canonical = readJson(path.join(pkgRoot, "generated", "task_graph.normalized.json"));
    expect(canonical.task_count).toBe(canonical.tasks.length);

    const claims = countClaims(fs.readFileSync(path.join(pkgRoot, "navigation", "README.md"), "utf8"));
    expect(claims.length).toBeGreaterThan(0);
    expect(claims).toEqual(claims.map(() => canonical.task_count));

    const sourceJson = fs.readFileSync(path.join(pkgRoot, "navigation", "source.json"), "utf8");
    expect(sourceJson).not.toMatch(/task-graph rows/);
  });

  it("enforces the authored count claim inside navigation generation and check", () => {
    const artifacts = buildNavigationArtifacts({ repoRoot });
    expect(artifacts.validation.checks).toContainEqual(expect.objectContaining({
      name: "authored_task_counts_match_canonical_graph",
      result: "pass",
    }));
  }, buildTimeout);

  it("fails generation when the authored claim goes stale or the canonical graph gains a task", () => {
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
      expect(countClaims(readmeBefore)).toContain(canonical.task_count);

      const staleReadme = readmeBefore.replaceAll(
        `${canonical.task_count} task-graph rows`,
        "249 task-graph rows",
      );
      expect(staleReadme).not.toBe(readmeBefore);
      fs.writeFileSync(readmePath, staleReadme);
      const stale = buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(stale.validation.result).toBe("fail");
      expect(stale.validation.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("authored task count"),
      ]));
      expect(stale.validation.checks).toContainEqual(expect.objectContaining({
        name: "authored_task_counts_match_canonical_graph",
        result: "fail",
      }));
      fs.writeFileSync(readmePath, readmeBefore);

      const normalizedPath = path.join(isolatedPkgRoot, "generated", "task_graph.normalized.json");
      const normalized = readJson(normalizedPath);
      const taskClone = structuredClone(normalized.tasks.find((task) => task.task_id === "ARCHBP-033"));
      taskClone.task_id = "ARCHBP-901";
      normalized.tasks.push(taskClone);
      normalized.task_count += 1;
      fs.writeFileSync(normalizedPath, `${JSON.stringify(normalized, null, 2)}\n`);

      const statusPath = path.join(isolatedPkgRoot, "generated", "task_graph.status.json");
      const status = readJson(statusPath);
      const statusClone = structuredClone(status.tasks.find((task) => task.task_id === "ARCHBP-033"));
      statusClone.task_id = "ARCHBP-901";
      status.tasks.push(statusClone);
      fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);

      const grown = buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(grown.index.by_task_id["ARCHBP-901"]).toBe("task:ARCHBP-901");
      expect(grown.validation.result).toBe("fail");
      expect(grown.validation.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("authored task count"),
      ]));
      expect(grown.validation.checks).toContainEqual(expect.objectContaining({
        name: "authored_task_counts_match_canonical_graph",
        result: "fail",
      }));
    } finally {
      fs.rmSync(temporaryBase, { recursive: true, force: true });
    }
  }, buildTimeout);
});
