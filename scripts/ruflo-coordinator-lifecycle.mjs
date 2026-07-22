// ARCHBP-014 — Ruflo swarm coordinator lifecycle adapter.
//
// Binds Ruflo coordination (installed primary source `ruflo`, npm ~ruvnet) to
// the canonical task-graph authority, real AgentDB identities (ARCHBP-007) and
// RuvLTRA routing (ARCHBP-013). The coordinator ONLY dispatches work the
// canonical task graph authorizes (Ready) — it cannot invent tasks, cannot
// mark a task complete (completion is the Planning Spine's authority via an
// accepted proof record), retries are bounded and idempotent, cancellation and
// timeout stop progress, budget exhaustion fails closed, and proof emission is
// append-only candidate emission that only the spine can accept. The full Ruflo
// swarm platform (CLI/MCP/docker) is NOT spun up — that would be a heavy live
// route the gate forbids; this adapter proves the authority contract offline.
//
// Runs under Bun.

import { createHash } from "node:crypto";

/** Only a task that exists in the canonical graph AND is Ready may be dispatched. */
export function authorizeDispatch(taskId, taskGraph) {
  if (!Object.prototype.hasOwnProperty.call(taskGraph ?? {}, taskId)) {
    return { authorized: false, reason: "not-in-canonical-graph" };
  }
  if (taskGraph[taskId].status !== "Ready") {
    return { authorized: false, reason: "not-ready" };
  }
  return { authorized: true, reason: "authorized" };
}

/** Retry is bounded by maxRetries. */
export function retryPolicy(attempts, maxRetries) {
  return { allowed: attempts < maxRetries, exhausted: attempts >= maxRetries };
}

/** Budget check fails closed when a dispatch would exceed the remaining budget. */
export function budgetCheck(spent, cost, budget) {
  return { allowed: spent + cost <= budget, remaining: budget - spent };
}

const TERMINAL = new Set(["cancelled", "timed-out", "succeeded"]);

export class RufloCoordinator {
  constructor(taskGraph, { maxRetries = 2, budget = 100, primarySourceVersion = null } = {}) {
    this.taskGraph = taskGraph ?? {};
    this.maxRetries = maxRetries;
    this.budget = budget;
    this.primarySourceVersion = primarySourceVersion;
    this.spent = 0;
    this.attemptOf = new Map();
    this.dispatches = new Map();
    this.proofLog = [];
  }

  dispatch(taskId, binding = {}) {
    const auth = authorizeDispatch(taskId, this.taskGraph);
    if (!auth.authorized) {
      throw new Error(`ARCHBP-014: dispatch refused (${auth.reason}) for ${taskId}`);
    }
    const attempt = this.attemptOf.get(taskId) ?? 0;
    const id = createHash("sha256").update(`${taskId}:${attempt}`).digest("hex").slice(0, 16);
    if (this.dispatches.has(id)) {
      return this.dispatches.get(id); // idempotent: same task + attempt
    }
    const cost = typeof binding.cost === "number" ? binding.cost : 0;
    const check = budgetCheck(this.spent, cost, this.budget);
    if (!check.allowed) {
      throw new Error(`ARCHBP-014: budget exhausted (remaining ${check.remaining}, cost ${cost})`);
    }
    this.spent += cost;
    const record = {
      id,
      taskId,
      attempt,
      agentIdentity: binding.agentIdentity ?? null,
      cartridgeId: binding.cartridgeId ?? null,
      route: binding.route ?? "local",
      cost,
      deadline: binding.deadline ?? null,
      state: "dispatched",
    };
    this.dispatches.set(id, record);
    if (!this.attemptOf.has(taskId)) this.attemptOf.set(taskId, 0);
    return record;
  }

  state(id) {
    return this.dispatches.get(id)?.state;
  }

  markRunning(id) {
    this.transition(id, "running");
  }

  markSucceeded(id, _evidence) {
    this.transition(id, "succeeded");
  }

  markFailed(id, _error) {
    this.transition(id, "failed");
  }

