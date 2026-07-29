import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, "design-system-reference/figma/sidebar-design-system-companion.json");
const tokenPath = resolve(root, "colors_and_type.css");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const tokens = readFileSync(tokenPath, "utf8");
const failures = [];

const requireValue = (condition, message) => {
  if (!condition) failures.push(message);
};

requireValue(
  manifest.design_input.file_key === "z7aJ8uZrOsvfnWlsApN0Bu" && manifest.design_input.node_id === "0:1",
  "manifest must retain the exact approved Figma file key and node id"
);
requireValue(manifest.design_input.authority.includes("design input"), "manifest must keep Figma as design input");
requireValue(manifest.connector_receipt.access === "verified", "connector access receipt must be verified");
requireValue(
  manifest.connector_receipt.code_connect.status === "seat_gated",
  "Code Connect state must be honest until a qualified Figma seat is available"
);
requireValue(
  manifest.authority_guards.no_stale_screenshot_authority === true,
  "stale screenshot authority guard must remain enabled"
);

for (const mapping of manifest.component_mappings) {
  const sourcePath = resolve(root, mapping.source);
  requireValue(existsSync(sourcePath), `mapped source is absent: ${mapping.source}`);
  if (existsSync(sourcePath)) {
    const source = readFileSync(sourcePath, "utf8");
    requireValue(source.includes(mapping.source_anchor), `mapped source anchor is absent: ${mapping.source_anchor}`);
  }
}

for (const token of manifest.observed_design_tokens.colors) {
  requireValue(tokens.includes(token.lifeos_token), `LifeOS token is absent: ${token.lifeos_token}`);
}

requireValue(
  manifest.observed_design_tokens.colors.length >= 13,
  "observed color tokens must cover all thirteen page-00 swatches"
);

// The owner consolidated the file on 2026-07-27: pages 5:25, 166:2 and 181:2 were merged
// onto page 0:1 and no longer exist. Specification content is now organized as SECTIONS on
// that single page, so the contract is enforced against sections, not pages.
const documentPages = manifest.connector_receipt.document_pages;
requireValue(
  Array.isArray(documentPages) && documentPages.length === 4,
  "document_pages must enumerate the live four-page inventory"
);
if (Array.isArray(documentPages)) {
  for (const page of documentPages) {
    requireValue(
      typeof page.node_id === "string" && /^\d+:\d+$/.test(page.node_id) && typeof page.name === "string" && page.name.length > 0,
      `document_pages entry must carry a node id and name: ${JSON.stringify(page)}`
    );
  }
}

// Guard against resurrecting the dead page ids anywhere in the manifest.
const DEAD_PAGE_IDS = ["5:25", "166:2", "181:2"];
const serialized = JSON.stringify(manifest);
for (const dead of DEAD_PAGE_IDS) {
  requireValue(
    !serialized.includes(`"page_node_id": "${dead}"`) && !serialized.includes(`"page_node_id":"${dead}"`),
    `page ${dead} was deleted in Figma and must not be referenced as a live page_node_id`
  );
}

const pageSections = manifest.connector_receipt.page_sections;
requireValue(pageSections?.page_node_id === "0:1", "page_sections must be anchored to page 0:1");
requireValue(
  Array.isArray(pageSections?.sections) && pageSections.sections.length === 5,
  "page_sections must enumerate the five sections on page 0:1"
);

const sectionsById = new Map((pageSections?.sections || []).map((s) => [s.node_id, s]));
const specSectionIds = (pageSections?.sections || [])
  .filter((s) => s.status === "specification")
  .map((s) => s.node_id);
requireValue(specSectionIds.length === 3, "exactly three sections must be marked status=\"specification\"");

const mappedSectionIds = new Set(
  manifest.component_mappings.map((m) => m.figma_reference?.section_node_id).filter(Boolean)
);
const inventoryPageIds = new Set((documentPages || []).map((page) => page.node_id));

for (const sectionId of specSectionIds) {
  requireValue(
    mappedSectionIds.has(sectionId),
    `specification section ${sectionId} (${sectionsById.get(sectionId)?.name}) must carry at least one component mapping`
  );
}

for (const mapping of manifest.component_mappings) {
  const ref = mapping.figma_reference || {};
  requireValue(
    inventoryPageIds.has(ref.page_node_id),
    `mapped page id is absent from document_pages: ${ref.page_node_id}`
  );
  requireValue(
    !ref.section_node_id || sectionsById.has(ref.section_node_id),
    `mapped section id is absent from page_sections: ${ref.section_node_id}`
  );
  requireValue(
    typeof mapping.declared_page === "string" && mapping.declared_page.length > 0,
    `component mapping must declare its page/section: ${mapping.figma_concept}`
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
      component_mappings: manifest.component_mappings.length,
      document_pages: manifest.connector_receipt.document_pages.length,
      page_sections: pageSections.sections.length,
      specification_sections: specSectionIds.length,
      token_mappings: manifest.observed_design_tokens.colors.length,
      code_connect: manifest.connector_receipt.code_connect.status,
      screenshot_authority: "disabled"
    },
    null,
    2
  )
);
