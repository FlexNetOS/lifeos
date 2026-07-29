// ARCHBP-001/002 — causal Tauri launch -> mounted Glass receipt -> shutdown.
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const redbRoot = resolve(process.env.LIFEOS_REDB_ROOT ?? "/home/flexnetos/meta/var/lib/redb");
const receiptPath = resolve(process.env.LIFEOS_GLASS_LAUNCH_RECEIPT ?? join(root, "evidence/glass/live-launch-receipt.json"));
const failureReceiptPath = resolve(process.env.LIFEOS_GLASS_LAUNCH_FAILURE_RECEIPT ?? join(root, "evidence/glass/live-launch-failure-receipt.json"));
// The native binary embeds tauri.conf.json's localhost:1420 dev URL.
const port = "1420";
const reuseDevServer = process.env.LIFEOS_GLASS_REUSE_DEV_SERVER === "1";
const engineSession = process.env.LIFEOS_ENGINE_SESSION_NAME ?? `lifeos-probe-${Date.now()}`;
const runtime = {
  LIFEOS_DATABASE_URL: process.env.LIFEOS_DATABASE_URL ?? "postgresql://flexnetos@localhost/lifeos?host=/home/flexnetos/meta/var/run/postgresql",
  LIFEOS_RUNTIME_TENANT_ID: process.env.LIFEOS_RUNTIME_TENANT_ID ?? "00000000-0000-4000-8000-000000000001",
  LIFEOS_RUNTIME_IDENTITY_ID: process.env.LIFEOS_RUNTIME_IDENTITY_ID ?? "00000000-0000-4000-8000-000000000002",
  LIFEOS_RUNTIME_GRANT_ID: process.env.LIFEOS_RUNTIME_GRANT_ID ?? "00000000-0000-4000-8000-000000000003",
  LIFEOS_RUNTIME_BINDING_JSON: process.env.LIFEOS_RUNTIME_BINDING_JSON ?? JSON.stringify({
    tenant_id: "00000000-0000-4000-8000-000000000001",
    identity_id: "00000000-0000-4000-8000-000000000002",
    grant_id: "00000000-0000-4000-8000-000000000003",
    purpose: "envctl-session-binding",
  }),
  LIFEOS_REDB_ROOT: redbRoot,
  LIFEOS_ENGINE_SESSION_NAME: engineSession,
  VITE_LIFEOS_ENGINE_PROBE: "1",
};

function projection() {
  const pointer = JSON.parse(readFileSync(join(redbRoot, "projection.pointer"), "utf8"));
  const slotPath = join(redbRoot, `projection.${pointer.slot}.slot`);
  const body = readFileSync(slotPath);
  const checksum = createHash("sha256").update(body).digest("hex");
  if (checksum !== pointer.checksum) throw new Error("owner projection checksum mismatch");
  const rows = body.toString("utf8").trim().split("\n").slice(1).filter(Boolean).map((line) => JSON.parse(line));
  return { pointer, entries: Object.fromEntries(rows.map((row) => [row.k, row.v])) };
}

function processRows() {
  try {
    return execFileSync("ps", ["-eo", "pid=,ppid=,comm=,args="], { encoding: "utf8" })
      .split("\n").map((line) => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
        return match ? { pid: Number(match[1]), ppid: Number(match[2]), line } : null;
      }).filter(Boolean);
  } catch { return []; }
}

function processTree(rootPid) {
  const rows = processRows();
  const seen = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (seen.has(row.pid) || !seen.has(row.ppid)) continue;
      seen.add(row.pid);
      changed = true;
    }
  }
  return rows.filter((row) => seen.has(row.pid)).map((row) => row.line);
}

function terminateTree(rootPid) {
  const rows = processRows();
  const seen = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (seen.has(row.pid) || !seen.has(row.ppid)) continue;
      seen.add(row.pid);
      changed = true;
    }
  }
  const descendants = rows.filter((row) => seen.has(row.pid));
  for (const row of descendants.sort((a, b) => b.pid - a.pid)) {
    try { process.kill(row.pid, "SIGTERM"); } catch {}
  }
  try { process.kill(-rootPid, "SIGTERM"); } catch {}
}

