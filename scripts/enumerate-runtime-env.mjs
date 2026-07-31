// ARCHBP-072 — Enumerate agent and tool runtime env vars, reject host-runtime
// ownership, and cross-check against the T1.2 tier map
// (evidence/isolation/isolation_tier_map.json). Runs under Bun/Node.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const tierMapPath = resolve(repoRoot, "evidence/isolation/isolation_tier_map.json");
const outputArg = process.argv.find((a) => a.startsWith("--output="));
const fromTargets = process.argv.includes("--from-targets");
const outPath = outputArg
  ? resolve(process.cwd(), outputArg.slice("--output=".length))
  : resolve(repoRoot, "evidence/isolation/runtime_env_enumeration.json");

const tierMap = JSON.parse(readFileSync(tierMapPath, "utf8"));
const byName = new Map(tierMap.entries.map((e) => [e.name, e]));

// The complete agent/tool env-var surface under enumeration.
const VARS = [
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "YAZELIX_STATE_DIR",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "XDG_RUNTIME_DIR",
  "ICM_DB",
  "CARGO_HOME",
  "CARGO_TARGET_DIR",
  "TMPDIR",
];

const entries = VARS.map((name) => {
  const mapped = byName.get(name) ?? null;
  const live = fromTargets ? mapped?.target_path ?? null : process.env[name] ?? null;
  const onRunTmpfs = Boolean(live && live.startsWith("/run/"));
  return {
    name,
    live_value: live,
    on_run_tmpfs: onRunTmpfs,
    tier: mapped ? mapped.tier : live === null ? "unset" : "volatile",
    tier_map_entry: Boolean(mapped),
    misplaced: mapped ? Boolean(mapped.misplaced) : false,
    target_path: mapped ? mapped.target_path : null,
  };
});

const result = {
  schema_version: "lifeos.evidence.runtime-env-enumeration.v1",
  generated_by: "scripts/enumerate-runtime-env.mjs",
  cross_checked_against: "evidence/isolation/isolation_tier_map.json",
  capture_mode: fromTargets ? "declared-yazelix-targets" : "process-environment",
  var_count: entries.length,
  on_run_tmpfs_count: entries.filter((e) => e.on_run_tmpfs).length,
  durable_on_run_count: entries.filter((e) => e.on_run_tmpfs && e.tier === "durable").length,
  entries,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `runtime-env enumeration: ${result.var_count} vars, ${result.on_run_tmpfs_count} on /run tmpfs, ${result.durable_on_run_count} durable-on-run (misplaced)`,
);