  transition(id, next) {
    const record = this.dispatches.get(id);
    if (!record) throw new Error(`ARCHBP-014: unknown dispatch ${id}`);
    if (TERMINAL.has(record.state)) {
      throw new Error(`ARCHBP-014: dispatch ${id} is terminal (${record.state}); cannot ${next}`);
    }
    record.state = next;
  }

  cancel(id) {
    const record = this.dispatches.get(id);
    if (!record) throw new Error(`ARCHBP-014: unknown dispatch ${id}`);
    record.state = "cancelled";
  }

  checkTimeout(id, now) {
    const record = this.dispatches.get(id);
    if (!record) throw new Error(`ARCHBP-014: unknown dispatch ${id}`);
    if (record.deadline !== null && now > record.deadline && !TERMINAL.has(record.state)) {
      record.state = "timed-out";
    }
    return record.state;
  }

  /** Bounded, idempotent retry. Returns null when the retry budget is exhausted. */
  retry(taskId, binding = {}) {
    const attempts = this.attemptOf.get(taskId) ?? 0;
    if (!retryPolicy(attempts, this.maxRetries).allowed) {
      return null;
    }
    this.attemptOf.set(taskId, attempts + 1);
    return this.dispatch(taskId, binding);
  }

  /**
   * Emit an append-only proof CANDIDATE. The coordinator can never accept a
   * completion — only the Planning Spine can (accepted=false always here).
   */
  emitProofCandidate(taskId, evidence) {
    const candidate = {
      seq: this.proofLog.length + 1,
      taskId,
      evidence,
      status: "candidate",
      accepted: false,
    };
    this.proofLog.push(candidate);
    return candidate;
  }
  // NB: there is deliberately no `completeTask` method — the coordinator cannot
  // authorize completion.
}

