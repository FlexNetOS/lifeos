import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// ARCHBP-133 — Recover cleanly from crash/dirty shutdown (WAL replay, redb
// crash path). Gate: Dirty-shutdown recovery works; WAL/replay validated; No
// corruption. (yzx-iso t7-7, G3/G7 — the envelope-level orchestration over
// the ARCHBP-039/045 component mechanisms.)
//
// The destructive drill (sentinel write -> kill -9 postmaster -> recover via
// the reattach path -> validate) runs ONCE at delivery and records a durable
// receipt; this always-on spec validates the engine, the receipt, and the
// crash-recovery lines that persist in the real cluster log — it never
// re-crashes production on suite runs.

const repoRoot = resolve(import.meta.dirname, "..");
const engine = resolve(repoRoot, "scripts/dirty-shutdown-recovery.mjs");
const RECEIPT = "/home/flexnetos/meta/var/xdg-data/lifeos/crash-drill/receipt.json";
const PG_LOG = "/home/flexnetos/meta/var/lib/postgresql/17/logfile";

const receipt = () => JSON.parse(readFileSync(RECEIPT, "utf8"));

describe("ARCHBP-133 envelope-level dirty-shutdown recovery", () => {
  test("recovery engine is built with drill and status phases", () => {
    expect(existsSync(engine)).toBe(true);
    const src = readFileSync(engine, "utf8");
    expect(src).toContain('"drill"');
    expect(src).toContain('"status"');
    // Recovery goes through the sanctioned re-attach path, not a side channel.
    expect(src).toContain('from "./boot-reattach.mjs"');
  });

  test("dirty-shutdown recovery works: the executed drill detected the crash and recovered", () => {
    const r = receipt();
    expect(r.schema_version).toBe("lifeos-planning-spine.crash-drill-receipt.v0");
    expect(r.crash.method).toBe("kill-9-postmaster");
    expect(r.crash.down_confirmed).toBe(true); // 5432 actually refused
    expect(r.crash.dirty_marker).toBe(true); // stale postmaster.pid observed
    expect(r.recovery.ok).toBe(true);
    expect(r.recovery.healthy_after).toBe(true);
    expect(r.recovery.via).toBe("startServicesOrdered(productionServices)");
  });

  test("WAL replay is validated from the cluster's own log — and the lines persist live", () => {
    const r = receipt();
    const joined = r.wal_replay.log_lines.join("\n");
    expect(r.wal_replay.validated).toBe(true);
    expect(joined).toContain("database system was not properly shut down");
    expect(joined).toMatch(/redo starts at|redo done at/);
    // The same recovery lines are in the real logfile right now.
    const live = readFileSync(PG_LOG, "utf8");
    expect(live).toContain("database system was not properly shut down; automatic recovery in progress");
    expect(live).toMatch(/redo done at/);
  });

  test("no corruption: sentinel data survived the crash byte-for-byte; redb plane intact", () => {
    const r = receipt();
    expect(r.corruption.sentinel_rows_written).toBeGreaterThanOrEqual(100);
    expect(r.corruption.sentinel_rows_read).toBe(r.corruption.sentinel_rows_written);
    expect(r.corruption.sentinel_checksum_before).toMatch(/^[0-9a-f]{32}$/);
    expect(r.corruption.sentinel_checksum_after).toBe(r.corruption.sentinel_checksum_before);
    expect(r.corruption.redb_probe_intact).toBe(true);
    // Rollback honored: the drill database is removed, the receipt retained.
    expect(r.rollback.drill_db_dropped).toBe(true);
  });

  test("status re-validates live: cluster healthy now, replay evidence still present", () => {
    const out = execFileSync("bun", [engine, "status", "--json"], { encoding: "utf8", timeout: 30000 });
    const s = JSON.parse(out.trim());
    expect(s.ok).toBe(true);
    expect(s.postgres_healthy).toBe(true);
    expect(s.replay_lines_present).toBe(true);
    expect(s.receipt_valid).toBe(true);
  }, 60000);
});
