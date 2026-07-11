import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, realpath, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import * as ruvector from "ruvector";
import { SelfLearningRvfBackend } from "agentdb/backends/self-learning";
import { SonaEngine } from "@ruvector/sona";
import { RvfDatabase, resolveBackend } from "@ruvector/rvf";
import { LoraManager } from "@ruvector/ruvllm";
import {
  hello as tinyDancerHello,
  score,
  trainRouter,
  version as tinyDancerVersion,
} from "@ruvector/tiny-dancer";

const repoRoot = process.cwd();
const packageJsonPath = join(repoRoot, "package.json");
const bunLockPath = join(repoRoot, "bun.lock");
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const canonicalEvidencePath = join(
  repoRoot,
  "planning-spine-v0",
  "generated",
  "notebooklm_claim_verification",
  "NBVERIFY-001.node-authority-proof.raw.json",
);
const evidencePath = outputArgument
  ? resolve(repoRoot, outputArgument.slice("--output=".length))
  : canonicalEvidencePath;
const runtimeDir = join(
  repoRoot,
  "node_modules",
  ".cache",
  "lifeos",
  "node-authority",
  basename(evidencePath, ".json"),
);
const directPackages = [
  "@ruvector/ruvllm",
  "@ruvector/rvf",
  "@ruvector/sona",
  "@ruvector/tiny-dancer",
  "agentdb",
  "ruvector",
];
const transitiveRuntimePackages = [
  "@ruvector/core",
  "@ruvector/rvf-node",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function findPackageJson(entrypoint) {
  let cursor = dirname(entrypoint);
  while (cursor.startsWith(join(repoRoot, "node_modules"))) {
    const candidate = join(cursor, "package.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }
  throw new Error(`No repository-owned package.json found for ${entrypoint}`);
}

assert(typeof Bun !== "undefined", "Node authority verification must run through Bun");
assert(existsSync(packageJsonPath), "Run from the LifeOS repository root: package.json is missing");
assert(existsSync(bunLockPath), "Run from the LifeOS repository root: bun.lock is missing");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const packageResolution = {};
for (const name of directPackages) {
  const expectedVersion = packageJson.devDependencies?.[name];
  assert(expectedVersion, `${name} must be an exact root devDependency`);
  assert(!/^[~^*><=]/.test(expectedVersion), `${name} must use an exact version`);

  const entrypoint = Bun.resolveSync(name, repoRoot);
  const packagePath = findPackageJson(entrypoint);
  const installed = JSON.parse(readFileSync(packagePath, "utf8"));
  assert(
    installed.version === expectedVersion,
    `${name} installed ${installed.version}, expected ${expectedVersion}`,
  );
  packageResolution[name] = {
    ownership: "direct-root-devDependency",
    version: installed.version,
    entrypoint: relative(repoRoot, await realpath(entrypoint)),
    package_json: relative(repoRoot, await realpath(packagePath)),
  };
}
for (const name of transitiveRuntimePackages) {
  const entrypoint = Bun.resolveSync(name, repoRoot);
  const packagePath = findPackageJson(entrypoint);
  const installed = JSON.parse(readFileSync(packagePath, "utf8"));
  packageResolution[name] = {
    ownership: "locked-compatible-transitive-runtime",
    version: installed.version,
    entrypoint: relative(repoRoot, await realpath(entrypoint)),
    package_json: relative(repoRoot, await realpath(packagePath)),
  };
}

await rm(runtimeDir, { recursive: true, force: true });
await mkdir(runtimeDir, { recursive: true });
await mkdir(dirname(evidencePath), { recursive: true });

const result = {
  generatedAt: new Date().toISOString(),
  install: {
    owner: "LifeOS root package.json and bun.lock",
    cwd: repoRoot,
    package_json_sha256: sha256(packageJsonPath),
    bun_lock_sha256: sha256(bunLockPath),
    trusted_dependencies: packageJson.trustedDependencies,
    packages: packageResolution,
  },
  runtime: {
    bun: Bun.version,
    executable: await realpath(process.execPath),
    nodeCompatibility: process.version,
    napi: process.versions.napi,
    platform: process.platform,
    arch: process.arch,
  },
  ruvector: {
    version: ruvector.getVersion(),
    implementationType: ruvector.getImplementationType(),
    backendInfo: ruvector.getBackendInfo(),
    isNative: ruvector.isNative(),
    isRvf: ruvector.isRvf(),
    capabilities: {
      sona: ruvector.isSonaAvailable(),
      gnn: ruvector.isGnnAvailable(),
      graph: ruvector.isGraphAvailable(),
      router: ruvector.isRouterAvailable(),
      rvf: ruvector.isRvfAvailable(),
    },
  },
};

const sona = SonaEngine.withConfig({
  hiddenDim: 8,
  embeddingDim: 8,
  microLoraRank: 2,
  baseLoraRank: 4,
  patternClusters: 4,
  trajectoryCapacity: 100,
  backgroundIntervalMs: 1000,
  qualityThreshold: 0.5,
  enableSimd: true,
});
const sonaInput = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const sonaTrajectory = sona.beginTrajectory(sonaInput);
sona.setTrajectoryRoute(sonaTrajectory, "proof-route");
sona.addTrajectoryContext(sonaTrajectory, "NBVERIFY-001-revision-2");
sona.addTrajectoryStep(sonaTrajectory, sonaInput, Array(8).fill(1 / 8), 0.9);
sona.endTrajectory(sonaTrajectory, 0.95);
result.sona = {
  microLoraOutput: sona.applyMicroLora(sonaInput),
  forceLearnResult: sona.forceLearn(),
  patterns: sona.findPatterns(sonaInput, 4),
  stats: JSON.parse(sona.getStats()),
  enabled: sona.isEnabled(),
};

const rvfPath = join(runtimeDir, "direct.rvf");
const selectedBackend = await resolveBackend("auto");
const rvf = await RvfDatabase.create(
  rvfPath,
  { dimensions: 8, metric: "cosine", signing: true },
  "auto",
);
const ingestResult = await rvf.ingestBatch([
  { id: "1", vector: new Float32Array(sonaInput) },
  { id: "2", vector: new Float32Array([...sonaInput].reverse()) },
]);
const rvfQuery = await rvf.query(new Float32Array(sonaInput), 2);
const rvfSegments = await rvf.segments();
const rvfStatus = await rvf.status();
const rvfFileId = await rvf.fileId();
await rvf.close();
result.rvf = {
  selectedBackend: selectedBackend.constructor.name,
  path: relative(repoRoot, rvfPath),
  bytes: (await stat(rvfPath)).size,
  ingestResult,
  query: rvfQuery,
  segments: rvfSegments,
  status: rvfStatus,
  fileId: rvfFileId,
};

const learningPath = join(runtimeDir, "agentdb-self-learning.rvf");
const learning = await SelfLearningRvfBackend.create({
  dimension: 8,
  metric: "cosine",
  storagePath: learningPath,
  rvfBackend: "node",
  learning: true,
  learningDimension: 8,
  tickIntervalMs: 1000,
  trainingBatchSize: 1,
});
await learning.insertAsync("doc-a", new Float32Array(sonaInput), { kind: "proof" });
await learning.insertAsync("doc-b", new Float32Array([...sonaInput].reverse()), {
  kind: "control",
});
const learningSearch = await learning.searchAsync(new Float32Array(sonaInput), 2);
learning.recordFeedback(learningSearch[0].id, 1.0);
await learning.forceLearn();
await learning.flush();
let witness;
try {
  witness = { result: learning.getBackend().verifyWitness() };
} catch (error) {
  witness = { error: String(error) };
}
result.agentdb = {
  path: relative(repoRoot, learningPath),
  bytes: (await stat(learningPath)).size,
  search: learningSearch,
  stats: await learning.getStatsAsync(),
  learningStats: learning.getLearningStats(),
  learningEnabled: learning.isLearningEnabled,
  backendPath: relative(repoRoot, learning.getBackend().getStoragePath()),
  backendInitialized: learning.getBackend().isInitialized(),
  segments: await learning.getBackend().segments(),
  witness,
};
learning.destroy();

const lora = new LoraManager({ rank: 1, alpha: 1 });
for (let index = 0; index < 51; index += 1) {
  lora.create(
    `personality-${String(index + 1).padStart(2, "0")}`,
    { rank: 1, alpha: 1 },
    8,
    8,
  );
}
result.ruvllm = {
  adapterCount: lora.count(),
  firstActivated: lora.activate("personality-01"),
  lastActivated: lora.activate("personality-51"),
  activeAdapter: lora.getActiveId(),
  stats: lora.stats(),
  note: "This proves 51 in-memory LoRA adapters and switching, not RVF persistence or complete agent personalities.",
};

const rows = Array.from({ length: 40 }, (_, index) => ({
  embedding: [
    index % 2,
    (index + 1) % 2,
    (index % 5) / 5,
    ((index + 2) % 5) / 5,
    (index % 3) / 3,
    ((index + 1) % 3) / 3,
    index / 40,
    1 - index / 40,
  ],
  scores: index % 2 === 0 ? { cheap: 0.9, strong: 0.92 } : { cheap: 0.2, strong: 0.95 },
}));
const routerPath = join(runtimeDir, "fastgrnn-router.safetensors");
const trainResult = await trainRouter(
  rows,
  { cheap: 1, strong: 15 },
  {
    outputPath: routerPath,
    inputDim: 8,
    hiddenDim: 4,
    epochs: 10,
    learningRate: 0.05,
  },
);
result.tinyDancer = {
  version: tinyDancerVersion(),
  hello: tinyDancerHello(),
  trainResult,
  score: await score(routerPath, rows[0].embedding),
  bytes: (await stat(routerPath)).size,
};

const json = `${JSON.stringify(result, null, 2)}\n`;
await Bun.write(evidencePath, json);
console.log(json);