// ---------------------------------------------------------------------------
// CLI proof emitter (Bun) — real ruflo primary source + real bindings.
// ---------------------------------------------------------------------------
async function emitProof() {
  const { writeFileSync, mkdirSync, existsSync, readFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { resolve, dirname, join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);

  // Ruflo primary source verification (installed from npm ~ruvnet).
  const rufloPkgPath = require.resolve("ruflo/package.json");
  const rufloPkg = JSON.parse(readFileSync(rufloPkgPath, "utf8"));
  const primarySource = {
    rufloInstalled: existsSync(rufloPkgPath),
    version: rufloPkg.version,
    publisher: "ruvnet (npm ~ruvnet)",
  };

  // Real RuvLTRA route (ARCHBP-013) — local-only default.
  const { decideRoute, defaultPolicy } = await import("./ruvltra-routing-lifecycle.mjs");
  const routed = decideRoute(
    { complexity: 0.9, confidence: 0.9, privacy: false, estimatedCost: 0.1, resourceExhausted: false, cloudOutage: false },
    defaultPolicy(),
  );

  // Real AgentDB identity (ARCHBP-007).
  const { AgentRvfMemory } = await import("./agentdb-rvf-lifecycle.mjs");
  const workDir = mkdtempSync(join(tmpdir(), "archbp014-agent-"));
  let agentFileId;
  try {
    const agent = await AgentRvfMemory.open({ agentId: "coordinator-agent", storagePath: join(workDir, "coord.rvf"), dimension: 8 });
    agentFileId = (await agent.identity()).fileId;
    agent.destroy();
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  const graph = {
    "ARCHBP-100": { status: "Ready" },
    "ARCHBP-101": { status: "Blocked" },
    "ARCHBP-102": { status: "Complete" },
  };
  const c = new RufloCoordinator(graph, { maxRetries: 2, budget: 10, primarySourceVersion: primarySource.version });
  const binding = { agentIdentity: agentFileId, cartridgeId: "cart-1", route: routed.route, cost: 1 };

  // authority
  const authority = {
    readyAuthorized: authorizeDispatch("ARCHBP-100", graph).authorized,
    inventedRejected: !authorizeDispatch("ARCHBP-999", graph).authorized,
    nonReadyRejected: !authorizeDispatch("ARCHBP-101", graph).authorized && !authorizeDispatch("ARCHBP-102", graph).authorized,
  };

  // dispatch + identity binding
  const d = c.dispatch("ARCHBP-100", binding);
  const dIdem = c.dispatch("ARCHBP-100", binding);
  const binding_ = {
    agentIdentityBound: d.agentIdentity === agentFileId && d.id === dIdem.id,
    agentFileId,
    routeIsLocalDefault: d.route === "local",
    cartridgeBound: d.cartridgeId === "cart-1",
  };

  // cancellation
  const cancelC = new RufloCoordinator(graph, { maxRetries: 2, budget: 10 });
  const cd = cancelC.dispatch("ARCHBP-100", binding);
  cancelC.cancel(cd.id);
  let cancelStopped = false;
  try { cancelC.markSucceeded(cd.id, {}); } catch { cancelStopped = cancelC.state(cd.id) === "cancelled"; }

  // timeout
  const toC = new RufloCoordinator(graph, { maxRetries: 2, budget: 10 });
  const td = toC.dispatch("ARCHBP-100", { ...binding, deadline: 100 });
  toC.checkTimeout(td.id, 200);
  const timedOut = toC.state(td.id) === "timed-out";

  // bounded retry (partial failure recovery, no completion)
  const rC = new RufloCoordinator(graph, { maxRetries: 2, budget: 100 });
  const rd = rC.dispatch("ARCHBP-100", binding);
  rC.markFailed(rd.id, "transient");
  const retry1 = rC.retry("ARCHBP-100", binding);
  const retry2 = rC.retry("ARCHBP-100", binding);
  const retry3 = rC.retry("ARCHBP-100", binding);
  const retryBounded = retry1 !== null && retry2 !== null && retry3 === null;

  // budget fails closed
  const bC = new RufloCoordinator({ "ARCHBP-100": { status: "Ready" }, "ARCHBP-200": { status: "Ready" } }, { maxRetries: 2, budget: 1 });
  bC.dispatch("ARCHBP-100", { ...binding, cost: 1 });
  let budgetFailsClosed = false;
  try { bC.dispatch("ARCHBP-200", { ...binding, cost: 1 }); } catch { budgetFailsClosed = true; }

  // append-only proof, no acceptance, no completion capability
  const pC = new RufloCoordinator(graph, { maxRetries: 2, budget: 10 });
  const pd = pC.dispatch("ARCHBP-100", binding);
  pC.markSucceeded(pd.id, { evidence: "ran" });
  const cand1 = pC.emitProofCandidate("ARCHBP-100", { evidence: "ran" });
  pC.emitProofCandidate("ARCHBP-100", { evidence: "again" });
  const proof = {
    appendOnly: pC.proofLog.length === 2 && pC.proofLog[0].seq === 1 && pC.proofLog[1].seq === 2,
    candidatesNotAccepted: cand1.accepted === false && cand1.status === "candidate",
  };
  const completion = { coordinatorCannotComplete: typeof pC.completeTask === "undefined" };

  const result = {
    task: "ARCHBP-014",
    generatedAt: new Date().toISOString(),
    primarySource,
    authority,
    binding: binding_,
    cancellation: { stopped: cancelStopped },
    timeout: { timedOut },
    retry: { bounded: retryBounded },
    budget: { failsClosed: budgetFailsClosed },
    completion,
    proof,
  };

  const outputArg = process.argv.find((a) => a.startsWith("--output="));
  const canonical = resolve(process.cwd(), "node_modules/.cache/lifeos/archbp-014/coordinator-proof.raw.json");
  const outputPath = outputArg ? resolve(process.cwd(), outputArg.slice("--output=".length)) : canonical;
  mkdirSync(dirname(outputPath), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(outputPath, json);
  process.stdout.write(json);
}

if (import.meta.main) {
  emitProof().catch((error) => {
    console.error("ARCHBP-014 coordinator proof failed:", error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
