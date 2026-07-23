import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const anchorRoot = path.join(
  repoRoot,
  "planning-spine-v0",
  "1.0_VISION",
  "Architecture_Anchors"
);
const receiptPath = path.join(anchorRoot, "receipts.json");
const sectionInventoryPath = path.join(anchorRoot, "section_inventory.json");

const anchors = [
  {
    id: "ARCHANCHOR-001",
    kind: "expanded-execution-blueprint",
    option: "blueprint",
    target: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
    sourcePath: "/home/flexnetos/meta/src/lifeos/Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
    sha256: "78d8584d73957e795320d0ca9eb8e5593f1ab6286463e77b4537757dfef220ee",
    bytes: 977386,
    lines: 6347
  },
  {
    id: "ARCHANCHOR-002",
    kind: "anchored-topology-projection",
    option: "graph",
    target: "Architecture_Data_Pipeline_Graph_ANCHORED_VERIFIED.md",
    sourcePath: "/home/flexnetos/Downloads/Architecture_Data_Pipeline_Graph_ANCHORED_VERIFIED.md",
    sha256: "abd36f1c2bd9d62e4fdb522e5290d93d4e7017b1b478c13dbf0a5da939c5b663",
    bytes: 34773,
    lines: 560
  }
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function lineCount(bytes) {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0x0a) count += 1;
  }
  return count;
}

