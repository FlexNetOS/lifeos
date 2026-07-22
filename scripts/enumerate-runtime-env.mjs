// ARCHBP-072 — Enumerate the agent runtime env vars currently on /run tmpfs
// (CLAUDE_CONFIG_DIR, CODEX_HOME, YAZELIX_STATE_DIR and peers), tag each
// durable vs volatile, and cross-check against the T1.2 tier map
// (planning-spine-v0/docs/isolation_tier_map.json). Runs under Bun/Node.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const tierMapPath = resolve(repoRoot, "planning-spine-v0/docs/isolation_tier_map.json");
const outputArg = process.argv.find((a) => a.startsWith("--output="));
const outPath = outputArg
  ? resolve(process.cwd(), outputArg.slice("--output=".length))
  : resolve(repoRoot, "planning-spine-v0/docs/runtime_env_enumeration.json");

const tierMap = JSON.parse(readFileSync(tierMapPath, "utf8"));
const byName = new Map(tierMap.entries.map((e) => [e.name, e]));

// The complete agent env-var surface under enumeration: the known /run-tmpfs
// residents and their durable/volatile peers.
const VARS = [
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "YAZELIX_STATE_DIR",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "XDG_RUNTIME_DIR",
  "ICM_DB",
  "CARGO_TARGET_DIR",
  "RUSTUP_HOME",
  "TMPDIR",
];

const entries = VARS.map((name) => {
  const live = process.env[name] ?? null;
  const mapped = byName.get(name) ?? null;
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
  schema_version: "lifeos-planning-spine.runtime-env-enumeration.v0",
  generated_by: "scripts/enumerate-runtime-env.mjs",
  cross_checked_against: "planning-spine-v0/docs/isolation_tier_map.json",
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
