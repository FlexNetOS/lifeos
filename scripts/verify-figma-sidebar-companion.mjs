import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, "design-system-reference/figma/sidebar-design-system-companion.json");
const tokenPath = resolve(root, "colors_and_type.css");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tokens = readFileSync(tokenPath, "utf8");
const failures = [];

function requireValue(condition, message) {
  if (!condition) failures.push(message);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(value ?? "");
}

requireValue(
  manifest.design_input.url ===
    "https://www.figma.com/design/z7aJ8uZrOsvfnWlsApN0Bu/Sidebar-Design-System-Companion?node-id=0-1&m=dev",
  "manifest must retain the exact owner-approved Figma URL"
);
requireValue(
  manifest.design_input.file_key === "z7aJ8uZrOsvfnWlsApN0Bu" &&
    manifest.design_input.node_id === "0:1",
  "manifest must retain the exact approved Figma file key and node id"
);
requireValue(manifest.connector_receipt.access === "verified", "connector access must be verified");
requireValue(
  manifest.connector_receipt.page_inventory.page_count === 1 &&
    manifest.connector_receipt.page_inventory.actual_pages[0]?.node_id === "0:1",
  "actual page inventory must remain distinct from descriptive file-map text"
);
requireValue(
  manifest.connector_receipt.hierarchy.implementation_root.node_id === "5:27",
  "renderable implementation root must remain pinned to node 5:27"
);

const counts = manifest.connector_receipt.hierarchy.node_counts;
requireValue(counts.total_named === 80, "named-node count must match the authenticated metadata receipt");
requireValue(
  counts.component === 0 && counts.component_set === 0 && counts.instance === 0,
  "manifest must not invent Figma component, component-set, instance, or variant nodes"
);
requireValue(
  manifest.connector_receipt.components_and_variants.status === "verified-static-reference",
  "component/variant finding must remain an evidence-backed static-reference result"
);
requireValue(
  Object.keys(manifest.connector_receipt.variables.observed).length === 0,
  "manifest must not invent variables absent from the connector result"
);

for (const value of [
  manifest.connector_receipt.file_and_node.metadata_xml_sha256,
  manifest.connector_receipt.page_inventory.receipt_sha256,
  manifest.connector_receipt.design_context.text_sha256,
  manifest.connector_receipt.visual_receipt.sha256
]) {
  requireValue(isSha256(value), `invalid connector SHA-256 receipt: ${value}`);
}
requireValue(
  manifest.connector_receipt.visual_receipt.bytes === 53480 &&
    manifest.connector_receipt.visual_receipt.width === 2200 &&
    manifest.connector_receipt.visual_receipt.height === 1450,
  "visual receipt dimensions and byte count must match the authenticated render"
);
requireValue(
  manifest.connector_receipt.code_connect.status === "seat_gated" &&
    manifest.connector_receipt.code_connect.repository_approved_equivalent.length > 0,
  "official Code Connect gating must retain a complete repository-approved equivalent"
);

const colorMappings = manifest.observed_design_tokens.colors;
requireValue(colorMappings.length === 13, "all 13 observed Figma color cards must be classified");
requireValue(
  new Set(colorMappings.map(({ node_id }) => node_id)).size === colorMappings.length,
  "Figma token node IDs must be unique"
);
for (const token of colorMappings) {
  requireValue(tokens.includes(token.lifeos_token), `LifeOS token is absent: ${token.lifeos_token}`);
}
requireValue(tokens.includes("Lexend"), "LifeOS Lexend typography authority is absent");
requireValue(tokens.includes("Rigelstar"), "LifeOS Rigelstar display/wordmark authority is absent");

for (const mapping of manifest.component_mappings) {
  requireValue(mapping.figma_reference_node === "5:49", `${mapping.component} must map to exact concept node 5:49`);
  requireValue(mapping.figma_component_node === null, `${mapping.component} must not invent a Figma component node`);
  requireValue(
    mapping.mapping_kind === "repository-approved-semantic-equivalent",
    `${mapping.component} must use the approved semantic equivalent while Code Connect is gated`
  );
  const sourcePath = resolve(root, mapping.source);
  requireValue(existsSync(sourcePath), `mapped source is absent: ${mapping.source}`);
  if (existsSync(sourcePath)) {
    const source = readFileSync(sourcePath, "utf8");
    requireValue(source.includes(mapping.source_anchor), `mapped source anchor is absent: ${mapping.source_anchor}`);
  }
  for (const testPath of [...mapping.accessibility, mapping.regression]) {
    requireValue(existsSync(resolve(root, testPath)), `mapped test/proof path is absent: ${testPath}`);
  }
  requireValue(mapping.states.length > 0, `interaction states are absent for ${mapping.component}`);
}

requireValue(
  manifest.authority_guards.no_copied_or_manual_design_authority === true &&
    manifest.authority_guards.no_stale_screenshot_authority === true,
  "copied/manual and stale-screenshot authority guards must remain enabled"
);
for (const command of [
  "bun run figma:sidebar:check",
  "bun run test:a11y",
  "bun run test",
  "bun run build",
  "git diff --check"
]) {
  requireValue(
    manifest.upgrade_import_workflow.some((step) => step.includes(command)),
    `upgrade/import workflow is missing verification command: ${command}`
  );
}

if (failures.length) {
  console.error("Figma Sidebar Companion contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      file_key: manifest.design_input.file_key,
      node_id: manifest.design_input.node_id,
      actual_pages: manifest.connector_receipt.page_inventory.page_count,
      named_nodes: counts.total_named,
      figma_component_nodes: counts.component,
      repository_equivalent_mappings: manifest.component_mappings.length,
      token_mappings: colorMappings.length,
      code_connect: manifest.connector_receipt.code_connect.status,
      visual_receipt_sha256: manifest.connector_receipt.visual_receipt.sha256,
      copied_design_authority: "disabled"
    },
    null,
    2
  )
);