function readAndVerify(filePath, expected) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing architecture anchor: ${filePath}`);
  }
  const bytes = fs.readFileSync(filePath);
  const actual = {
    sha256: sha256(bytes),
    bytes: bytes.length,
    lines: lineCount(bytes)
  };
  for (const field of ["sha256", "bytes", "lines"]) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `${expected.id} ${field} mismatch: expected ${expected[field]}, got ${actual[field]}`
      );
    }
  }
  return bytes;
}

function sectionInventory(anchor, bytes) {
  const text = bytes.toString("utf8");
  if (Buffer.byteLength(text, "utf8") !== bytes.length) {
    throw new Error(`${anchor.id} is not valid UTF-8`);
  }

  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const headings = [];
  let fence = null;
  lines.forEach((line, index) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.character &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null;
      }
      return;
    }
    if (fenceMatch) {
      fence = { character: fenceMatch[1][0], length: fenceMatch[1].length };
      return;
    }
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      headings.push({ level: match[1].length, title: match[2], start_line: index + 1 });
    }
  });
  if (fence) throw new Error(`${anchor.id} has an unterminated Markdown code fence`);

  const starts = headings.map((heading) => heading.start_line);
  if (starts[0] !== 1) starts.unshift(1);
  const sections = starts.map((startLine, index) => {
    const endLine = (starts[index + 1] ?? (lines.length + 1)) - 1;
    const heading = headings.find((candidate) => candidate.start_line === startLine);
    const sectionBytes = Buffer.from(`${lines.slice(startLine - 1, endLine).join("\n")}\n`);
    return {
      section_id: `${anchor.id}-SECTION-${String(index + 1).padStart(3, "0")}`,
      level: heading?.level ?? 0,
      title: heading?.title ?? "Preamble",
      start_line: startLine,
      end_line: endLine,
      line_count: endLine - startLine + 1,
      sha256: sha256(sectionBytes)
    };
  });

  let expectedStart = 1;
  for (const section of sections) {
    if (section.start_line !== expectedStart) {
      throw new Error(`${anchor.id} section inventory has a coverage gap at line ${expectedStart}`);
    }
    expectedStart = section.end_line + 1;
  }
  if (expectedStart !== anchor.lines + 1) {
    throw new Error(`${anchor.id} section inventory ends at ${expectedStart - 1}, expected ${anchor.lines}`);
  }

  return {
    anchor_id: anchor.id,
    path: `1.0_VISION/Architecture_Anchors/${anchor.target}`,
    total_lines: anchor.lines,
    section_count: sections.length,
    coverage: {
      first_line: 1,
      last_line: anchor.lines,
      contiguous: true,
      complete: true
    },
    sections
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function expectedArtifacts(sourceOverrides = {}) {
  const imported = anchors.map((anchor) => {
    const sourcePath = sourceOverrides[anchor.option] ?? anchor.sourcePath;
    const bytes = readAndVerify(sourcePath, anchor);
    return { anchor, sourcePath, bytes };
  });

  return {
    imported,
    receipts: {
      schema_version: "lifeos-planning-spine.architecture-anchor-receipts.v1",
      authority_class: "architecture-input",
      lifecycle: "immutable-source",
      proves_implementation: false,
      authority_note: "Owner instructions and repository operating contracts control conflicts; these exact-byte anchors define the desired PostgreSQL/RuVector topology and required implementation scope, while checked source and proof define current implementation state.",
      anchors: imported.map(({ anchor, sourcePath }) => ({
        anchor_id: anchor.id,
        kind: anchor.kind,
        import_source: sourcePath,
        repository_path: `1.0_VISION/Architecture_Anchors/${anchor.target}`,
        sha256: anchor.sha256,
        bytes: anchor.bytes,
        lines: anchor.lines,
        immutable: true
      }))
    },
    sectionInventory: {
      schema_version: "lifeos-planning-spine.architecture-anchor-section-inventory.v1",
      coverage_rule: "Every source line belongs to exactly one contiguous section; section digests supplement and never replace the immutable full-file digest.",
      anchors: imported.map(({ anchor, bytes }) => sectionInventory(anchor, bytes))
    }
  };
}

function parseArgs(argv) {
  const options = { mode: "check", sourceOverrides: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") options.mode = "write";
    else if (argument === "--check") options.mode = "check";
    else if (argument === "--blueprint" || argument === "--graph") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      options.sourceOverrides[argument.slice(2)] = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "write") {
    const artifacts = expectedArtifacts(options.sourceOverrides);
    fs.mkdirSync(anchorRoot, { recursive: true });
    for (const { anchor, bytes } of artifacts.imported) {
      fs.writeFileSync(path.join(anchorRoot, anchor.target), bytes);
    }
    fs.writeFileSync(receiptPath, stableJson(artifacts.receipts));
    fs.writeFileSync(sectionInventoryPath, stableJson(artifacts.sectionInventory));
    console.log(`architecture anchors imported: ${artifacts.imported.length} exact-byte files`);
    return;
  }

  const sourceOverrides = {};
  const committed = anchors.map((anchor) => {
    const targetPath = path.join(anchorRoot, anchor.target);
    const bytes = readAndVerify(targetPath, anchor);
    return { anchor, bytes };
  });
  const receipts = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  for (const anchor of anchors) {
    const receipt = receipts.anchors?.find((candidate) => candidate.anchor_id === anchor.id);
    if (!receipt) throw new Error(`missing receipt for ${anchor.id}`);
    sourceOverrides[anchor.option] = path.join(anchorRoot, anchor.target);
  }
  const expected = expectedArtifacts(sourceOverrides);
  const receiptComparable = {
    ...expected.receipts,
    anchors: expected.receipts.anchors.map((candidate) => {
      const recorded = receipts.anchors.find((receipt) => receipt.anchor_id === candidate.anchor_id);
      return { ...candidate, import_source: recorded.import_source };
    })
  };
  if (stableJson(receipts) !== stableJson(receiptComparable)) {
    throw new Error("architecture anchor receipts are stale or malformed");
  }
  if (fs.readFileSync(sectionInventoryPath, "utf8") !== stableJson(expected.sectionInventory)) {
    throw new Error("architecture anchor section inventory is stale");
  }
  if (committed.length !== anchors.length) throw new Error("anchor count mismatch");
  console.log(`architecture anchor check passed: ${anchors.length} files, full line coverage`);
}

main();
