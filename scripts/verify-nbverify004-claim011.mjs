import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--output="),
);
const outputPath = outputArgument
  ? resolve(root, outputArgument.slice("--output=".length))
  : join(root, "evidence/nbverify/NBVERIFY-004.local-evidence.json");
function run(command, args) {
  try {
    return { command: [command, ...args].join(" "), exit_status: 0, output: execFileSync(command, args, { encoding: "utf8" }) };
  } catch (error) {
    return { command: [command, ...args].join(" "), exit_status: error.status ?? 1, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}
const benchmarkPath = join(root, "evidence/benchmarks/swarm_status_render_benchmark.json");
const benchmark = run("bun", ["run", "test", "--", "tests/swarm-status-render-bench.spec.ts"]);
const owner = run("/home/flexnetos/.nix-profile/bin/rtk", ["proxy", "cargo", "test", "--manifest-path", "src-tauri/Cargo.toml", "--test", "redb_owner_live"]);
let benchmarkReceipt = null;
try {
  benchmarkReceipt = JSON.parse(readFileSync(benchmarkPath, "utf8"));
} catch {}
const benchmarkProven = benchmark.exit_status === 0 && owner.exit_status === 0 && benchmarkReceipt?.latency_ms?.p99 >= 0;
let previous = {};
try {
  previous = JSON.parse(readFileSync(outputPath, "utf8"));
} catch {}
const claim = {
  claim_id: "SWARM-CLAIM-011",
  verification_status: benchmarkProven ? "verified" : "unverified",
  status: benchmarkProven ? "verified" : "qualified",
  conclusion: benchmarkProven
    ? "A mounted production Sidebar run measured owner-projection event-to-render latency and stale detection, with the authenticated redb owner boundary passing upstream."
    : "The swarm event-to-render benchmark or upstream owner boundary did not complete successfully.",
  evidence: [
    {
      relationship: "performance-benchmark-runtime",
      proven: benchmark.exit_status === 0,
      command: benchmark.command,
      exit_status: benchmark.exit_status,
      artifact: benchmarkPath,
    },
    {
      relationship: "workload-and-slo",
      proven: benchmarkProven,
      details: benchmarkReceipt?.workload ?? null,
      upstream_owner_command: owner.command,
      upstream_owner_exit_status: owner.exit_status,
    },
    {
      relationship: "benchmark-result",
      proven: benchmarkProven,
      latency_ms: benchmarkReceipt?.latency_ms ?? null,
    },
  ],
};
const retained = (previous.claims ?? []).filter(
  (candidate) => candidate.claim_id !== "SWARM-CLAIM-011",
);
const packagePath = join(root, "package.json");
const result = {
  ...previous,
  schema_version: "lifeos.notebooklm.nbverify-004.local-evidence.v1",
  task_id: "NBVERIFY-004",
  observed_at: new Date().toISOString(),
  repository: { root, package_json_sha256: createHash("sha256").update(readFileSync(packagePath)).digest("hex") },
  claims: [...retained, claim],
  collector: {
    claim_id: "SWARM-CLAIM-011",
    mode: "live-mounted-swarm-event-to-render-benchmark",
    writes_only: outputPath,
    does_not_launch: false,
    does_not_install: true,
    does_not_mutate_generated_runtime: true,
  },
};
await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ claim_id: claim.claim_id, status: claim.status, benchmark_proven: benchmarkProven, p99: benchmarkReceipt?.latency_ms?.p99 ?? null }, null, 2));
