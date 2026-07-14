import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spineRoot = path.join(repoRoot, "planning-spine-v0");
const packageRoot = path.join(spineRoot, "envctl-db-nu-plugin-migration-automation-package");

async function text(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function json(relativePath) {
  return JSON.parse(await text(relativePath));
}

describe("envctl DB + nu_plugin package landing", () => {
  it("preserves the exact pre-adaptation receipt and binds the hardened manifest live", async () => {
    const receipt = await json("planning-spine-v0/generated/envctl_package_landing_receipt.json");
    const manifestBytes = await readFile(path.join(packageRoot, "PACKAGE_MANIFEST.json"));
    const manifest = JSON.parse(manifestBytes);

    expect(receipt.pre_adaptation).toMatchObject({
      last_package_commit: "c0d672ce59a642e5f1362fd72d5f7ac03f7da083",
      source_checkout_head: "b62669c4e32c8de0407aa51ca3add94d529b50b6",
      total_file_count: 891,
      correct_self_excluding_manifest_coverage: 890,
      declared_manifest_entry_count: 733,
      payload_sha256: "f854659b111204be3c76f1a632c9165cac9a41cd5a6049475ce1ba66fb5ea767",
      root_manifest_sha256: "57c09c926ab1bc14c2fda7d3ea0d73e85c16c6d597620432573a44acdec2925e",
      unlisted_file_count: 157,
      missing_listed_file_count: 0,
      hash_or_size_drift_count: 101,
    });

    expect(manifest.file_count).toBe(891);
    expect(manifest.files).toHaveLength(891);
    expect(receipt.current_hardened_landing).toMatchObject({
      declared_source_file_count: 891,
      manifest_entry_count: 891,
      manifest_check_status: "passed",
      manifest_unit_test_count: 3,
      manifest_unit_test_status: "passed",
    });
    expect(createHash("sha256").update(manifestBytes).digest("hex")).toBe(
      receipt.current_hardened_landing.root_manifest_sha256,
    );
    expect(createHash("sha256").update(JSON.stringify(manifest.files)).digest("hex")).toBe(
      receipt.current_hardened_landing.payload_index_sha256,
    );
  });

  it("keeps the 80, 12, and 106 task namespaces separate and fails approval truth closed", async () => {
    const receipt = await json("planning-spine-v0/generated/envctl_package_landing_receipt.json");
    const namespaceRegistry = await json("planning-spine-v0/task_tables/workflow/reference_namespaces.json");

    expect(receipt.namespaces.map(({ namespace, task_count: taskCount }) => [namespace, taskCount])).toEqual([
      ["reference-framework", 80],
      ["reference-issue-414", 12],
      ["nu-plugin-cdb-handoff", 106],
    ]);
    expect(namespaceRegistry.namespaces.map(({ namespace, task_count: taskCount }) => [namespace, taskCount])).toEqual(
      receipt.namespaces.map(({ namespace, task_count: taskCount }) => [namespace, taskCount]),
    );
    expect(receipt.authority_boundary).toMatchObject({
      package_completion_admissible_as_lifeos_truth: false,
      package_status_admissible_as_lifeos_status: false,
      package_proof_admissible_as_lifeos_proof: false,
      agent_approval_admissible_as_human_approval: false,
      actual_human_approval_required: true,
    });
  });

  it("routes all 26 mandatory capabilities through the landing and task-table catalog", async () => {
    const receipt = await json("planning-spine-v0/generated/envctl_package_landing_receipt.json");
    const catalog = await json("planning-spine-v0/task_tables/workflow/mandatory_capabilities.json");
    const landing = await text("planning-spine-v0/ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md");
    const planningReadme = await text("planning-spine-v0/README.md");
    const visionReadme = await text("planning-spine-v0/1.0_VISION/README.md");
    const expectedIds = Array.from({ length: 26 }, (_, index) => `CAP-MIG-${String(index + 1).padStart(3, "0")}`);

    expect(receipt.mandatory_capabilities.capability_count).toBe(26);
    expect(receipt.mandatory_capabilities.capability_ids).toEqual(expectedIds);
    expect(receipt.mandatory_capabilities).toMatchObject({ local_status: "review", product_complete: false });
    expect(catalog.capability_count).toBe(26);
    expect(catalog.capabilities.map(({ capability_id: capabilityId }) => capabilityId)).toEqual(expectedIds);
    expect(catalog.capabilities.every(({ requirement, local_status: localStatus, product_complete: complete }) => (
      requirement === "mandatory" && localStatus === "review" && complete === false
    ))).toBe(true);

    for (const capabilityId of expectedIds) {
      expect(landing).toContain(`\`${capabilityId}\``);
    }
    for (const route of [
      "./1.0_VISION/Notebooklm/Architecture Blueprint - LifeOS Core Foundation.md",
      "./1.0_VISION/ARCHITECTURE_BLUEPRINT_COMPATIBILITY.md",
      "./08_EXECUTION_GATES.md",
      "./task_tables/README.md",
      "./task_tables/workflow/mandatory_capabilities.json",
    ]) {
      expect(landing).toContain(route);
    }
    expect(landing).toContain("[[planning-spine-v0/08_EXECUTION_GATES]]");
    expect(landing).toContain("[[planning-spine-v0/task_tables/workflow/mandatory_capabilities]]");
    expect(planningReadme).toContain("./ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md");
    expect(visionReadme).toContain("../ENVCTL_DB_NU_PLUGIN_MIGRATION_PACKAGE.md");
  });
});
