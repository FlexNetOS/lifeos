// ARCHBP-042 / §17 step 15 — execute the real envctl release materializer
// against a database-approved activation and verify the durable acknowledgement
// only after the atomic symlink swap succeeds.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readlinkSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const bun = process.env.LIFEOS_BUN ?? "/home/flexnetos/.nix-profile/bin/bun";
const cargo = process.env.LIFEOS_CARGO ?? "/home/flexnetos/.nix-profile/bin/cargo";
const psql = process.env.LIFEOS_PSQL ?? "/home/flexnetos/.nix-profile/bin/psql";
const envctlRoot = process.env.LIFEOS_ENVCTL_ROOT ?? "/home/flexnetos/meta/src/envctl";
const databaseUrl = process.env.LIFEOS_DATABASE_URL ??
  "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql";
const conn = "host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql dbname=lifeos user=flexnetos";
const protectedPlugin = "/home/flexnetos/meta/src/nu_plugin";
const receiptPath = resolve(root, "evidence/release/live-materialization-receipt.json");
const tempRoot = mkdtempSync(join(tmpdir(), "lifeos-release-materialization-"));
const target = join(tempRoot, "generation");
const link = join(tempRoot, "current");
mkdirSync(target);

const pluginStatus = () => execFileSync("git", ["-C", protectedPlugin, "status", "--porcelain"], { encoding: "utf8" });
const pluginBefore = pluginStatus();
let result;
let materializerOutput;
try {
  execFileSync(bun, ["scripts/verify-release-gate-live.mjs"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  materializerOutput = execFileSync(cargo, [
    "run", "--quiet", "--manifest-path", join(envctlRoot, "crates/commit-worker/Cargo.toml"),
    "--bin", "envctl-commit-worker", "--", "activate", "--conn", conn,
    "--link", link, "--target", target, "--apply",
  ], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  result = JSON.parse(materializerOutput);
} finally {
  const pluginAfter = pluginStatus();
  if (pluginAfter !== pluginBefore) throw new Error("protected nu_plugin checkout changed");
}

if (!Array.isArray(result) || result.length === 0 || result.some((item) =>
  item.applied !== true || item.acknowledged !== true || item.activation.activation_kind !== "atomic-symlink-and-session-reload")) {
  throw new Error(`envctl materialization did not acknowledge every activation: ${materializerOutput}`);
}

const ids = result.map((item) => item.activation.outbox_id);
if (ids.some((id) => !/^[0-9a-f-]{36}$/.test(id))) throw new Error("materializer returned an invalid outbox id");
const acknowledged = Number(execFileSync(psql, [
  "--no-psqlrc", "--tuples-only", "--no-align", databaseUrl, "-v", "ON_ERROR_STOP=1", "-c",
  `select count(*) from lifeos_runtime.outbox where outbox_id in (${ids.map((id) => `'${id}'::uuid`).join(",")}) and acknowledged_at is not null;`,
], { cwd: root, encoding: "utf8" }).trim());
const targetResolved = readlinkSync(link);
const stagingLink = join(tempRoot, ".current.envctl-activation");
const pluginAfter = pluginStatus();
const blueprint = readFileSync(resolve(root, "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md"));
const receipt = {
  schema_version: "lifeos.evidence.release-materialization-live.v1",
  authority: "database-approved lifeos_release activation consumed by envctl-commit-worker",
  receipt_id: randomUUID(),
  recorded_at: new Date().toISOString(),
  blueprint_sha256: createHash("sha256").update(blueprint).digest("hex"),
  envctl_root: envctlRoot,
  envctl_commit: execFileSync("git", ["-C", envctlRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  outbox_ids: ids,
  sequences: result.map((item) => item.activation.sequence),
  applied_count: result.length,
  acknowledged_count: acknowledged,
  atomic_symlink: { link, target, target_resolved: targetResolved, staging_left: existsSync(stagingLink) },
  protected_nu_plugin_mutated: pluginAfter !== pluginBefore,
  verdict: acknowledged === result.length && targetResolved === target && !existsSync(stagingLink) && pluginAfter === pluginBefore
    ? "release-materialization-live-pass"
    : "release-materialization-live-fail",
};
if (receipt.verdict !== "release-materialization-live-pass") throw new Error(JSON.stringify(receipt));
mkdirSync(join(root, "evidence/release"), { recursive: true });
await Bun.write(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
rmSync(tempRoot, { recursive: true, force: true });
console.log(JSON.stringify({ receipt: receiptPath, verdict: receipt.verdict, applied_count: result.length }, null, 2));
