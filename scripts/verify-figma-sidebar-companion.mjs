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
      token_mappings: manifest.observed_design_tokens.colors.length,
      code_connect: manifest.connector_receipt.code_connect.status,
      screenshot_authority: "disabled"
    },
    null,
    2
  )
);
