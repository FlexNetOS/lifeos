#!/usr/bin/env node
// Poll a workflow's latest run until it concludes, and assert it ran on a self-hosted
// runner. Times out cleanly (never hangs) and distinguishes "no self-hosted runner
// picked up the job" from "run failed" (SPEC edge cases).
//
//   node wait-run-green.mjs <workflow-file> [--timeout 300] [--runner self-hosted] [--ready]
//     --ready : do NOT poll; just assert the workflow file exists and is dispatchable
//               (used before B1, when the runner is not yet online / repo not pushed).
//   exit 0 = success (green on the required runner, or --ready checks pass)
//   exit 1 = failed / timed out / no self-hosted runner
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const wf = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const timeout = Number(arg("--timeout", "300"));
const requireRunner = arg("--runner", "self-hosted");
const readyOnly = process.argv.includes("--ready");

if (!wf) { console.error("usage: wait-run-green.mjs <workflow-file> [--timeout N] [--ready]"); process.exit(1); }

const path = wf.includes("/") ? wf : `.github/workflows/${wf}`;
if (!existsSync(path)) { console.error(`FAIL: workflow not found: ${path}`); process.exit(1); }

function gh(args) { return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }); }

if (readyOnly) {
  // Pre-B1 readiness: file present + declares workflow_dispatch + self-hosted runs-on.
  const body = execFileSync("cat", [path], { encoding: "utf8" });
  const hasDispatch = /workflow_dispatch/.test(body);
  const hasSelfHosted = /runs-on:\s*\[.*self-hosted/.test(body);
  console.log(`ready-check: dispatch=${hasDispatch} self-hosted=${hasSelfHosted}`);
  if (hasDispatch && hasSelfHosted) { console.log("READY: dispatchable, targets self-hosted"); process.exit(0); }
  console.error("FAIL: workflow not dispatchable or not self-hosted"); process.exit(1);
}

const name = wf.split("/").pop();
const deadline = Date.now() + timeout * 1000;
console.log(`polling ${name} (timeout ${timeout}s, require runner label "${requireRunner}")…`);

while (Date.now() < deadline) {
  let runs;
  try {
    runs = JSON.parse(gh(["run", "list", "--workflow", name, "--limit", "1",
      "--json", "databaseId,status,conclusion"]));
  } catch (e) { console.error("gh run list error:", e.message); process.exit(1); }
  if (!runs.length) { sleep(5); continue; }
  const r = runs[0];
  if (r.status === "completed") {
    if (r.conclusion !== "success") { console.error(`FAIL: run ${r.databaseId} concluded ${r.conclusion}`); process.exit(1); }
    // confirm it ran on the required runner label
    const jobs = JSON.parse(gh(["run", "view", String(r.databaseId), "--json", "jobs"])).jobs || [];
    const onRunner = jobs.some((j) => (j.labels || []).includes(requireRunner) || /self-hosted/.test(j.runnerName || ""));
    if (!onRunner) { console.error(`FAIL: run ${r.databaseId} did not run on "${requireRunner}"`); process.exit(1); }
    console.log(`PASS: run ${r.databaseId} succeeded on ${requireRunner}`); process.exit(0);
  }
  sleep(10);
}
console.error(`TIMEOUT: no completed run in ${timeout}s — is a [${requireRunner}] runner online? (B1)`);
process.exit(1);

function sleep(s) { execFileSync("sleep", [String(s)]); }
