import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const expectedSourceRevision = "2bb75b2de955c4c1a13cccc2d487ddf4a56d4e9e";
const expectedWasmSha256 = "27cf1fa341cf8e72bbf5aafd69a81274d2d2506ec3dc4691be527c9007f5c9dd";
const packageJsonPath = resolve("node_modules/@ruvector/rvf-solver/package.json");
const packageRoot = dirname(packageJsonPath);
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const wasmPath = resolve(packageRoot, "pkg/rvf_solver_bg.wasm");
const wasmSha256 = createHash("sha256").update(readFileSync(wasmPath)).digest("hex");

if (wasmSha256 !== expectedWasmSha256) {
  throw new Error(`RVF solver WASM hash mismatch: ${wasmSha256}`);
}

const { RvfSolver } = await import("@ruvector/rvf-solver");
const solver = await RvfSolver.create();
const acceptance = solver.acceptance({
  holdoutSize: 30,
  trainingPerCycle: 200,
  cycles: 5,
  stepBudget: 500,
  seed: 7,
});
const receipt = {
  schema_version: "lifeos.evidence.rvf-solver-artifact.v1",
  package_version: packageJson.version,
  source_revision: expectedSourceRevision,
  wasm_sha256: wasmSha256,
  acceptance: {
    all_passed: acceptance.allPassed === true,
    mode_c_passed: acceptance.modeC?.passed === true,
    witness_entries: acceptance.witnessEntries ?? 0,
  },
};
solver.destroy();

if (!receipt.acceptance.all_passed || !receipt.acceptance.mode_c_passed || receipt.acceptance.witness_entries < 1) {
  throw new Error(`RVF solver acceptance failed: ${JSON.stringify(receipt.acceptance)}`);
}

const outputPath = resolve("evidence/agentdb-rvf/solver-artifact-receipt.json");
await Bun.write(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: outputPath, ...receipt.acceptance }));
