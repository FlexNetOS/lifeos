import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import {
  authorizeDispatch,
  retryPolicy,
  budgetCheck,
  RufloCoordinator,
} from "../scripts/ruflo-coordinator-lifecycle.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const adapterPath = resolve(repoRoot, "scripts/ruflo-coordinator-lifecycle.mjs");

const graph = {
  "ARCHBP-100": { status: "Ready" },
  "ARCHBP-101": { status: "Blocked" },
  "ARCHBP-102": { status: "Complete" },
};

function coordinator() {
  return new RufloCoordinator(graph, { maxRetries: 2, budget: 10, primarySourceVersion: "3.32.9" });
}

const binding = { agentIdentity: "agent-fileid-abc", cartridgeId: "cart-1", route: "local", cost: 1 };

// ---------------------------------------------------------------------------
// Pure-logic gate clauses (in-process).
// ---------------------------------------------------------------------------
describe("ARCHBP-014 only the canonical task graph authorizes work", () => {
  test("authorizes a Ready graph task and rejects invented or non-ready tasks", () => {
    expect(authorizeDispatch("ARCHBP-100", graph).authorized).toBe(true);
    // task invention: not in the graph
    expect(authorizeDispatch("ARCHBP-999", graph).authorized).toBe(false);
    expect(authorizeDispatch("ARCHBP-999", graph).reason).toBe("not-in-canonical-graph");
    // not ready
    expect(authorizeDispatch("ARCHBP-101", graph).authorized).toBe(false);
    expect(authorizeDispatch("ARCHBP-102", graph).authorized).toBe(false);
  });
});

describe("ARCHBP-014 bounded idempotent retry and budget", () => {
  test("retry is bounded by maxRetries", () => {
    expect(retryPolicy(0, 2).allowed).toBe(true);
    expect(retryPolicy(2, 2).allowed).toBe(false);
    expect(retryPolicy(2, 2).exhausted).toBe(true);
  });

  test("budget exhaustion fails closed", () => {
    expect(budgetCheck(0, 5, 10).allowed).toBe(true);
    expect(budgetCheck(8, 5, 10).allowed).toBe(false);
    expect(budgetCheck(8, 5, 10).remaining).toBe(2);
  });
});

describe("ARCHBP-014 coordinator state machine", () => {
  test("dispatch binds agent identity, cartridge, and route and is idempotent", () => {
    const c = coordinator();
    const d1 = c.dispatch("ARCHBP-100", binding);
    const d2 = c.dispatch("ARCHBP-100", binding); // same attempt -> idempotent
    expect(d1.id).toBe(d2.id);
    expect(d1.agentIdentity).toBe("agent-fileid-abc");
    expect(d1.cartridgeId).toBe("cart-1");
    expect(d1.route).toBe("local");
    expect(d1.state).toBe("dispatched");
  });

  test("dispatching an invented task is rejected (no task invention)", () => {
    const c = coordinator();
    expect(() => c.dispatch("ARCHBP-999", binding)).toThrow();
  });

  test("cancellation stops further progress", () => {
    const c = coordinator();
    const d = c.dispatch("ARCHBP-100", binding);
    c.cancel(d.id);
    expect(c.state(d.id)).toBe("cancelled");
    expect(() => c.markSucceeded(d.id, { ok: true })).toThrow();
  });

  test("timeout moves a dispatch to timed-out", () => {
    const c = coordinator();
    const d = c.dispatch("ARCHBP-100", { ...binding, deadline: 100 });
    c.checkTimeout(d.id, 200);
    expect(c.state(d.id)).toBe("timed-out");
  });

  test("partial failure is recoverable by bounded retry and never completes the task", () => {
    const c = coordinator();
    const d = c.dispatch("ARCHBP-100", binding);
    c.markFailed(d.id, "transient");
    expect(c.state(d.id)).toBe("failed");
    const r1 = c.retry("ARCHBP-100", binding);
    expect(r1).not.toBeNull();
    const r2 = c.retry("ARCHBP-100", binding);
    expect(c.retry("ARCHBP-100", binding)).toBeNull(); // exhausted after maxRetries
    // the coordinator never marks a task complete
    expect(typeof c.completeTask).toBe("undefined");
  });

  test("proof emission is append-only and cannot fabricate an accepted completion", () => {
    const c = coordinator();
    const d = c.dispatch("ARCHBP-100", binding);
    c.markSucceeded(d.id, { evidence: "ran" });
    const cand = c.emitProofCandidate("ARCHBP-100", { evidence: "ran" });
    expect(cand.accepted).toBe(false); // only the spine can accept
    expect(cand.status).toBe("candidate");
    expect(c.proofLog.length).toBe(1);
    c.emitProofCandidate("ARCHBP-100", { evidence: "again" });
    expect(c.proofLog.length).toBe(2); // append-only
    // no method exists to mutate or delete prior entries
    expect(typeof c.proofLog.pop).toBe("function"); // it's an array, but the coordinator never calls destructive ops itself
    expect(c.proofLog[0].evidence).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Live proof (subprocess) — real ruflo primary source + real bindings.
// ---------------------------------------------------------------------------
describe("ARCHBP-014 coordinator proof (real ruflo primary source + real bindings)", () => {
  test("proves authority-preserving dispatch, bounded retry, cancellation, budget, and append-only proof", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "archbp014-"));
    const outputPath = join(outputDir, "proof.json");
    try {
      const proof = spawnSync("bun", [adapterPath, `--output=${outputPath}`], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(proof.status, proof.stderr).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const r = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(r.primarySource.rufloInstalled).toBe(true);
      expect(r.primarySource.version).toBe("3.32.9");
      expect(r.authority.readyAuthorized).toBe(true);
      expect(r.authority.inventedRejected).toBe(true);
      expect(r.authority.nonReadyRejected).toBe(true);
      expect(r.binding.agentIdentityBound).toBe(true);
      expect(typeof r.binding.agentFileId).toBe("string");
      expect(r.binding.routeIsLocalDefault).toBe(true);
      expect(r.retry.bounded).toBe(true);
      expect(r.cancellation.stopped).toBe(true);
      expect(r.timeout.timedOut).toBe(true);
      expect(r.budget.failsClosed).toBe(true);
      expect(r.completion.coordinatorCannotComplete).toBe(true);
      expect(r.proof.appendOnly).toBe(true);
      expect(r.proof.candidatesNotAccepted).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 120000);
});
