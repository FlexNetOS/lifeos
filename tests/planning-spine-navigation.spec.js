import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildNavigationArtifacts,
  checkNavigationArtifacts,
  explainNavigationNode,
  parseCsv,
  renderNavigationArtifacts,
  searchNavigationIndex,
  writeNavigationArtifacts,
} from "../planning-spine-v0/scripts/build-navigation-index.mjs";

const repoRoot = process.cwd();

describe("planning-spine agent navigation", () => {
  it("builds a complete, connected, richly described planning graph", () => {
    const { graph, index, validation } = buildNavigationArtifacts({ repoRoot });

    expect(validation.result).toBe("pass");
    expect(validation.counts.included_package_files).toBeGreaterThan(390);
    expect(validation.counts.strict_unresolved_links).toBe(0);
    expect(validation.counts.unresolved_links).toBe(0);
    expect(validation.checks.every((check) => check.result === "pass")).toBe(true);
    expect(graph.nodes).toHaveLength(Object.keys(index.records).length);
    expect(graph.nodes.every((node) => (
      node.id
      && node.kind
      && node.title
      && node.description
      && node.authority_class
      && node.lifecycle
      && Array.isArray(node.aliases)
      && Array.isArray(node.tags)
    ))).toBe(true);
  });

  it("keeps all committed navigation outputs byte-for-byte current", () => {
    const result = checkNavigationArtifacts({ repoRoot });
    expect(result.drift).toEqual([]);
    expect(result.ok).toBe(true);

    for (const [relativePath, expected] of Object.entries(renderNavigationArtifacts(result.artifacts))) {
      const committed = fs.readFileSync(path.join(repoRoot, "planning-spine-v0", relativePath), "utf8");
      expect(committed).toBe(expected);
    }
  });

  it("recalls task, claim, and source nodes without an external index", () => {
    const { graph, index } = buildNavigationArtifacts({ repoRoot });

    expect(index.by_task_id["STORE-001"]).toBe("task:STORE-001");
    expect(index.by_claim_id["REDB-CLAIM-002"]).toBe("claim:REDB-CLAIM-002");
    expect(index.by_source_id["NBSOURCE-001"]).toBe("source:NBSOURCE-001");
    expect(searchNavigationIndex(index, "STORE-001", 1)[0].node_id).toBe("task:STORE-001");
    expect(searchNavigationIndex(index, "REDB-CLAIM-002", 1)[0].node_id).toBe("claim:REDB-CLAIM-002");
    expect(explainNavigationNode(graph, index, "claim:REDB-CLAIM-002").outgoing).toEqual(expect.arrayContaining([
      ["maps-to-task", "task:STORE-001"],
      ["verified-through", "verification-queue:NBV-001"],
    ]));
  });

  it("is clone-portable and preserves last-known-good outputs on failure", () => {
    const temporaryBase = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-navigation-"));
    const isolatedRoot = path.join(temporaryBase, "lifeos");
    fs.mkdirSync(isolatedRoot);
    try {
      fs.cpSync(path.join(repoRoot, "planning-spine-v0"), path.join(isolatedRoot, "planning-spine-v0"), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, "AGENTS.md"), path.join(isolatedRoot, "AGENTS.md"));

      const local = buildNavigationArtifacts({ repoRoot });
      const isolated = buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(renderNavigationArtifacts(isolated)).toEqual(renderNavigationArtifacts(local));
      const externalReferences = isolated.graph.nodes.filter((node) => node.kind === "external-reference");
      expect(externalReferences.map((node) => node.path).sort()).toEqual([
        "../nu_plugin/docs/INTEGRATION_CONTRACTS.md",
        "../nu_plugin/docs/RELEASE_GATE.md",
        "../nu_plugin/docs/ROUND_TRIP_PROOF.md",
        "../nu_plugin/docs/UNSAFE_CAPTURE_POLICY.md",
      ]);
      expect(externalReferences.every((node) => node.content === null && node.metadata.content_imported === false)).toBe(true);

      const nonStrictPath = path.join(isolated.pkgRoot, "00_NORTH_STAR.md");
      const nonStrictBefore = fs.readFileSync(nonStrictPath, "utf8");
      fs.appendFileSync(nonStrictPath, "\n[Unapproved external target](../../unapproved-navigation-target.md)\n");
      const unapproved = buildNavigationArtifacts({ repoRoot: isolatedRoot });
      expect(unapproved.validation.result).toBe("fail");
      expect(unapproved.validation.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("unapproved external reference"),
      ]));
      fs.writeFileSync(nonStrictPath, nonStrictBefore);

      const outputPaths = Object.values(isolated.source.outputs).map((relativePath) => path.join(isolated.pkgRoot, relativePath));
      const before = outputPaths.map((outputPath) => fs.readFileSync(outputPath, "utf8"));
      fs.appendFileSync(path.join(isolated.pkgRoot, "navigation", "README.md"), "\n[Broken internal target](./missing-navigation-target.md)\n");
      expect(() => writeNavigationArtifacts({ repoRoot: isolatedRoot })).toThrow(/navigation generation failed/);
      expect(outputPaths.map((outputPath) => fs.readFileSync(outputPath, "utf8"))).toEqual(before);
    } finally {
      fs.rmSync(temporaryBase, { recursive: true, force: true });
    }
  });

  it("preserves nested source metadata and classifies catalogs and projections accurately", () => {
    const { graph } = buildNavigationArtifacts({ repoRoot });
    const byPath = Object.fromEntries(graph.nodes.filter((node) => node.path).map((node) => [node.path, node]));
    const compatibility = byPath["planning-spine-v0/1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md"];
    const catalog = byPath["planning-spine-v0/1.0_VISION/Notebooklm/artifacts.meta.json"];
    const inventory = byPath["planning-spine-v0/1.0_VISION/current_state/SYSTEM_INVENTORY.md"];

    expect(compatibility.metadata.frontmatter.source_artifact.sha256).toBe("014bbebb8afceee7f8deea236ed3b9425b61be3840fba47aee7c131f77268827");
    expect(compatibility.metadata.frontmatter.review.reviewed_branch).toBe("agent/codedb-ci-hermetic-runtime");
    expect(catalog).toMatchObject({ kind: "raw-artifact-catalog", authority_class: "canonical-input", lifecycle: "maintained" });
    expect(inventory).toMatchObject({ kind: "current-state-projection", authority_class: "derived-projection", lifecycle: "generated" });
  });

  it("parses quoted commas, escaped quotes, and multiline CSV cells", () => {
    const rows = parseCsv('id,title,body\r\n"A-1","A, title","line 1\nline ""2"""\r\n');
    expect(rows).toEqual([{ id: "A-1", title: "A, title", body: 'line 1\nline "2"' }]);
  });
});