const startedAt = Date.now();
const childEnv = { ...process.env, ...runtime };
const launchCommand = reuseDevServer
  ? ["/home/flexnetos/.nix-profile/bin/cargo", ["run", "--manifest-path", "src-tauri/Cargo.toml", "--no-default-features", "--color", "always", "--"]]
  : ["/home/flexnetos/.nix-profile/bin/bun", ["run", "tauri", "--", "dev"]];
const child = spawn(launchCommand[0], launchCommand[1], {
  cwd: root,
  env: childEnv,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let launchOutput = "";
let launchOutputHead = "";
child.stdout.on("data", (chunk) => {
  launchOutput = `${launchOutput}${chunk}`.slice(-16_384);
  launchOutputHead = `${launchOutputHead}${chunk}`.slice(0, 8_192);
});
child.stderr.on("data", (chunk) => {
  launchOutput = `${launchOutput}${chunk}`.slice(-16_384);
  launchOutputHead = `${launchOutputHead}${chunk}`.slice(0, 8_192);
});
let launchError = null;
child.once("error", (error) => { launchError = error; });
let childExited = false;
child.once("exit", () => { childExited = true; });
let readiness = null;
let engineRoom = null;
let mainLoaded = null;
const deadline = Date.now() + 45_000;
while (Date.now() < deadline && !launchError && !childExited) {
  try {
    const current = projection();
    const mainCandidate = JSON.parse(current.entries["lifeos.main.loaded"] ?? "null");
    const candidate = JSON.parse(current.entries["glass.ui.ready"] ?? "null");
    const engineCandidate = JSON.parse(current.entries["lifeos.engine-room.ready"] ?? "null");
    if (
      mainCandidate?.schemaVersion === "lifeos.main-loaded.v1" &&
      Number(mainCandidate.loadedAt) >= startedAt &&
      (mainCandidate.href?.includes(`127.0.0.1:${port}`) || mainCandidate.href?.includes(`localhost:${port}`))
    ) {
      mainLoaded = { ...mainCandidate, owner_local_seq: current.pointer.local_seq, owner_checksum: current.pointer.checksum };
    }
    if (mainLoaded && candidate?.schemaVersion === "lifeos.glass-ui-ready.v1" && Number(candidate.mountedAt) >= startedAt) {
      readiness = { ...candidate, owner_local_seq: current.pointer.local_seq, owner_checksum: current.pointer.checksum };
      if (
        engineCandidate?.schemaVersion === "lifeos.engine-room-ready.v1" &&
        engineCandidate.state === "ready" &&
        Number(engineCandidate.observedAt) >= startedAt
      ) {
        engineRoom = { ...engineCandidate, owner_local_seq: current.pointer.local_seq, owner_checksum: current.pointer.checksum };
        break;
      }
    }
  } catch {}
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
}
const tree = processTree(child.pid);
let shutdown = { signal: "SIGTERM", exit_code: null };
terminateTree(child.pid);
await new Promise((resolvePromise) => {
  const timer = setTimeout(resolvePromise, 8_000);
  child.once("exit", (code, signal) => {
    clearTimeout(timer);
    shutdown = { signal, exit_code: code };
    resolvePromise();
  });
});

const result = {
  schema_version: "lifeos.evidence.glass-launch-live.v1",
  authority: "Tauri process and authenticated redb owner projection",
  started_at: new Date(startedAt).toISOString(),
  launch: {
    command: launchCommand.join(" "),
    pid: child.pid,
    process_tree: tree,
    launch_error: launchError?.message ?? null,
    output_head: launchOutputHead,
    output_tail: launchOutput.slice(-4096),
  },
  main_loaded: mainLoaded,
    readiness,
    engine_room: engineRoom,
  shutdown,
  ok: !launchError && Boolean(mainLoaded) && Boolean(readiness) && Boolean(engineRoom) && shutdown.signal === "SIGTERM",
};
mkdirSync(join(root, "evidence/glass"), { recursive: true });
if (!result.ok) {
  writeFileSync(failureReceiptPath, `${JSON.stringify(result, null, 2)}\n`);
  console.error(JSON.stringify(result));
  process.exitCode = 1;
} else {
  writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: "ok", receipt: receiptPath, pid: child.pid, shutdown }, null, 2));
}
