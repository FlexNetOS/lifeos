// ARCHBP-075 — CI guard: fail if any durable var/path is configured to live
// on host /run. Two layers, both honest:
//   default: FAIL if any durable tier-map TARGET path is on /run (a
//            configuration regression that must never land), and REPORT
//            current misplaced live state without failing (the restart-gated
//            migration retires it; hiding it would be a silent downgrade).
//   --strict: additionally FAIL on current live misplacement — the CI mode
//            after the T3 migration completes.
// Usage: bun scripts/check-durable-not-on-run.mjs [--strict] [--tier-map PATH]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const mapArg = args.indexOf("--tier-map");
const tierMapPath =
  mapArg >= 0
    ? resolve(process.cwd(), args[mapArg + 1])
    : resolve(repoRoot, "planning-spine-v0/docs/isolation_tier_map.json");

const tierMap = JSON.parse(readFileSync(tierMapPath, "utf8"));
const durable = tierMap.entries.filter((e) => e.tier === "durable");

const targetViolations = durable.filter((e) => (e.target_path ?? "").startsWith("/run/"));
const liveMisplaced = durable.filter((e) => (e.current_path ?? "").startsWith("/run/"));

for (const v of targetViolations) {
  console.error(`REGRESSION: durable entry '${v.name}' targets host /run: ${v.target_path}`);
}
for (const m of liveMisplaced) {
  console.error(
    `misplaced (known, restart-gated): '${m.name}' currently at ${m.current_path} -> target ${m.target_path}`,
  );
}

const failed = targetViolations.length > 0 || (strict && liveMisplaced.length > 0);
console.log(
  `durable-not-on-run guard: ${durable.length} durable entries, ${targetViolations.length} target regressions, ${liveMisplaced.length} live misplaced${strict ? " (strict)" : ""} -> ${failed ? "FAIL" : "PASS"}`,
);
process.exit(failed ? 1 : 0);
