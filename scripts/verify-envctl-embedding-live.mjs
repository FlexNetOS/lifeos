// ARCHBP-042 / R11 — prove the live envctl → native RuvLLM → PostgreSQL path.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const bun = "/home/flexnetos/.nix-profile/bin/bun";
const conn = process.env.ENVCTL_PG_CONN ?? "host=/home/flexnetos/meta/var/lib/yazelix/runtime/services/postgresql dbname=envctl_commit_test user=flexnetos";
const port = Number(process.env.LIFEOS_RUVLLM_EMBEDDER_PORT ?? 19765);
const seq = Date.now();
const service = spawn(bun, [join(root, "scripts/ruvllm-embedder.mjs")], {
  cwd: root,
  env: { ...process.env, LIFEOS_RUVLLM_EMBEDDER_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

const run = (args, env = process.env) => execFileSync(rtk, args, { cwd: root, env, encoding: "utf8" });
const sql = (statement) => run(["proxy", "psql", conn, "-v", "ON_ERROR_STOP=1", "-Atqc", statement]);
const waitFor = async (predicate, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out waiting for the native RuvLLM embedder");
};

try {
  await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.ok && (await response.json()).engine === "ruvllm-native";
    } catch {
      return false;
    }
  });

  const embeddingResponse = await fetch(`http://127.0.0.1:${port}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ texts: ["ARCHBP-042 live envctl embedding"] }),
  });
  const embedding = await embeddingResponse.json();
  if (!embeddingResponse.ok || embedding.engine !== "ruvllm-native" || embedding.vectors?.[0]?.length !== 128) {
    throw new Error(`native embedding response is invalid: ${JSON.stringify(embedding)}`);
  }

  run(["proxy", "psql", conn, "-v", "ON_ERROR_STOP=1", "-c", `
    CREATE SCHEMA IF NOT EXISTS lifeos_runtime;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lifeos_envctl') THEN CREATE ROLE lifeos_envctl NOLOGIN; END IF; END $$;
    CREATE TABLE IF NOT EXISTS lifeos_runtime.envctl_committed_records (seq bigint primary key, blob_sha256 text not null, contract_version text not null, job jsonb not null, commit_txid text not null, commit_lsn text not null, generation bigint not null, witness text not null, committed_at timestamptz not null default now());
    CREATE TABLE IF NOT EXISTS lifeos_runtime.envctl_reconciliation_cursor (id boolean primary key default true check (id), acknowledged_seq bigint not null, generation bigint not null, last_witness text not null);
    INSERT INTO lifeos_runtime.envctl_reconciliation_cursor VALUES (true,0,0,'') ON CONFLICT (id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS codedb_outbox_export (seq bigint primary key, contract_version text not null, blob_sha256 text not null, job jsonb not null, synced_at timestamptz not null default now());
    GRANT USAGE ON SCHEMA lifeos_runtime TO lifeos_envctl;
    GRANT SELECT, INSERT ON lifeos_runtime.envctl_committed_records TO lifeos_envctl;
    GRANT SELECT, UPDATE ON lifeos_runtime.envctl_reconciliation_cursor TO lifeos_envctl;
    GRANT SELECT ON codedb_outbox_export TO lifeos_envctl;
    INSERT INTO codedb_outbox_export (seq, contract_version, blob_sha256, job)
      VALUES (${seq}, 'codedb.outbox-export.v0', repeat('b',64), jsonb_build_object('seq',${seq},'requires_embedding',true,'embedding_request',jsonb_build_object('texts',jsonb_build_array('ARCHBP-042 live envctl commit'),'expected_dimensions',128)))
      ON CONFLICT (seq) DO NOTHING;
  `]);

  run(["proxy", "cargo", "run", "--quiet", "--manifest-path", "../envctl/crates/commit-worker/Cargo.toml", "--bin", "envctl-commit-worker", "--", "drain", "--conn", conn, "--max-batch", "32"], {
    ...process.env,
    ENVCTL_RUVLLM_EMBEDDER_URL: `http://127.0.0.1:${port}`,
  });
  const committed = sql(`SELECT jsonb_build_object('seq', seq, 'engine', job->'embedding_result'->>'engine', 'dimensions', (job->'embedding_result'->>'dimensions')::int, 'vector_dimensions', jsonb_array_length(job->'embedding_result'->'vectors'->0), 'acknowledged_seq', c.acknowledged_seq)::text FROM lifeos_runtime.envctl_committed_records, lifeos_runtime.envctl_reconciliation_cursor c WHERE seq=${seq}`);
  if (!committed.includes("ruvllm-native") || !committed.includes('"dimensions": 128') || !committed.includes('"vector_dimensions": 128')) {
    throw new Error(`envctl did not durably commit the native embedding: ${committed}`);
  }
  const receipt = {
    schema_version: "lifeos.evidence.envctl-embedding-live.v1",
    authority: "envctl commit-worker, loopback native @ruvector/ruvllm executor, and PostgreSQL/RuVector",
    executor: { url: `http://127.0.0.1:${port}`, engine: "ruvllm-native", dimensions: 128, loopback_only: true },
    staged_seq: seq,
    committed_projection: JSON.parse(committed.trim()),
    ok: true,
  };
  const receiptPath = join(root, "evidence/envctl-codedb/embedding-live-receipt.json");
  mkdirSync(join(root, "evidence/envctl-codedb"), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ status: "ok", receipt: receiptPath, seq }, null, 2));
} finally {
  service.kill("SIGTERM");
  await new Promise((resolve) => service.once("exit", resolve));
}
