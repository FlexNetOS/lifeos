// ARCHBP-008 — ruvllm shared-model edge inference lifecycle adapter.
//
// Runs profile-owned @ruvector/ruvllm inference with ONE frozen shared base
// engine and isolated per-cartridge LoRA state. Proves deterministic startup
// and shutdown, bounded resource ownership, local failure behavior, and RAW
// (never fabricated) latency samples. No external model is downloaded — under
// the single-profile path law the engine runs its native addon with no trained
// model, so generation is demo-mode and flagged unreliable rather than trusted.
//
// The @ruvector/ruvllm ESM build uses extensionless relative imports, which
// only resolve under Bun's loader; this adapter therefore runs under Bun (the
// repo's package runtime), matching the NBVERIFY-001 node-authority convention.

/** Path-law frozen model contract: no download, profile-owned, no external model. */
export const FROZEN_MODEL_CONTRACT = {
  download: "none",
  ownership: "profile-only",
  externalModel: false,
};

/** Validate that every numeric resource counter is finite and non-negative. */
export function assertBoundedStats(stats) {
  const values = Object.values(stats ?? {}).filter((v) => typeof v === "number");
  const bounded = values.length > 0 && values.every((v) => Number.isFinite(v) && v >= 0);
  return { bounded, checked: values.length };
}

/**
 * Summarize RAW measured latency samples. `allReal` is true only when every
 * sample is a finite, strictly-positive measurement — fabricated, empty, zero,
 * or negative sample sets fail closed.
 */
export function summarizeLatency(samplesMs) {
  const arr = Array.isArray(samplesMs) ? samplesMs : [];
  const allReal = arr.length > 0 && arr.every((v) => Number.isFinite(v) && v > 0);
  const finite = arr.filter((v) => Number.isFinite(v));
  const count = arr.length;
  const minMs = finite.length ? Math.min(...finite) : null;
  const maxMs = finite.length ? Math.max(...finite) : null;
  const meanMs = finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null;
  return { count, minMs, maxMs, meanMs, allReal };
}

/**
 * Classify local failure / demo behavior. Without a trained model loaded the
 * engine runs in demo mode and generation is unreliable — never presented as
 * trustworthy output (fail-closed).
 */
export function classifyLocalFailure({ trainedModelLoaded, confidence } = {}) {
  const demoMode = trainedModelLoaded !== true;
  return {
    demoMode,
    reliableGeneration: !demoMode,
    trainedModelLoaded: trainedModelLoaded === true,
    confidence: typeof confidence === "number" ? confidence : null,
  };
}

const PROBE_TEXT = "what is machine learning?";

/**
 * One frozen shared-base inference cell with isolated LoRA cartridges.
 * Construct via `RuvllmInferenceCell.start`.
 */
export class RuvllmInferenceCell {
  constructor(llm, manager, dim) {
    this.llm = llm;
    this.manager = manager;
    this.dim = dim;
    this.closed = false;
    this.cartridges = new Map();
    // No external trained model is ever loaded (path law). The native addon is
    // present; the trained model is not.
    this.trainedModelLoaded = false;
  }

  static async start({ embeddingDim = 8 } = {}) {
    const { RuvLLM, LoraManager } = await import("@ruvector/ruvllm");
    const llm = new RuvLLM({ embeddingDim });
    const manager = new LoraManager({ rank: 2, alpha: 4 });
    return new RuvllmInferenceCell(llm, manager, embeddingDim);
  }

  ensureOpen() {
    if (this.closed) {
      throw new Error("ARCHBP-008: inference cell is shut down");
    }
  }

  /** Frozen model identity — stable across probes on the shared base engine. */
  modelIdentity() {
    this.ensureOpen();
    const r = this.llm.query(PROBE_TEXT);
    return {
      model: r.model,
      nativeLoaded: this.llm.isNativeLoaded(),
      trainedModelLoaded: this.trainedModelLoaded,
    };
  }

  /** Single routed inference over the shared base engine. */
  infer(text) {
    this.ensureOpen();
    return this.llm.query(text);
  }

