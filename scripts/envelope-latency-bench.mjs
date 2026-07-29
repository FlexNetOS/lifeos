// ARCHBP-130 — Benchmark in-envelope vs bare-native compute latency and
// record the result for the T10.7 release gauntlet. The workload times
// ITSELF (perf_counter inside the process), so what is measured is runtime
// latency — the I04 claim — with envelope setup cost reported separately
// and honestly. Runs under Bun/Node on the target host.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..");
const engineCandidates = [
  process.env.YZX_ENVELOPE_BIN
    ? { kind: "shell", path: process.env.YZX_ENVELOPE_BIN }
    : null,
  { kind: "nu", path: "/home/flexnetos/meta/src/yazelix/envelope/yzx-envelope.nu" },
  { kind: "shell", path: "/home/flexnetos/meta/src/yazelix/envelope/yzx-envelope.sh" },
  { kind: "shell", path: "/home/flexnetos/meta/src/yazelix/.claude/worktrees/archbp-065-envelope/envelope/yzx-envelope.sh" },
].filter(Boolean);
const engine = engineCandidates.find(({ path }) => {
  try { execFileSync("test", ["-f", path]); return true; } catch { return false; }
});
if (!engine) throw new Error("yzx-envelope engine not found");

const python = execFileSync("bash", ["-c", 'readlink -f "$(command -v python3)"'], { encoding: "utf8" }).trim();
// The profile may rotate its moving symlink during a generation switch. Resolve
// Nushell through the active profile-owned PATH instead of assuming a fixed
// ~/.nix-profile/bin/nu link exists.
const nuBinary = process.env.LIFEOS_NU_BIN
  ?? execFileSync("bash", ["-c", "command -v nu"], { encoding: "utf8" }).trim();
// Two identical timed passes make scheduler noise a smaller fraction of the
// sample while keeping the comparison inside the same process and namespace.
const WORKLOAD = "import time; t=time.perf_counter(); [sum(i*i for i in range(20_000_000)) for _ in range(2)]; print(time.perf_counter()-t)";
const RUNS = 9;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function bareRun() {
  return Number(execFileSync(python, ["-c", WORKLOAD], { encoding: "utf8" }).trim());
}

function envelopeRun(i) {
  const wall0 = process.hrtime.bigint();
  const launcher = engine.kind === "nu"
    ? [nuBinary, engine.path]
    : ["bash", engine.path];
  const out = execFileSync(
    launcher[0],
    [...launcher.slice(1), "enter", "--id", `bench-${i}`, "--", python, "-c", WORKLOAD],
    { encoding: "utf8" },
  ).trim();
  const wallMs = Number(process.hrtime.bigint() - wall0) / 1e6;
  return { compute: Number(out), wallMs };
}

// Interleave to spread thermal/scheduler noise fairly across both arms.
const bare = [];
const enveloped = [];
for (let i = 0; i < RUNS; i += 1) {
  bare.push(bareRun());
  enveloped.push(envelopeRun(i));
}

const bareMedian = median(bare);
const envMedian = median(enveloped.map((e) => e.compute));
const overheadPct = ((envMedian - bareMedian) / bareMedian) * 100;
const setupMedianMs = median(enveloped.map((e) => e.wallMs - e.compute * 1000));

const result = {
  schema_version: "lifeos.envelope-latency-bench.v1",
  recorded_for: "yzx-iso t10-7-latency-benchmark (T10.7 release gauntlet)",
  workload: "python3 sum(i*i for i in range(20_000_000)) self-timed via perf_counter",
  runs_per_arm: RUNS,
  bare_median_s: bareMedian,
  envelope_median_s: envMedian,
  runtime_overhead_pct: overheadPct,
  envelope_setup_median_ms: setupMedianMs,
  setup_cost_note: "one-time per-envelope bwrap construction cost, excluded from the runtime-latency claim (I04) and reported honestly here",
  bare_samples_s: bare,
  envelope_samples_s: enveloped.map((e) => e.compute),
};

const outputArg = process.argv.find((a) => a.startsWith("--output="));
const outPath = outputArg
  ? resolve(process.cwd(), outputArg.slice("--output=".length))
  : resolve(repoRoot, "evidence/benchmarks/envelope_latency_benchmark.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `envelope latency: bare ${bareMedian.toFixed(4)}s vs envelope ${envMedian.toFixed(4)}s -> runtime overhead ${overheadPct.toFixed(2)}% (setup ~${setupMedianMs.toFixed(0)}ms/envelope)`,
);
