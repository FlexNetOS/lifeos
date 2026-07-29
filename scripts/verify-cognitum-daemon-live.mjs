import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rtk = "/home/flexnetos/.nix-profile/bin/rtk";
const cargo = "/home/flexnetos/.nix-profile/bin/cargo";
const psql = "/home/flexnetos/.nix-profile/bin/psql";
const socket = process.env.LIFEOS_PG_SOCKET ?? "/home/flexnetos/meta/var/run/postgresql";
const database = process.env.LIFEOS_DATABASE ?? "lifeos";
const databaseUrl =
  process.env.LIFEOS_DATABASE_URL ??
  `postgresql://flexnetos@localhost/lifeos?host=${socket}`;
const tenant = "00000000-0000-4000-8000-000000000001";
const identity = "00000000-0000-4000-8000-000000000002";
const policy = "00000000-0000-4000-8000-000000000004";
const branch = "00000000-0000-4000-8000-000000000005";
const bootstrapGrant = "00000000-0000-4000-8000-000000000003";
const task = randomUUID();
const execution = randomUUID();
const sessionGrant = randomUUID();
const taskGrant = randomUUID();
const sessionNonce = randomUUID().replaceAll("-", "");
const taskNonce = randomUUID().replaceAll("-", "");
const binding = JSON.stringify({
  tenant_id: tenant,
  identity_id: identity,
  grant_id: sessionGrant,
  purpose: "envctl-session-binding",
});

function runPsql(sql) {
  const path = `/tmp/lifeos-cognitum-daemon-${task}.sql`;
  writeFileSync(path, sql);
  try {
    return execFileSync(
      rtk,
      [
        "proxy",
        psql,
        "-X",
        "--no-psqlrc",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        socket,
        "-d",
        database,
        "-qAt",
        "-f",
        path,
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  } catch (error) {
    if (process.env.LIFEOS_KEEP_DAEMON_SQL === "1") {
      writeFileSync(`${path}.failed`, sql);
    }
    throw error;
  } finally {
    unlinkSync(path);
  }
}

function mqttRemainingLength(value) {
  const bytes = [];
  do {
    let encoded = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) encoded |= 0x80;
    bytes.push(encoded);
  } while (value > 0);
  return Buffer.from(bytes);
}

function startMqttCapture() {
  const publications = [];
  const server = net.createServer((socketClient) => {
    let buffer = Buffer.alloc(0);
    socketClient.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        let multiplier = 1;
        let remaining = 0;
        let index = 1;
        let encoded;
        do {
          if (index >= buffer.length || index > 4) return;
          encoded = buffer[index++];
          remaining += (encoded & 0x7f) * multiplier;
          multiplier *= 128;
        } while (encoded & 0x80);
        const packetLength = index + remaining;
        if (buffer.length < packetLength) return;
        const header = buffer[0];
        const packet = buffer.subarray(index, packetLength);
        buffer = buffer.subarray(packetLength);
        const type = header >> 4;
        if (type === 1) {
          socketClient.write(Buffer.from([0x20, 0x02, 0x00, 0x00]));
        } else if (type === 3) {
          const topicLength = packet.readUInt16BE(0);
          const topic = packet.subarray(2, 2 + topicLength).toString();
          let payloadOffset = 2 + topicLength;
          const qos = (header >> 1) & 0x03;
          let packetId;
          if (qos > 0) {
            packetId = packet.readUInt16BE(payloadOffset);
            payloadOffset += 2;
          }
          const payload = packet.subarray(payloadOffset);
          publications.push({ topic, payload: Buffer.from(payload) });
          if (qos === 1) {
            socketClient.write(Buffer.from([0x40, 0x02, packetId >> 8, packetId & 0xff]));
          }
        } else if (type === 12) {
          socketClient.write(Buffer.from([0xd0, 0x00]));
        }
      }
    });
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolveServer({
        port: server.address().port,
        publications,
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
      });
    });
  });
}

