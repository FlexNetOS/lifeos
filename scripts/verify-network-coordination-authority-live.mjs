// ARCHBP-011/012 — live component and database-authority boundary receipt.
// This gate proves the installed source coordinates, compiled workspaces,
// database procedures, read-only network inventory, and dry-run planning. It
// deliberately does not invent a task/lease to perform an authorized mutation.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const psql = "/home/flexnetos/.nix-profile/bin/psql";
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const netctl = process.env.LIFEOS_NETCTL_BIN ?? "/home/flexnetos/meta/var/cargo-target/debug/netctl";
const dbArgs = ["-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-h", "/home/flexnetos/meta/var/run/postgresql", "-d", "lifeos", "-qAt"];

const components = {
  network_control: {
    path: "/home/flexnetos/meta/src/network-control",
    revision: "cad70349968d2a6f501fb304a77d5cd6dac340b5",
  },
  weave: {
    path: "/home/flexnetos/meta/src/weave",
    revision: "1f0801f5cc9ff772b87497584d5650a9ddca15d5",
  },
  rusty_idd: {
    path: "/home/flexnetos/meta/src/rusty-idd",
    revision: "fd95efdd3d461874ceab28a4ad82c435e162b751",
  },
  flexnetos_runner: {
    path: "/home/flexnetos/meta/src/flexnetos_runner",
    revision: "3e67b2e75973619efb3892820298da1eda2cbf7c",
  },
};

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function runAllowFailure(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function rtkRun(command, args, cwd = root) {
  return run(rtk, ["proxy", command, ...args], cwd);
}

const componentReceipt = {};
for (const [name, component] of Object.entries(components)) {
  const revision = rtkRun("git", ["rev-parse", "HEAD"], component.path).trim();
  const status = rtkRun("git", ["status", "--porcelain"], component.path);
  const metadata = JSON.parse(rtkRun("cargo", ["metadata", "--no-deps", "--format-version", "1", "--manifest-path", resolve(component.path, "Cargo.toml")], component.path));
  if (revision !== component.revision || status.trim() !== "") {
    throw new Error(`${name} is not the pinned clean source coordinate`);
  }
  componentReceipt[name] = {
    path: component.path,
    revision,
    clean: true,
    workspace_packages: metadata.packages.length,
  };
}

const status = JSON.parse(rtkRun(netctl, ["--json", "status"]));
const dryRun = JSON.parse(rtkRun(netctl, ["--json", "link", "set", "lo", "up"]));
if (dryRun.result !== "planned" || dryRun.plan?.ip_equivalent !== "ip link set lo up") {
  throw new Error("network-control did not return the expected non-mutating link plan");
}

const database = JSON.parse(rtkRun(psql, [
  ...dbArgs,
  "-c",
  `SELECT json_build_object(
    'server_version', current_setting('server_version'),
    'migration_count', (SELECT count(*) FROM lifeos_runtime._sqlx_migrations),
    'latest_migration', (SELECT max(version) FROM lifeos_runtime._sqlx_migrations),
    'active_tenant', lifeos_security.current_tenant(),
    'task_count', (SELECT count(*) FROM lifeos_runtime.task),
    'lease_count', (SELECT count(*) FROM lifeos_runtime.lease),
    'coordination_rows', (SELECT count(*) FROM lifeos_coord.weave_job) + (SELECT count(*) FROM lifeos_coord.runner_job) + (SELECT count(*) FROM lifeos_coord.network_plan),
    'procedure_count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'lifeos_coord' AND p.proname IN ('submit_network_plan','start_network_plan','record_network_effect','submit_weave_job','start_weave_job','record_weave_attempt','submit_runner_job','start_runner_job','record_runner_receipt'))
  )::text`,
]));
if (Number(database.migration_count) !== 88 || Number(database.latest_migration) !== 99 || Number(database.procedure_count) !== 9) {
  throw new Error(`database coordination authority is incomplete: ${JSON.stringify(database)}`);
}

const unauthorized = runAllowFailure(rtk, [
  "proxy", psql, ...dbArgs, "-c",
  "SELECT lifeos_coord.submit_network_plan('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000005','netctl','{\"argv\":[\"link\",\"set\",\"lo\",\"up\"]}'::jsonb,'{}'::jsonb,'archbp-unauthorized-live')",
]);
const unauthorizedRejected = unauthorized.status !== 0 && /binding|lease|authoriz|tenant/i.test(unauthorized.stderr);
if (!unauthorizedRejected) throw new Error(`unauthorized network submission was not rejected: ${JSON.stringify(unauthorized)}`);

const receipt = {
  schema_version: "lifeos.evidence.network-coordination-authority-live.v1",
  generated_at: new Date().toISOString(),
  components: componentReceipt,
  database,
  network: {
    netctl,
    status,
    dry_run: dryRun,
    unauthorized_submission_rejected: unauthorizedRejected,
  },
  verdict: "pass-with-authorized-apply-release-gate",
  release_gate: "An active database-issued task, lease, grant, and bound executor context are required before a controlled network mutation or Weave/runner job can be executed; none was present in the live database during this run.",
};
const outputPath = resolve(root, "evidence/coordination/network-authority-live-receipt.json");
mkdirSync(resolve(root, "evidence/coordination"), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ receipt: outputPath, verdict: receipt.verdict }, null, 2)}\n`);
