// ARCHBP-007 — AgentDB RVF active/passive memory lifecycle adapter.
//
// Separates passive PostgreSQL/RuVector macro memory (the sole durable macro
// authority, owned externally by the ARCHBP-003 RuVector adapter and the live
// cluster) from portable per-agent AgentDB `.rvf` cognition (the active plane).
//
// The active plane is `@ruvector/rvf` via `agentdb/backends/self-learning`
// (SelfLearningRvfBackend, rvfBackend: "node"). This adapter owns the active
// lifecycle — identity, working state, witness-bound feedback, learning traces,
// portable export/import, crash recovery — and enforces the authority boundary
// so the `.rvf` never silently becomes a competing macro authority.
//
// Two observed native API defects are handled fail-closed rather than papered
// over (see ARCHBP-007 proof):
//   1. RvfStatus.fileSizeBytes reports 0 for a non-empty store — corrected from
//      the real on-disk size via fs.stat.
//   2. Chain-level witness verification is unavailable on the installed surface
//      (getWitnessChain()/verifyWitnessChain() return null; the legacy
//      getBackend().verifyWitness() is not a function) — witness is reported
//      verified ONLY when a real chain verifies, never optimistically.

import { copyFileSync, statSync } from "node:fs";

/** The sole passive durable macro authority. The active .rvf is never this. */
export const PASSIVE_MACRO_AUTHORITY = "postgresql+ruvector";
/** The active, portable, per-agent cognition plane. */
export const ACTIVE_PLANE = "rvf";

/** Raised when the active plane is asked to act as the passive macro authority. */
export class AuthorityViolationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthorityViolationError";
  }
}

/**
 * Guard: the active RVF plane may serve its own role but must never be treated
 * as the passive macro authority. Returns the role when permitted.
 */
export function assertNotMacroAuthority(role) {
  if (role === PASSIVE_MACRO_AUTHORITY) {
    throw new AuthorityViolationError(
      `active plane '${ACTIVE_PLANE}' may not act as the passive macro authority '${PASSIVE_MACRO_AUTHORITY}'`,
    );
  }
  return role;
}

/**
 * Correct the RvfStatus.fileSizeBytes underreport defect with the real on-disk
 * size, preserving the raw value for auditability.
 */
export function correctStatusBytes(rawStatus, realFsBytes) {
  const raw = rawStatus && typeof rawStatus.fileSizeBytes === "number"
    ? rawStatus.fileSizeBytes
    : null;
  return {
    ...rawStatus,
    fileSizeBytes: realFsBytes,
    fileSizeBytesRaw: raw,
    corrected: raw !== realFsBytes,
  };
}

/** Count persisted witness segments (the tamper-evident substrate in the .rvf). */
export function classifyWitnessSegments(segments) {
  const list = Array.isArray(segments) ? segments : [];
  const witnessSegmentCount = list.filter((s) => s && s.segType === "witness").length;
  return { witnessSegmentCount, substratePresent: witnessSegmentCount > 0 };
}

/**
 * Fail-closed witness evaluation. `verified` is true ONLY when a non-empty
 * chain verifies successfully via the native accelerator; every other state
 * (null chain, missing verify result, invalid chain) reports unverified with a
 * reason. The persisted witness substrate is always reported honestly.
 */
export function evaluateWitness({ chain, verifyResult, witnessSegments }) {
  const { witnessSegmentCount, substratePresent } = classifyWitnessSegments(witnessSegments);
  const base = { substratePresent, witnessSegmentCount, entryCount: 0 };

  if (!chain || chain.length === 0) {
    return { ...base, verified: false, reason: "witness-chain-unavailable" };
  }
  if (!verifyResult || typeof verifyResult.valid !== "boolean") {
    return { ...base, verified: false, reason: "verify-unavailable" };
  }
  if (verifyResult.valid !== true) {
    return { ...base, verified: false, reason: "chain-invalid" };
  }
  return {
    ...base,
    verified: true,
    entryCount: verifyResult.entryCount ?? witnessSegmentCount,
    reason: "verified",
  };
}

function toFloat32(vector) {
  return vector instanceof Float32Array ? vector : Float32Array.from(vector);
}

/**
 * Per-agent active RVF memory. Wraps SelfLearningRvfBackend and enforces the
 * active/passive authority boundary. Construct via `AgentRvfMemory.open`.
 */
export class AgentRvfMemory {
  constructor(backend, storagePath, agentId) {
    this.backend = backend;
    this.storagePath = storagePath;
    this.agentId = agentId;
  }

  static async open({
    agentId,
    storagePath,
    dimension = 8,
    metric = "cosine",
    learning = true,
  }) {
    if (typeof storagePath !== "string" || !storagePath.endsWith(".rvf")) {
      throw new Error(`active store path must be a .rvf file: ${storagePath}`);
    }
    const { SelfLearningRvfBackend } = await import("agentdb/backends/self-learning");
    const backend = await SelfLearningRvfBackend.create({
      dimension,
      metric,
      storagePath,
      rvfBackend: "node",
      learning,
      learningDimension: dimension,
      tickIntervalMs: 1000,
      trainingBatchSize: 1,
    });
    return new AgentRvfMemory(backend, storagePath, agentId);
  }

  static async importFrom(path, opts = {}) {
    return AgentRvfMemory.open({
      agentId: opts.agentId ?? "imported",
      storagePath: path,
      dimension: opts.dimension ?? 8,
      metric: opts.metric ?? "cosine",
      learning: false,
    });
  }

