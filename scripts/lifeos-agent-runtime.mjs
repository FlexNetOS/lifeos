// ARCHBP-005/§4.10 — supervised LifeOS agent runtime.
//
// This process is started by the Tauri shell. It loads the installed native
// RuvLLM surface, opens an allow-listed AgentRvfRegistry identity, and reports
// liveness through the authenticated redb owner. It never becomes durable
// authority and never invents or completes database tasks.

import { createConnection } from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AgentRvfRegistry } from "./agentdb-rvf-lifecycle.mjs";

const agentId = process.env.LIFEOS_AGENT_ID ?? "lifeos-coordinator";
const redbRoot = resolve(process.env.LIFEOS_REDB_ROOT ?? "/home/flexnetos/meta/var/lib/redb");
const rvfRoot = resolve(process.env.LIFEOS_AGENT_RVF_ROOT ?? "/home/flexnetos/meta/var/lib/agentdb/rvf");
const intervalMs = Number(process.env.LIFEOS_AGENT_HEARTBEAT_MS ?? 5_000);
const statusPath = resolve(process.env.LIFEOS_AGENT_STATUS ?? "/run/user/1001/yazelix/profile-runtime/lifeos-agent-runtime/status.json");

function ownerPut(key, value) {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection({ path: `${redbRoot}/owner.sock` });
    let response = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({
        protocol_version: "flexnetos.redb-owner.v0",
        token: readFileSync(`${redbRoot}/owner.token`, "utf8").trim(),
        op: "put",
        key,
        value,
      })}\n`);
    });
    const finish = () => {
      try {
        const result = JSON.parse(response.split("\n", 1)[0]);
        if (!result.ok) reject(new Error(result.error ?? "owner rejected runtime status"));
        else { socket.destroy(); resolvePromise(result.seq); }
      } catch (error) { reject(error); }
    };
    socket.on("data", (chunk) => { response += chunk; if (response.includes("\n")) finish(); });
    socket.on("end", () => { if (response) finish(); });
    socket.on("error", reject);
  });
}

async function publish(status, identity, engine) {
  const now = String(Date.now());
  await ownerPut("agent.runtime.status", status);
  await ownerPut("agent.runtime.identity", identity);
  await ownerPut("agent.runtime.engine", engine);
  await ownerPut("agent.runtime.updatedAt", now);
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, `${JSON.stringify({ schema_version: "lifeos.agent-runtime-status.v1", state: status, updated_at: Number(now), native_loaded: engine === "ruvllm-native", agents: [identity], identity_bound: true, failure_isolation: true, macro_authority: "postgresql+ruvector" }, null, 2)}\n`);
}

export async function startAgentRuntime() {
  mkdirSync(rvfRoot, { recursive: true });
  const registry = await AgentRvfRegistry.open({ storageRoot: rvfRoot });
  const agent = await registry.openAgent({ agentId, dimension: 8, learning: true });
  const { RuvLLM } = await import("@ruvector/ruvllm");
  const llm = new RuvLLM({ embeddingDim: 8 });
  const engine = llm.isNativeLoaded() ? "ruvllm-native" : "ruvllm-fallback";
  const vector = llm.embed(`LifeOS agent heartbeat ${agentId}`).slice(0, 8);
  await agent.remember(`heartbeat-${Date.now()}`, Float32Array.from(vector), { source: "lifeos-agent-runtime", agentId });
  await agent.learn();
  await publish("ready", agentId, engine);
  return { agentId, engine, rvfRoot, identity: await agent.identity() };
}

if (import.meta.main) {
  const once = process.argv.includes("--once");
  let runtime;
  try {
    runtime = await startAgentRuntime();
    console.log(JSON.stringify({ schemaVersion: "lifeos.agent-runtime.v1", status: "ready", ...runtime }));
    if (once) process.exit(0);
    const stop = async () => {
      await publish("stopped", agentId, runtime.engine).catch(() => {});
      process.exit(0);
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    setInterval(() => publish("ready", agentId, runtime.engine).catch(() => {}), intervalMs);
  } catch (error) {
    await publish("degraded", agentId, "unknown").catch(() => {});
    console.error(error?.stack ?? error);
    process.exit(1);
  }
}
