#!/usr/bin/env node
// LifeOS — DESIGN.md regression gate.
// The upstream `design.md diff` CLI takes two file paths, not git rev syntax.
// This wrapper snapshots `git show HEAD~1:DESIGN.md` into a tempfile, calls
// the CLI, parses the JSON, and exits non-zero on any token-level regression
// not present in `scripts/design-diff.allow`.
//
// No previous version on the branch → no-op exit 0 (informational).

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const TARGET = join(ROOT, "DESIGN.md");
const ALLOWLIST = join(ROOT, "scripts/design-diff.allow");

function readAllowlist() {
  if (!existsSync(ALLOWLIST)) return new Set();
  return new Set(
    readFileSync(ALLOWLIST, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
  );
}

let previousBytes;
try {
  previousBytes = execFileSync("git", ["show", "HEAD~1:DESIGN.md"], { stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.log(JSON.stringify({ status: "skipped", reason: "no previous DESIGN.md on branch" }));
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "design-diff-"));
const previousPath = join(tmp, "DESIGN.previous.md");
writeFileSync(previousPath, previousBytes);

const cli = join(ROOT, "node_modules/.bin/design.md");
const result = spawnSync(cli, ["diff", previousPath, TARGET], { encoding: "utf8" });

if (result.error) {
  console.error(`Failed to run design.md diff at ${cli}:`);
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`design.md diff exited with status ${result.status}.`);
  if (result.stderr) {
    console.error("stderr:");
    console.error(result.stderr.trimEnd());
  }
  if (result.stdout) {
    console.error("stdout:");
    console.error(result.stdout.trimEnd());
  }
  process.exit(result.status ?? 1);
}

const stdout = result.stdout?.trim();
if (!stdout) {
  console.error("design.md diff produced empty output; expected JSON.");
  if (result.stderr) {
    console.error("stderr:");
    console.error(result.stderr.trimEnd());
  }
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(stdout);
} catch {
  console.error("design.md diff produced non-JSON output:");
  console.error(stdout);
  if (result.stderr) {
    console.error("stderr:");
    console.error(result.stderr.trimEnd());
  }
  process.exit(1);
}

console.log(stdout);

const allow = readAllowlist();
const protectedGroups = ["colors", "typography", "rounded", "spacing"];
const violations = [];
for (const group of protectedGroups) {
  const g = payload?.tokens?.[group] ?? {};
  for (const path of g.removed ?? []) {
    const key = `${group}.${path}.removed`;
    if (!allow.has(key)) violations.push(key);
  }
  for (const path of g.modified ?? []) {
    const key = `${group}.${path}.modified`;
    if (!allow.has(key)) violations.push(key);
  }
}

if (violations.length > 0) {
  console.error("Token-level regressions (not in scripts/design-diff.allow):");
  for (const v of violations) console.error(`  • ${v}`);
  process.exit(1);
}
process.exit(0);
