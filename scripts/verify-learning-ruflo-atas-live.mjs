// ARCHBP-009/013/014/015 — durable live learning, routing, coordination,
// and forecasting gate. Each child proof executes the installed native/runtime
// surface; this gate retains the complete parsed outputs as one receipt.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const receiptPath = resolve(root, "evidence/learning/live-lifecycle-receipt.json");
const runDir = resolve(tmpdir(), `lifeos-learning-live-${process.pid}`);

function run(script, name) {
  const output = join(runDir, `${name}.json`);
  const result = spawnSync("bun", [resolve(root, "scripts", script), `--output=${output}`], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(readFileSync(output, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertProofs(proofs) {
  const { learning, routing, coordination, forecast } = proofs;
  if (!learning.isolation.isolated || !learning.promotion.promoted ||
      !learning.rollback.deterministic || !learning.resources.withinBudget ||
      !learning.fastgrnn || !learning.componentGuard.rejectedUnsupported) {
    throw new Error("ARCHBP-009 learning boundary proof is incomplete");
  }
  if (routing.defaultRoute !== "local" || routing.liveRoutingEnabled !== false ||
      !routing.classifier.trainedFastGrnn || !routing.gates.privacyDenial ||
      !routing.gates.costCeiling || !routing.gates.classifierUncertainty ||
      !routing.gates.outageFallback || !routing.gates.resourceExhaustionFailsClosed ||
      !routing.replay.beatsBaseline || routing.replay.liveRoutesTaken !== 0 ||
      !routing.auditable) {
    throw new Error("ARCHBP-013 routing proof is incomplete");
  }
  if (!coordination.primarySource.rufloInstalled || coordination.primarySource.version !== "3.32.9" ||
      !coordination.authority.readyAuthorized || !coordination.authority.inventedRejected ||
      !coordination.authority.nonReadyRejected || !coordination.binding.agentIdentityBound ||
      !coordination.routingRuntime.nativeLoaded || !coordination.routingRuntime.fastGrnnMeasured ||
      !coordination.retry.bounded || !coordination.cancellation.stopped ||
      !coordination.timeout.timedOut || !coordination.budget.failsClosed ||
      !coordination.completion.coordinatorCannotComplete || !coordination.proof.appendOnly ||
      !coordination.proof.candidatesNotAccepted || !coordination.forecast.calibrated ||
      coordination.forecast.selfPromoted) {
    throw new Error("ARCHBP-014 coordination proof is incomplete");
  }
  if (forecast.schemaVersion !== "lifeos.atas.forecast.v1" ||
      forecast.model.kind !== "echo-state-reservoir" ||
      !forecast.uncertainty.calibrated || forecast.forecast.length !== 8 ||
      forecast.promotion.selfPromoted || !(forecast.runtimeMs > 0)) {
    throw new Error("ARCHBP-015 forecast proof is incomplete");
  }
}

mkdirSync(runDir, { recursive: true });
try {
  const proofs = {
    learning: run("learning-boundary-lifecycle.mjs", "archbp-009"),
    routing: run("ruvltra-routing-lifecycle.mjs", "archbp-013"),
    coordination: run("ruflo-coordinator-lifecycle.mjs", "archbp-014"),
    forecast: run("atas-forecast-lifecycle.mjs", "archbp-015"),
  };
  assertProofs(proofs);

  const receipt = {
    schema_version: "lifeos.evidence.learning-ruflo-atas-live.v1",
    generated_at: new Date().toISOString(),
    authority: "installed LifeOS runtime and pinned release-source identities",
    tasks: ["ARCHBP-009", "ARCHBP-013", "ARCHBP-014", "ARCHBP-015"],
    runtime: {
      ruflo_installed_version: proofs.coordination.primarySource.version,
      ruflo_source_snapshot_version: "3.32.8",
      ruflo_source_revision: "12ede21767a6dd669df1b79392a5d27d9154f237",
      ruvector_source_revision: "6a6c39e662a4c3184dcb913db91a09401c84b2ae",
    },
    verdict: "pass",
    proofs,
    proof_sha256: Object.fromEntries(Object.entries(proofs).map(([key, value]) => [key, sha256(value)])),
  };
  mkdirSync(resolve(root, "evidence/learning"), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ receipt: receiptPath, verdict: receipt.verdict, tasks: receipt.tasks }, null, 2)}\n`);
} finally {
  rmSync(runDir, { recursive: true, force: true });
}