async function startMqttSubscriber(rawUrl, topicFilter) {
  const url = new URL(rawUrl);
  const lines = [];
  const subscriber = spawn(
    "/home/flexnetos/.nix-profile/bin/nix",
    [
      "shell",
      "github:NixOS/nixpkgs/nixos-unstable#mosquitto",
      "--command",
      "mosquitto_sub",
      "-V",
      "mqttv311",
      "-h",
      url.hostname,
      "-p",
      String(url.port || 1883),
      "-t",
      topicFilter,
      "-v",
      "-q",
      "1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  subscriber.stdout.on("data", (chunk) => lines.push(chunk.toString()));
  let stderr = "";
  subscriber.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  await new Promise((resolveReady) => setTimeout(resolveReady, 1500));
  if (subscriber.exitCode !== null) {
    throw new Error(`mosquitto_sub exited before daemon start: ${stderr}`);
  }
  return {
    port: Number(url.port || 1883),
    get publications() {
      return lines.join("").split(/\r?\n/).filter(Boolean).flatMap((line) => {
        const separator = line.indexOf(" ");
        if (separator < 0) return [];
        return [{ topic: line.slice(0, separator), payload: Buffer.from(line.slice(separator + 1)) }];
      });
    },
    close: () => new Promise((resolveClose) => {
      subscriber.once("exit", resolveClose);
      subscriber.kill("SIGTERM");
    }),
  };
}

const setupSql = String.raw`
\set ON_ERROR_STOP on
BEGIN;
SELECT raw_object_id AS session_raw
  FROM lifeos_security."grant" WHERE grant_id = '${bootstrapGrant}' \gset
INSERT INTO lifeos_security."grant"(
  grant_id, tenant_id, policy_id, identity_id, resource_scope,
  action_scope, purpose, nonce, epoch, raw_object_id, expires_at
) VALUES (
  '${sessionGrant}', '${tenant}', '${policy}', '${identity}', '{}'::jsonb,
  ARRAY['bind-session'], 'archbp-cognitum-daemon-live', decode('${sessionNonce}', 'hex'), 1,
  :'session_raw'::uuid, clock_timestamp() + interval '10 minutes'
);
SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${sessionGrant}',
  convert_to('${binding}'::text, 'UTF8')
) AS bootstrap \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', '{"task_kind":"cognitum-daemon-live"}'::jsonb,
  '{"producer":"archbp-cognitum-daemon-live"}'::jsonb
) AS task_payload \gset
INSERT INTO lifeos_runtime.task(
  task_id, tenant_id, branch_id, task_kind, payload_object_id,
  capability_requirements, idempotency_key
) VALUES (
  '${task}', '${tenant}', '${branch}', 'cognitum-daemon-live', :'task_payload'::uuid,
  '{"cognitum:sensor":true}'::jsonb, 'archbp-cognitum-daemon-${task}'
);
SELECT leased_lease_id::text AS lease_id
  FROM lifeos_runtime.claim_task('${identity}', '{"cognitum:sensor":true}'::jsonb, interval '10 minutes')
 WHERE leased_task_id = '${task}' \gset
SELECT lifeos_blob.store_generated_object(
  '${tenant}', jsonb_build_object('task','${task}','lease_id',:'lease_id'),
  '{"producer":"archbp-cognitum-daemon-live"}'::jsonb
) AS task_grant_raw \gset
INSERT INTO lifeos_security."grant"(
  grant_id, tenant_id, policy_id, identity_id, task_id, lease_id,
  resource_scope, action_scope, purpose, nonce, epoch, raw_object_id, expires_at
) VALUES (
  '${taskGrant}', '${tenant}', '${policy}', '${identity}', '${task}', :'lease_id'::uuid,
  '{"component":"lifeos-daemon","operation":"sensor_snapshot"}'::jsonb,
  ARRAY['bind-runtime','cognitum:sensor'], 'archbp-cognitum-daemon-live',
  decode('${taskNonce}', 'hex'), 1, :'task_grant_raw'::uuid, clock_timestamp() + interval '10 minutes'
);
SELECT lifeos_blob.store_generated_object(
  '${tenant}', '{"binding":"cognitum-daemon","task_id":"${task}"}'::jsonb,
  '{"producer":"archbp-cognitum-daemon-live"}'::jsonb
) AS binding_object_id \gset
SELECT lifeos_security.bind_runtime_context(
  '${tenant}', '${identity}', '${taskGrant}', :'lease_id'::uuid, :'binding_object_id'::uuid
) AS task_binding \gset
INSERT INTO lifeos_runtime.execution(
  execution_id, tenant_id, task_id, lease_id, branch_id, attempt_no,
  runner_identity_id, input_object_id, state_code
) VALUES (
  '${execution}', '${tenant}', '${task}', :'lease_id'::uuid, '${branch}', 1,
  '${identity}', :'task_payload'::uuid, 'running'
);
COMMIT;
SELECT json_build_object('lease_id',:'lease_id','binding_object_id',:'binding_object_id')::text;
`;

const setup = JSON.parse(runPsql(setupSql).trim().split("\n").at(-1));
const mqttUrl = process.env.LIFEOS_MQTT_URL ?? "";
const mqtt = mqttUrl
  ? await startMqttSubscriber(mqttUrl, "lifeos/sensor/+/+")
  : await startMqttCapture();
const seedToken = readFileSync("/home/flexnetos/meta/var/lib/env-ctl/seed-token", "utf8").trim();
const daemonEnv = {
  ...process.env,
  LIFEOS_DATABASE_URL: databaseUrl,
  LIFEOS_RUNTIME_EXECUTION_ID: execution,
  LIFEOS_RUNTIME_TENANT_ID: tenant,
  LIFEOS_RUNTIME_IDENTITY_ID: identity,
  LIFEOS_RUNTIME_GRANT_ID: sessionGrant,
  LIFEOS_RUNTIME_BINDING_JSON: binding,
  LIFEOS_RUNTIME_TASK_GRANT_ID: taskGrant,
  LIFEOS_RUNTIME_TASK_LEASE_ID: setup.lease_id,
  LIFEOS_RUNTIME_TASK_BINDING_OBJECT_ID: setup.binding_object_id,
  LIFEOS_COGNITUM_URL: "https://169.254.42.1:8443/mcp",
  LIFEOS_COGNITUM_BEARER_TOKEN: seedToken,
  LIFEOS_MQTT_URL: mqttUrl || `mqtt://127.0.0.1:${mqtt.port}`,
  LIFEOS_DEVICE_ID: "archbp-cognitum",
  LIFEOS_SENSOR_POLL_SECONDS: "1",
};
const daemon = spawn(cargo, ["run", "-p", "lifeos-daemon"], {
  cwd: root,
  env: daemonEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
let daemonStdout = "";
let daemonStderr = "";
daemon.stdout.on("data", (chunk) => { daemonStdout += chunk.toString(); });
daemon.stderr.on("data", (chunk) => { daemonStderr += chunk.toString(); });
await new Promise((resolveReady) => setTimeout(resolveReady, 7000));
if (!daemon.killed) daemon.kill("SIGTERM");
await new Promise((resolveExit) => daemon.once("exit", resolveExit));
await mqtt.close();
const mqttPublicationsJson = JSON.stringify(mqtt.publications).replaceAll("'", "''");

const finalizeSql = String.raw`
\set ON_ERROR_STOP on
BEGIN;
SELECT lifeos_security.bootstrap_envctl_context(
  '${tenant}', '${identity}', '${sessionGrant}',
  convert_to('${binding}'::text, 'UTF8')
) AS bootstrap \gset
SELECT lifeos_security.bind_runtime_context(
  '${tenant}', '${identity}', '${taskGrant}', '${setup.lease_id}'::uuid,
  '${setup.binding_object_id}'::uuid
) AS task_binding \gset
SELECT lifeos_runtime.append_log_frame(
  '${execution}', 'stderr', 0, 0, decode('', 'hex'),
  '{"producer":"archbp-cognitum-daemon-finalizer"}'::jsonb
) AS stderr_frame \gset
UPDATE lifeos_runtime.execution
   SET state_code = 'failed', completed_at = clock_timestamp()
 WHERE execution_id = '${execution}';
UPDATE lifeos_runtime.task SET state_code = 'failed' WHERE task_id = '${task}';
UPDATE lifeos_runtime.lease SET revoked_at = clock_timestamp() WHERE lease_id = '${setup.lease_id}'::uuid;
UPDATE lifeos_security."grant" SET revoked_at = clock_timestamp()
 WHERE grant_id IN ('${sessionGrant}','${taskGrant}');
COMMIT;
SELECT json_build_object(
  'stdout_frames',(SELECT count(*) FROM lifeos_runtime.log_frame WHERE execution_id='${execution}' AND stream_name='stdout'),
  'stderr_frames',(SELECT count(*) FROM lifeos_runtime.log_frame WHERE execution_id='${execution}' AND stream_name='stderr'),
  'stdout_bytes',(SELECT coalesce(sum(o.byte_length),0) FROM lifeos_runtime.log_frame f JOIN lifeos_blob.object o ON o.object_id=f.raw_object_id WHERE f.execution_id='${execution}' AND f.stream_name='stdout'),
  'state',(SELECT state_code FROM lifeos_runtime.execution WHERE execution_id='${execution}')
)::text;
`;
const final = JSON.parse(runPsql(finalizeSql).trim().split("\n").at(-1));
const snapshotPublications = mqtt.publications.filter((item) => item.topic.endsWith("/snapshot"));
if (snapshotPublications.length === 0 || final.stdout_frames === 0 || final.stdout_bytes === 0 || final.state !== "failed") {
  throw new Error(`Cognitum daemon live closure failed: ${JSON.stringify({ final, publications: mqtt.publications.map(({ topic }) => topic), daemonStderr })}`);
}
const receipt = {
  schema_version: "lifeos.evidence.cognitum-daemon-live.v1",
  authority: "Architecture_Data_Pipeline_Blueprint_RUVECTOR_FULLY_EXPANDED_VERIFIED.md",
  execution_id: execution,
  device_url: "https://169.254.42.1:8443/mcp",
  mqtt_listener: mqttUrl || "127.0.0.1:ephemeral",
  mqtt_mode: mqttUrl ? "persistent-external-broker" : "ephemeral-protocol-capture",
  durable: final,
  mqtt_publication_count: mqtt.publications.length,
  sensor_publication_count: snapshotPublications.length,
  mqtt_payload_sha256: createHash("sha256").update(Buffer.concat(snapshotPublications.map(({ payload }) => payload))).digest("hex"),
  daemon_exit: daemon.exitCode,
  daemon_stdout_sha256: createHash("sha256").update(daemonStdout).digest("hex"),
  termination_reason: "bounded_live_window",
  verdict: "cognitum-daemon-live-pass",
};
const receiptPath = join(root, "evidence/coordination/cognitum-daemon-live-receipt.json");
mkdirSync(join(root, "evidence/coordination"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ receipt: receiptPath, verdict: receipt.verdict, sensor_publication_count: receipt.sensor_publication_count }, null, 2));
