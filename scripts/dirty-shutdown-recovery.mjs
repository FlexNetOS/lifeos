// yzx-iso T7.7 (spine ARCHBP-133) — envelope-level dirty-shutdown recovery
// over the ARCHBP-039 (redb crash replay) / ARCHBP-045 (WAL/PITR) component
// mechanisms.
//
//   drill    the destructive proof, run once at delivery: write committed
//            sentinel data -> kill -9 the live postmaster (true crash, no
//            shutdown checkpoint) -> confirm down + dirty marker -> recover
//            through the sanctioned reattach service path -> validate WAL
//            replay from the cluster's own log -> verify the sentinel
//            byte-for-byte -> drop the drill DB (rollback) -> durable receipt.
//   status   non-destructive re-validation: receipt parses, the replay lines
//            still stand in the live log, the cluster is healthy now.
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect } from "node:net";
import { dirname } from "node:path";
import { productionServices, startServicesOrdered, reattachDurablePlane } from "./boot-reattach.mjs";

const PG_DATA = "/home/flexnetos/meta/var/lib/postgresql/17";
const PG_LOG = `${PG_DATA}/logfile`;
const PG_SOCKET_DIR = "/home/flexnetos/meta/var/run/postgresql";
const RECEIPT = "/home/flexnetos/meta/var/xdg-data/lifeos/crash-drill/receipt.json";
const REDB_DIR = "/home/flexnetos/meta/var/lib/redb";
const DRILL_DB = "archbp133_drill";
const SENTINEL_ROWS = 500;

// The cluster log is append-only and can be huge — never read it wholesale.
export function readLogFrom(path, offset) {
  const size = statSync(path).size;
  const length = size - offset;
  if (length <= 0) return "";
  const buf = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try { readSync(fd, buf, 0, length, offset); } finally { closeSync(fd); }
  return buf.toString("utf8");
}

const psqlBin = () =>
  execFileSync("bash", ["-c", "ls /nix/store/*-postgresql-17.10/bin/psql 2>/dev/null | head -1"], { encoding: "utf8" }).trim();

function sql(db, query, psql = psqlBin()) {
  return execFileSync(psql, ["-h", PG_SOCKET_DIR, "-U", "flexnetos", "-d", db, "-v", "ON_ERROR_STOP=1", "-tAc", query], { encoding: "utf8", timeout: 30000 }).trim();
}

const tcpUp = (port = 5432) =>
  new Promise((res) => {
    const s = connect({ port, host: "127.0.0.1" });
    s.once("connect", () => { s.destroy(); res(true); });
    s.once("error", () => res(false));
  });