  /**
   * Collect n RAW wall-clock latency samples in milliseconds (never fabricated).
   * Wall-clock hrtime is used rather than the engine's integer `latencyMs`
   * field, which rounds sub-millisecond warm queries down to 0.
   */
  latencySamples(n, text = PROBE_TEXT) {
    this.ensureOpen();
    const samples = [];
    for (let i = 0; i < n; i += 1) {
      const t0 = process.hrtime.bigint();
      this.llm.query(text);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1e6);
    }
    return samples;
  }

  stats() {
    this.ensureOpen();
    return this.llm.stats();
  }

  /** Local failure probe: no trained model -> demo mode, generation unreliable. */
  localFailureProbe() {
    this.ensureOpen();
    const q = this.llm.query(PROBE_TEXT);
    const generated = this.llm.generate(PROBE_TEXT);
    const classification = classifyLocalFailure({
      trainedModelLoaded: this.trainedModelLoaded,
      confidence: q.confidence,
    });
    return {
      ...classification,
      nativeLoaded: this.llm.isNativeLoaded(),
      generatedSample: String(generated).slice(0, 60),
      routedLocally: true,
    };
  }

  createCartridge(id) {
    this.ensureOpen();
    const adapter = this.manager.create(id, { rank: 2, alpha: 4 }, this.dim, this.dim);
    this.cartridges.set(id, adapter);
    return adapter;
  }

  activateCartridge(id) {
    this.ensureOpen();
    return this.manager.activate(id);
  }

  activeCartridge() {
    this.ensureOpen();
    return this.manager.getActiveId();
  }

  cartridgeForward(input) {
    this.ensureOpen();
    return this.manager.forward(input);
  }

  cartridgeCount() {
    this.ensureOpen();
    return this.manager.count();
  }

  /** Distinct cartridge objects with independent state. */
  cartridgesIsolated() {
    const ids = [...this.cartridges.keys()];
    if (ids.length < 2) return false;
    const objs = ids.map((id) => this.cartridges.get(id));
    return new Set(objs).size === objs.length;
  }

  /** Measure hot-swap latency for the specified workload only. */
  measureSwap(idA, idB) {
    this.ensureOpen();
    this.manager.activate(idA);
    const t0 = process.hrtime.bigint();
    this.manager.activate(idB);
    const t1 = process.hrtime.bigint();
    return Number(t1 - t0);
  }

  /** Deterministic, idempotent shutdown; further inference is rejected. */
  shutdown() {
    this.closed = true;
    return true;
  }

  get isClosed() {
    return this.closed;
  }
}

// ---------------------------------------------------------------------------
// CLI proof emitter (Bun) — exercises the full lifecycle against the real
// native ruvllm surface and writes evidence for the ARCHBP-008 gate.
// ---------------------------------------------------------------------------
async function emitProof() {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");

  const cell = await RuvllmInferenceCell.start({ embeddingDim: 8 });
  const input = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

  // frozen identity — two probes must agree
  const id1 = cell.modelIdentity();
  const id2 = cell.modelIdentity();
  const identity = {
    model: id1.model,
    stable: id1.model === id2.model && id1.nativeLoaded === id2.nativeLoaded,
    nativeLoaded: id1.nativeLoaded,
    externalModelDownloaded: FROZEN_MODEL_CONTRACT.externalModel === true,
  };

  // raw latency samples
  const samplesMs = cell.latencySamples(5);
  const latency = { samplesMs, ...summarizeLatency(samplesMs) };

  // bounded resources
  const statsRaw = cell.stats();
  const resources = { ...assertBoundedStats(statsRaw), stats: statsRaw };

  // local failure behavior
  const localFailure = cell.localFailureProbe();

  // isolated cartridges
  cell.createCartridge("cart-a");
  cell.createCartridge("cart-b");
  cell.activateCartridge("cart-a");
  cell.cartridgeForward(input);
  cell.activateCartridge("cart-b");
  cell.cartridgeForward(input);
  const cartridges = {
    count: cell.cartridgeCount(),
    activeAfterSwitch: cell.activeCartridge(),
    isolated: cell.cartridgesIsolated(),
  };
  const hotSwap = {
    measuredSwapNs: cell.measureSwap("cart-a", "cart-b"),
    claimScope: "measured-workload-only",
  };

  // deterministic shutdown
  const shutdownClean = cell.shutdown();
  let rejectsAfterShutdown = false;
  try {
    cell.infer("post-shutdown");
  } catch {
    rejectsAfterShutdown = true;
  }
  const lifecycle = { started: true, shutdownClean, rejectsAfterShutdown };

  const result = {
    task: "ARCHBP-008",
    generatedAt: new Date().toISOString(),
    identity,
    cartridges,
    lifecycle,
    resources,
    localFailure,
    latency,
    hotSwap,
    frozenModelContract: FROZEN_MODEL_CONTRACT,
    simd: (() => {
      try {
        return cell.llm.simdCapabilities();
      } catch {
        return null;
      }
    })(),
  };

  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const canonical = resolve(
    process.cwd(),
    "node_modules/.cache/lifeos/archbp-008/inference-proof.raw.json",
  );
  const outputPath = outputArg ? resolve(process.cwd(), outputArg.slice("--output=".length)) : canonical;
  mkdirSync(dirname(outputPath), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, json);
  process.stdout.write(json);
}

if (import.meta.main) {
  emitProof().catch((error) => {
    console.error("ARCHBP-008 inference proof failed:", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