  /** Record active working state. */
  async remember(id, vector, metadata) {
    await this.backend.insertAsync(id, toFloat32(vector), metadata);
  }

  /** Retrieve nearest active memories. */
  async recall(query, k) {
    return this.backend.searchAsync(toFloat32(query), k);
  }

  /** Witness-bound feedback: records reward and appends a mutation witness. */
  feedback(queryId, quality) {
    this.backend.recordFeedback(queryId, quality);
    this.backend.recordMutationWitness(`feedback:${queryId}`);
  }

  /** Drive a learning trace from accumulated feedback and persist. */
  async learn() {
    await this.backend.forceLearn();
    await this.backend.flush();
  }

  /** Stable per-agent identity and provenance. */
  async identity() {
    const b = this.backend.getBackend();
    return {
      fileId: await b.fileId(),
      parentId: await b.parentId(),
      lineageDepth: await b.lineageDepth(),
    };
  }

  /** Fail-closed witness evaluation over the real installed surface. */
  async witness() {
    const b = this.backend.getBackend();
    return evaluateWitness({
      chain: this.backend.getWitnessChain(),
      verifyResult: this.backend.verifyWitnessChain(),
      witnessSegments: await b.segments(),
    });
  }

  /** Store status with the fileSizeBytes defect corrected from disk. */
  async status() {
    const b = this.backend.getBackend();
    return correctStatusBytes(await b.status(), statSync(this.storagePath).size);
  }

  getLearningStats() {
    return this.backend.getLearningStats();
  }

  /** The declared passive macro authority — external, never this store. */
  passiveMacroAuthority() {
    return PASSIVE_MACRO_AUTHORITY;
  }

  /** Boundary guard: reading this as macro authority is a violation. */
  get macroAuthority() {
    throw new AuthorityViolationError(
      "the active per-agent .rvf plane is never the durable macro authority; PostgreSQL/RuVector is",
    );
  }

  /** Portable export: persist and copy the .rvf to a new path. */
  async exportTo(path) {
    await this.learn();
    copyFileSync(this.storagePath, path);
    return path;
  }

  destroy() {
    this.backend.destroy();
  }
}

// ---------------------------------------------------------------------------
// CLI proof emitter — exercises the full lifecycle against the real native
// surface and writes deterministic-shaped evidence for the ARCHBP-007 gate.
// ---------------------------------------------------------------------------
async function emitProof() {
  const { mkdtempSync, statSync: stat, writeFileSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve, dirname } = await import("node:path");

  const D = 8;
  const vec = (s) => Float32Array.from({ length: D }, (_, i) => Math.sin(s * (i + 1)));
  const workDir = mkdtempSync(join(tmpdir(), "archbp007-proof-"));
  const agentPath = join(workDir, "agent-archbp007.rvf");

  const agent = await AgentRvfMemory.open({
    agentId: "archbp-007-alpha",
    storagePath: agentPath,
    dimension: D,
    metric: "cosine",
    learning: true,
  });

  await agent.remember("m1", vec(1), { kind: "note" });
  await agent.remember("m2", vec(2), { kind: "note" });
  await agent.remember("m3", vec(3), { kind: "note" });
  const recall = await agent.recall(vec(1), 2);
  agent.feedback(recall[0].id, 1.0);
  await agent.learn();

  const identity = await agent.identity();
  const witness = await agent.witness();
  const status = await agent.status();
  const learningStats = agent.getLearningStats();

  let macroAuthorityGuardThrew = false;
  try {
    void agent.macroAuthority;
  } catch (error) {
    macroAuthorityGuardThrew = error instanceof AuthorityViolationError;
  }

  const exportPath = join(workDir, "exported-archbp007.rvf");
  await agent.exportTo(exportPath);
  const exportBytes = stat(exportPath).size;
  agent.destroy();

  const reopened = await AgentRvfMemory.importFrom(exportPath, { dimension: D });
  const reopenIdentity = await reopened.identity();
  const reopenRecall = await reopened.recall(vec(1), 2);
  reopened.destroy();

  const result = {
    task: "ARCHBP-007",
    generatedAt: new Date().toISOString(),
    identity,
    active: {
      remembered: 3,
      recall: recall.map((r) => ({ id: String(r.id), distance: r.distance })),
    },
    feedback: {
      recorded: true,
      solverTrainCount: learningStats.solverTrainCount,
    },
    witness,
    status,
    portability: { exported: true, exportBytes },
    recovery: {
      reopenFileId: reopenIdentity.fileId,
      recovered: reopenIdentity.fileId === identity.fileId,
      reopenRecall: reopenRecall.map((r) => ({ id: String(r.id), distance: r.distance })),
    },
    authority: {
      passive: PASSIVE_MACRO_AUTHORITY,
      active: ACTIVE_PLANE,
      macroAuthorityGuardThrew,
    },
    learningStats,
  };

  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  // Default to the gitignored cache: the RVF fileId is randomly assigned per
  // store, so this evidence is non-deterministic and is never committed. The
  // ARCHBP-007 spec regenerates it live via --output on every run.
  const canonical = resolve(
    process.cwd(),
    "node_modules/.cache/lifeos/archbp-007/lifecycle-proof.raw.json",
  );
  const outputPath = outputArg ? resolve(process.cwd(), outputArg.slice("--output=".length)) : canonical;
  mkdirSync(dirname(outputPath), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, json);
  process.stdout.write(json);

  const { rmSync } = await import("node:fs");
  rmSync(workDir, { recursive: true, force: true });
}

if (import.meta.main) {
  emitProof().catch((error) => {
    console.error("ARCHBP-007 lifecycle proof failed:", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