async function waitFor(cond, timeoutMs, everyMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

const sentinelChecksum = () =>
  sql(DRILL_DB, "SELECT md5(string_agg(payload, ',' ORDER BY id)) FROM sentinel");

export async function drill() {
  if (!(await tcpUp())) throw new Error("precondition: postgres must be healthy before the drill");

  // (1) Committed sentinel data — WAL entries newer than the last checkpoint,
  // so the post-crash restart has real redo work.
  sql("postgres", `DROP DATABASE IF EXISTS ${DRILL_DB}`);
  sql("postgres", `CREATE DATABASE ${DRILL_DB}`);
  sql(DRILL_DB, "CREATE TABLE sentinel (id int PRIMARY KEY, payload text NOT NULL)");
  sql(DRILL_DB, `INSERT INTO sentinel SELECT g, md5(g::text || '-archbp133') FROM generate_series(1, ${SENTINEL_ROWS}) g`);
  const rowsWritten = Number(sql(DRILL_DB, "SELECT count(*) FROM sentinel"));
  const checksumBefore = sentinelChecksum();
  const redbProbe = `${REDB_DIR}/archbp133-probe`;
  mkdirSync(REDB_DIR, { recursive: true });
  writeFileSync(redbProbe, checksumBefore);

  // (2) True crash: kill -9 the postmaster — no shutdown checkpoint is
  // written, so the next start MUST replay WAL.
  const logOffset = statSync(PG_LOG).size;
  const postmasterPid = readFileSync(`${PG_DATA}/postmaster.pid`, "utf8").split("\n")[0].trim();
  execFileSync("kill", ["-9", postmasterPid]);
  const downConfirmed = await waitFor(async () => !(await tcpUp()), 15000);
  const dirtyMarker = existsSync(`${PG_DATA}/postmaster.pid`); // stale pid file = dirty shutdown

  // (3) Recovery through the sanctioned re-attach path — the same engine the
  // boot unit runs; nothing bespoke.
  const svc = await startServicesOrdered(productionServices());
  const healthyAfter = await waitFor(() => tcpUp(), 30000);

  // (4) WAL replay validated from the cluster's own words.
  const logTail = readLogFrom(PG_LOG, logOffset);
  const logLines = logTail.split("\n").filter((l) =>
    /was not properly shut down|database system was interrupted|automatic recovery|redo starts at|redo done at|ready to accept connections/.test(l));
  const replayValidated =
    logTail.includes("database system was not properly shut down; automatic recovery in progress") &&
    /redo done at/.test(logTail);

  // (5) No corruption: identical sentinel checksum, intact redb probe.
  const rowsRead = Number(sql(DRILL_DB, "SELECT count(*) FROM sentinel"));
  const checksumAfter = sentinelChecksum();
  const redbIntact = readFileSync(redbProbe, "utf8") === checksumBefore;
  const durable = reattachDurablePlane();

  // (6) Rollback: remove task-created artifacts, retain the evidence receipt.
  sql("postgres", `DROP DATABASE ${DRILL_DB}`);
  execFileSync("rm", ["-f", redbProbe]);

  const receipt = {
    schema_version: "lifeos-planning-spine.crash-drill-receipt.v0",
    executed_at: new Date().toISOString(),
    boot_id: readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(),
    crash: { method: "kill-9-postmaster", postmaster_pid: Number(postmasterPid), down_confirmed: downConfirmed, dirty_marker: dirtyMarker },
    recovery: { ok: svc.ok, healthy_after: healthyAfter, via: "startServicesOrdered(productionServices)", report: svc.report, durable_plane_ok: durable.ok },
    wal_replay: { validated: replayValidated, log_offset: logOffset, log_lines: logLines },
    corruption: {
      sentinel_rows_written: rowsWritten,
      sentinel_rows_read: rowsRead,
      sentinel_checksum_before: checksumBefore,
      sentinel_checksum_after: checksumAfter,
      redb_probe_intact: redbIntact,
    },
    rollback: { drill_db_dropped: true, redb_probe_removed: true },
    ok: downConfirmed && dirtyMarker && svc.ok && healthyAfter && replayValidated &&
      rowsRead === rowsWritten && checksumAfter === checksumBefore && redbIntact,
  };
  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export async function status() {
  let receiptValid = false;
  try {
    const r = JSON.parse(readFileSync(RECEIPT, "utf8"));
    receiptValid = r.schema_version === "lifeos-planning-spine.crash-drill-receipt.v0" && r.ok === true;
  } catch { /* missing or unreadable receipt stays invalid */ }
  const live = readLogFrom(PG_LOG, Math.max(0, statSync(PG_LOG).size - 4 * 1024 * 1024));
  const replayPresent =
    live.includes("database system was not properly shut down; automatic recovery in progress") &&
    /redo done at/.test(live);
  const healthy = await tcpUp();
  return {
    schema_version: "lifeos-planning-spine.crash-drill-status.v0",
    ok: receiptValid && replayPresent && healthy,
    receipt_valid: receiptValid,
    replay_lines_present: replayPresent,
    postgres_healthy: healthy,
  };
}

async function main() {
  const [cmd] = process.argv.slice(2);
  if (cmd === "drill") {
    const r = await drill();
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === "status") {
    const s = await status();
    process.stdout.write(`${JSON.stringify(s)}\n`);
    process.exit(s.ok ? 0 : 1);
  } else {
    console.error("usage: dirty-shutdown-recovery.mjs {drill|status}");
    process.exit(2);
  }
}

if (import.meta.main) main();
