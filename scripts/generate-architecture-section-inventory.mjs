import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(
  repoRoot,
  "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
);
const inventoryPath = path.join(
  repoRoot,
  "planning-spine-v0",
  "1.0_VISION",
  "Architecture_Anchors",
  "section_inventory.json",
);

const source = fs.readFileSync(sourcePath);
const lines = source.toString("utf8").match(/[^\n]*\n|[^\n]+$/g) ?? [];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sectionStarts = [];
let fenced = false;
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index].replace(/\n$/, "");
  if (/^\s*```/.test(line)) {
    fenced = !fenced;
    continue;
  }
  const match = !fenced && /^(#{1,6})\s+(.+?)\s*$/.exec(line);
  if (match) sectionStarts.push({ line: index + 1, level: match[1].length, title: match[2] });
}

const sections = [];
if (sectionStarts.length && sectionStarts[0].line > 1) {
  sections.push({ start_line: 1, level: 0, title: "Preamble" });
}
sections.push(...sectionStarts);
const rendered = sections.map((section, index) => {
  const startLine = section.line ?? section.start_line;
  const endLine = sections[index + 1] ? sections[index + 1].line - 1 : lines.length;
  const raw = lines.slice(startLine - 1, endLine).join("");
  return {
    section_id: `ARCHANCHOR-001-SECTION-${String(index + 1).padStart(3, "0")}`,
    level: section.level,
    title: section.title,
    start_line: startLine,
    end_line: endLine,
    line_count: endLine - startLine + 1,
    sha256: sha256(Buffer.from(raw)),
  };
});

const inventory = {
  schema_version: "lifeos-planning-spine.architecture-anchor-section-inventory.v1",
  coverage_rule:
    "Every source line belongs to exactly one contiguous section; section digests supplement and never replace the immutable full-file digest.",
  anchors: [
    {
      anchor_id: "ARCHANCHOR-001",
      path: "1.0_VISION/Architecture_Anchors/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
      total_lines: lines.length,
      section_count: rendered.length,
      coverage: {
        first_line: 1,
        last_line: lines.length,
        contiguous: true,
        complete: true,
      },
      sections: rendered,
    },
  ],
};

fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`wrote ${inventoryPath}: ${rendered.length} sections, ${lines.length} lines`);
