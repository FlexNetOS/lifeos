import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import * as ruvector from "ruvector";
import { SelfLearningRvfBackend } from "agentdb/backends/self-learning";
import { SonaEngine } from "@ruvector/sona";
import { RvfDatabase, resolveBackend } from "@ruvector/rvf";
import { LoraManager } from "@ruvector/ruvllm";
import { hello as tinyDancerHello, score, trainRouter, version as tinyDancerVersion } from "@ruvector/tiny-dancer";

const runtimeDir = join(import.meta.dir, "runtime");
await rm(runtimeDir, { recursive: true, force: true });
await mkdir(runtimeDir, { recursive: true });

const result = {
  generatedAt: new Date().toISOString(),
  runtime: {
    bun: Bun.version,
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
sona.addTrajectoryContext(sonaTrajectory, "NBVERIFY-001");
sona.addTrajectoryStep(
  sonaTrajectory,
  sonaInput,
  Array(8).fill(1 / 8),
  0.9,
);
sona.endTrajectory(sonaTrajectory, 0.95);
const sonaLearnResult = sona.forceLearn();
result.sona = {
  microLoraOutput: sona.applyMicroLora(sonaInput),
  forceLearnResult: sonaLearnResult,
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
  path: rvfPath,
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
await learning.insertAsync("doc-b", new Float32Array([...sonaInput].reverse()), { kind: "control" });
const learningSearch = await learning.searchAsync(new Float32Array(sonaInput), 2);
learning.recordFeedback(learningSearch[0].id, 1.0);
await learning.forceLearn();
await learning.flush();
result.agentdb = {
  path: learningPath,
  bytes: (await stat(learningPath)).size,
  search: learningSearch,
  stats: await learning.getStatsAsync(),
  learningStats: learning.getLearningStats(),
  learningEnabled: learning.isLearningEnabled,
  backendPath: learning.getBackend().getStoragePath(),
  backendInitialized: learning.getBackend().isInitialized(),
  segments: await learning.getBackend().segments(),
  witness: learning.getBackend().verifyWitness(),
};
learning.destroy();

const lora = new LoraManager({ rank: 1, alpha: 1 });
for (let i = 0; i < 51; i += 1) {
  lora.create(`personality-${String(i + 1).padStart(2, "0")}`, { rank: 1, alpha: 1 }, 8, 8);
}
const firstActivated = lora.activate("personality-01");
const lastActivated = lora.activate("personality-51");
result.ruvllm = {
  adapterCount: lora.count(),
  firstActivated,
  lastActivated,
  activeAdapter: lora.getActiveId(),
  stats: lora.stats(),
  note: "This proves 51 in-memory LoRA adapters and switching, not RVF persistence or complete agent personalities.",
};

const rows = Array.from({ length: 40 }, (_, i) => ({
  embedding: [
    i % 2,
    (i + 1) % 2,
    (i % 5) / 5,
    ((i + 2) % 5) / 5,
    (i % 3) / 3,
    ((i + 1) % 3) / 3,
    i / 40,
    1 - i / 40,
  ],
  scores: i % 2 === 0 ? { cheap: 0.9, strong: 0.92 } : { cheap: 0.2, strong: 0.95 },
}));
const routerPath = join(runtimeDir, "fastgrnn-router.safetensors");
const trainResult = await trainRouter(
  rows,
  { cheap: 1, strong: 15 },
  { outputPath: routerPath, inputDim: 8, hiddenDim: 4, epochs: 10, learningRate: 0.05 },
);
result.tinyDancer = {
  version: tinyDancerVersion(),
  hello: tinyDancerHello(),
  trainResult,
  score: await score(routerPath, rows[0].embedding),
  bytes: (await stat(routerPath)).size,
};

const json = `${JSON.stringify(result, null, 2)}\n`;
await Bun.write(join(import.meta.dir, "nbsource-001-node-proof.raw.json"), json);
console.log(json);
