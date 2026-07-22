// ARCHBP-010 — swarm scale and hardware acceptance harness.
//
// Replaces the blueprint's "50+ agents / fixed-latency" assertions with
// reproducible scale measurements. Real worker_threads run a bounded CPU
// workload at 1/8/16/32/50 agents (50 only when host capacity permits),
// publishing RAW per-agent latency samples, 95% confidence intervals, exact
// hardware/software identity, and an overload + recovery test. Only CPU and
// memory cells are measured on this host — GPU, network, and storage cells are
// explicitly declared unmeasured, and no claim exceeds the measured evidence.
// Runs under Bun/Node.

import os from "node:os";

export const SCALE_STEPS = [1, 8, 16, 32, 50];

/** Minimum logical CPUs required to run the 50-agent step as a valid measurement. */
const FIFTY_MIN_CPUS = 16;

export function scaleSchedule(logicalCpus) {
  const scales = [];
  const skipped = [];
  for (const s of SCALE_STEPS) {
    if (s <= 32 || logicalCpus >= FIFTY_MIN_CPUS) scales.push(s);
    else skipped.push(s);
  }
  const reason = skipped.length
    ? `steps ${skipped.join(",")} skipped: >=${FIFTY_MIN_CPUS} logical CPUs are required for a valid capacity measurement (host has ${logicalCpus})`
    : "full ladder within host capacity";
  return { scales, skipped, reason };
}

export function percentile(samples, p) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function confidenceInterval95(samples) {
  const n = samples.length;
  if (n === 0) return { mean: 0, low: 0, high: 0, n: 0, std: 0 };
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const margin = n > 1 ? 1.96 * (std / Math.sqrt(n)) : 0;
  return { mean, low: mean - margin, high: mean + margin, n, std };
}

export function declaredCells() {
  return {
    cpu: true,
    memory: true,
    gpu: false,
    network: false,
    storage: false,
    note: "This harness measures CPU (worker-thread parallelism) and process memory cells only. GPU, network, and storage cells are not exercised on this host and are not claimed.",
  };
}

export function hardwareIdentity() {
  const cpus = os.cpus();
  return {
    arch: os.arch(),
    platform: os.platform(),
    cpuModel: cpus[0]?.model ?? "unknown",
    logicalCpus: cpus.length,
    totalMemBytes: os.totalmem(),
    nodeVersion: process.version,
  };
}

// ---------------------------------------------------------------------------
// Real worker-thread agent workload.
// ---------------------------------------------------------------------------
const WORKER_SOURCE = `
  const { parentPort, workerData } = require('node:worker_threads');
  const { createHash } = require('node:crypto');
  let h = 'archbp-010-seed';
  for (let i = 0; i < workerData.iterations; i++) {
    h = createHash('sha256').update(h).digest('hex');
  }
  parentPort.postMessage(h.length);
`;

async function agentLatencyMs(Worker, iterations) {
  const t0 = process.hrtime.bigint();
  return new Promise((resolve) => {
    const w = new Worker(WORKER_SOURCE, { eval: true, workerData: { iterations } });
    const done = () => {
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      w.terminate().then(() => resolve(dt)).catch(() => resolve(dt));
    };
    w.on("message", done);
    w.on("error", done);
  });
}

async function runScale(Worker, scale, iterations) {
  const rssBefore = process.memoryUsage().rss;
  const t0 = process.hrtime.bigint();
  const samplesMs = await Promise.all(
    Array.from({ length: scale }, () => agentLatencyMs(Worker, iterations)),
  );
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const rssPeak = Math.max(rssBefore, process.memoryUsage().rss);
  const ci = confidenceInterval95(samplesMs);
  return {
    scale,
    rawSampleCount: samplesMs.length,
    samplesMs: samplesMs.map((x) => Math.round(x * 1000) / 1000),
    meanMs: ci.mean,
    p50Ms: percentile(samplesMs, 50),
    p95Ms: percentile(samplesMs, 95),
    ci,
    wallMs,
    throughputPerSec: wallMs > 0 ? (scale / wallMs) * 1000 : 0,
    memPeakBytes: rssPeak,
  };
}

// ---------------------------------------------------------------------------
// CLI proof emitter (Bun) — real scale sweep + overload + recovery.
// ---------------------------------------------------------------------------
async function emitProof() {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { Worker } = await import("node:worker_threads");

  const hardware = hardwareIdentity();
  const schedule = scaleSchedule(hardware.logicalCpus);
  const iterations = 40_000;

  const sweep = [];
  for (const scale of schedule.scales) {
    sweep.push(await runScale(Worker, scale, iterations));
  }

  // Overload: oversubscribe to ~2x logical CPUs; recovery: return to baseline.
  const baselineScale = 16;
  const overloadScale = Math.max(hardware.logicalCpus * 2, 64);
  const baseline = await runScale(Worker, baselineScale, iterations);
  const overloadRun = await runScale(Worker, overloadScale, iterations);
  const recovery = await runScale(Worker, baselineScale, iterations);

  const overload = {
    baselineScale,
    overloadScale,
    baselineMeanMs: baseline.meanMs,
    overloadMeanMs: overloadRun.meanMs,
    degraded: overloadRun.meanMs > baseline.meanMs,
  };
  const recoveryResult = {
    recoveryMeanMs: recovery.meanMs,
    // 4x tolerates shared-host CPU contention (the full suite runs many spec
    // files concurrently) while still distinguishing recovery from the
    // deliberately saturated overload phase.
    recovered: recovery.meanMs <= baseline.meanMs * 4.0,
  };

  const result = {
    task: "ARCHBP-010",
    generatedAt: new Date().toISOString(),
    hardware,
    schedule,
    iterationsPerAgent: iterations,
    cells: declaredCells(),
    sweep,
    overload,
    recovery: recoveryResult,
    honestLimits: {
      gpuMeasured: false,
      networkMeasured: false,
      storageMeasured: false,
      fiftyAgentStepRun: schedule.scales.includes(50),
      note: "Only CPU/memory cells measured. Latency samples are wall-clock per-agent (worker spawn + bounded SHA-256 workload) — no fixed-latency or throughput claim is made beyond these measured samples.",
    },
  };

  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const canonical = resolve(process.cwd(), "node_modules/.cache/lifeos/archbp-010/scale-proof.raw.json");
  const outputPath = outputArg ? resolve(process.cwd(), outputArg.slice("--output=".length)) : canonical;
  mkdirSync(dirname(outputPath), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, json);
  process.stdout.write(json);
}

if (import.meta.main) {
  emitProof().catch((error) => {
    console.error("ARCHBP-010 swarm scale proof failed:", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
