// Blueprint §3.5 / invariant 19 gate: every Mermaid diagram in the atlas must
// parse. The blueprint states D01-D24 are the executable visual crosswalk and
// that "parser, path-walk, ownership, byte-lineage, and release-gate checks
// must remain green" — this is the parser half, previously unimplemented.
//
// Run: bun run scripts/verify-blueprint-diagrams.mjs
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

// mermaid.parse() runs its text through DOMPurify, which needs a real DOM.
// Without one it throws "DOMPurify.sanitize is not a function" for EVERY
// diagram — a harness failure that reads exactly like a content failure. Stand
// up a DOM before importing mermaid so a reported failure means the diagram is
// actually malformed.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.Node = dom.window.Node;
globalThis.DOMPurify = dom.window.DOMPurify;

const BLUEPRINT =
  "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md";

const source = readFileSync(BLUEPRINT, "utf8");
const lines = source.split("\n");

// Collect fenced mermaid blocks with their 1-based start lines, and the D-number
// heading each falls under, so a failure names a diagram rather than an offset.
const blocks = [];
let current = null;
let heading = null;
lines.forEach((line, index) => {
  // Track the nearest preceding heading of any level, so blocks outside the
  // D01-D24 atlas (the ecosystem map, the §18 graph) are labelled by their own
  // section rather than inheriting the last D-number seen.
  const anyHeading = line.match(/^#{2,4} (.+)$/);
  if (anyHeading) {
    const dMatch = anyHeading[1].match(/^(D\d{2})\b/);
    heading = dMatch ? dMatch[1] : anyHeading[1].slice(0, 48);
  }
  if (line.trim() === "```mermaid") {
    current = { heading, startLine: index + 1, body: [] };
    return;
  }
  if (current && line.trim() === "```") {
    blocks.push({ ...current, text: current.body.join("\n") });
    current = null;
    return;
  }
  if (current) current.body.push(line);
});

if (current) {
  console.error(`FAIL: unterminated mermaid fence opened at line ${current.startLine}`);
  process.exit(1);
}

const dHeadings = [...source.matchAll(/^#### (D\d{2})\b/gm)].map((m) => m[1]);
const expected = Array.from({ length: 24 }, (_, i) => `D${String(i + 1).padStart(2, "0")}`);
const missing = expected.filter((d) => !dHeadings.includes(d));

let failures = 0;
if (missing.length) {
  console.error(`FAIL: atlas is missing ${missing.join(", ")}`);
  failures += 1;
}

const mermaid = (await import("mermaid")).default;
mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

for (const block of blocks) {
  const label = `${block.heading ?? "(no D-heading)"} @ line ${block.startLine}`;
  if (!block.text.trim()) {
    console.error(`FAIL: ${label} is an empty diagram`);
    failures += 1;
    continue;
  }
  try {
    await mermaid.parse(block.text);
  } catch (error) {
    const detail = String(error?.message ?? error).split("\n")[0];
    console.error(`FAIL: ${label} does not parse — ${detail}`);
    failures += 1;
  }
}

console.log(
  `diagrams: ${blocks.length} parsed, D-headings: ${dHeadings.length}, failures: ${failures}`
);
process.exit(failures === 0 ? 0 : 1);
