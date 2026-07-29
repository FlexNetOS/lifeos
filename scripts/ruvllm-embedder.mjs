// ARCHBP-042 — loopback database-authorized embedding executor.
//
// envctl is the only caller that can turn the returned vector into durable
// PostgreSQL/RuVector state. This process owns no durable state: it exposes
// the profile-owned native RuvLLM embedding surface over loopback only.

import { RuvLLM } from "@ruvector/ruvllm";

const host = "127.0.0.1";
const port = Number(process.env.LIFEOS_RUVLLM_EMBEDDER_PORT ?? 19764);
const maxTexts = 64;
const maxTextLength = 16_384;
const dimensions = Number(process.env.LIFEOS_RUVLLM_EMBEDDING_DIMENSIONS ?? 128);
const llm = new RuvLLM({ embeddingDim: 768 });

if (!llm.isNativeLoaded()) {
  throw new Error("native @ruvector/ruvllm is required for the envctl embedding boundary");
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const server = Bun.serve({
  hostname: host,
  port,
  fetch: async (request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ schemaVersion: "lifeos.ruvllm-embedder-health.v1", engine: "ruvllm-native", dimensions });
    }
    if (request.method !== "POST" || url.pathname !== "/embed") {
      return json({ error: "not found" }, 404);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "request body must be JSON" }, 400);
    }
    if (!Array.isArray(body?.texts) || body.texts.length === 0 || body.texts.length > maxTexts) {
      return json({ error: `texts must contain 1-${maxTexts} items` }, 400);
    }
    if (body.texts.some((text) => typeof text !== "string" || text.length === 0 || text.length > maxTextLength)) {
      return json({ error: `each text must be a non-empty string of at most ${maxTextLength} characters` }, 400);
    }
    const vectors = body.texts.map((text) => Array.from(llm.embed(text).slice(0, dimensions)));
    return json({ schemaVersion: "lifeos.ruvllm-embedder.v1", engine: "ruvllm-native", corpus_size: 0, vectors });
  },
});

console.log(JSON.stringify({ schemaVersion: "lifeos.ruvllm-embedder-ready.v1", url: `http://${host}:${server.port}`, dimensions }));

const stop = () => server.stop(true);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
