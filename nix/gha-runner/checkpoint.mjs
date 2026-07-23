#!/usr/bin/env node
// Minimal crash-resumable build checkpoint for nix/gha-runner.
// Local stand-in for the brain-build loop-checkpoint contract (that script is not
// installed on this host). Single JSON file, no deps.
//
//   node checkpoint.mjs read
//   node checkpoint.mjs write --phase S --iteration 1 --done-criteria "<cmd>" \
//                             --next "<one action>" --blockers "<or empty>"
//   node checkpoint.mjs check     # exit 0 iff a valid checkpoint exists
//                                 # exit 3 iff phase == "DONE"
//                                 # exit 4 iff same `next` seen twice (no progress)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, ".build-checkpoint.json");

function load() {
  if (!existsSync(FILE)) return null;
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return null; }
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i]?.startsWith("--")) o[argv[i].slice(2)] = argv[i + 1] ?? "";
  }
  return o;
}

const cmd = process.argv[2];
const args = parseArgs(process.argv.slice(3));
const cur = load();

if (cmd === "read") {
  console.log(cur ? JSON.stringify(cur, null, 2) : "{}");
  process.exit(0);
}

if (cmd === "write") {
  const history = cur?.history ?? [];
  const prevNext = cur?.next;
  const rec = {
    phase: args.phase ?? cur?.phase ?? "S",
    iteration: Number(args.iteration ?? (cur?.iteration ?? 0)),
    doneCriteria: args["done-criteria"] ?? cur?.doneCriteria ?? "",
    next: args.next ?? "",
    blockers: args.blockers ?? "",
    // no Date.now() reliance for determinism across resumes; iteration is the clock
    noProgress: prevNext && args.next && prevNext === args.next,
  };
  rec.history = [...history, { phase: rec.phase, iteration: rec.iteration, next: rec.next }].slice(-20);
  writeFileSync(FILE, JSON.stringify(rec, null, 2) + "\n");
  console.log(`checkpoint: phase=${rec.phase} iter=${rec.iteration} next="${rec.next}"`);
  process.exit(0);
}

if (cmd === "check") {
  if (!cur || !cur.doneCriteria) { console.error("no valid checkpoint"); process.exit(1); }
  if (cur.phase === "DONE") { console.log("DONE"); process.exit(3); }
  if (cur.noProgress) { console.error(`NO-PROGRESS: next unchanged ("${cur.next}")`); process.exit(4); }
  console.log(`checkpoint valid: phase=${cur.phase} iter=${cur.iteration}`);
  process.exit(0);
}

console.error("usage: checkpoint.mjs read|write|check");
process.exit(2);
