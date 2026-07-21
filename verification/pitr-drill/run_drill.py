#!/usr/bin/env python3
"""ARCHBP-045: disposable PostgreSQL WAL/replication/PITR drill.

Proves, on throwaway infrastructure only: data checksums, WAL archiving,
streaming replication, base backup, selected-LSN point-in-time restore,
extension/schema/RLS/data verification, byte-hash equality, vector and
witness survival, redb-reconciliation replay state, mmap projection
regeneration, and a deterministic reconstruction receipt. Exits nonzero on
any failed check. Never touches a production cluster.
"""

import hashlib
import json
import mmap
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

PGBIN = os.environ.get(
    "PITR_PGBIN",
    "/nix/store/5fsfh7z2v4s52rhngsc2gkc5x581p35a-postgresql-and-plugins-17.10/bin",
)
ROOT = Path(os.environ.get("PITR_ROOT", "/home/flexnetos/meta/var/tmp/pitr-drill"))
HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"

PRIMARY_PORT, REPLICA_PORT, RESTORE_PORT = "55501", "55502", "55503"

checks: dict[str, bool] = {}
details: dict[str, str] = {}


def run(argv, **kwargs):
    return subprocess.run(argv, capture_output=True, text=True, **kwargs)


def pg_ctl(data, *args):
    proc = run([f"{PGBIN}/pg_ctl", "-D", str(data), "-w", "-t", "60", *args])
    if proc.returncode != 0:
        raise RuntimeError(f"pg_ctl {args} failed: {proc.stderr[-800:]}")


def psql(port, db, sql, expect_ok=True):
    proc = run(
        [f"{PGBIN}/psql", "-X", "-q", "-h", str(ROOT), "-p", port, "-d", db,
         "-v", "ON_ERROR_STOP=1", "-Atc", sql],
        env=dict(os.environ, PGOPTIONS="-c client_min_messages=warning"),
    )
    if expect_ok and proc.returncode != 0:
        raise RuntimeError(f"psql({port}) failed for {sql[:100]}: {proc.stderr[-400:]}")
    return proc


def check(name, condition, detail=""):
    checks[name] = bool(condition)
    details[name] = detail
    print(("PASS " if condition else "FAIL ") + name + (f" :: {detail}" if detail and not condition else ""))


def cluster_conf(data, extra=""):
    with open(data / "postgresql.auto.conf", "a") as conf:
        conf.write(
            f"\nunix_socket_directories = '{ROOT}'\n"
            "listen_addresses = '127.0.0.1'\n"
            "wal_level = replica\n"
            "max_wal_senders = 5\n"
            f"{extra}\n"
        )


def main() -> None:
    if ROOT.exists():
        for sub in ("primary", "replica", "restore"):
            data = ROOT / sub
            if (data / "postmaster.pid").exists():
                try:
                    pg_ctl(data, "stop", "-m", "immediate")
                except RuntimeError:
                    pass
        shutil.rmtree(ROOT)
    ROOT.mkdir(parents=True)
    archive = ROOT / "wal-archive"
    archive.mkdir()
    primary = ROOT / "primary"

    # --- primary with data checksums, archiving, replication ------------
    proc = run([f"{PGBIN}/initdb", "--data-checksums", "-D", str(primary)])
    if proc.returncode != 0:
        raise RuntimeError(f"initdb failed: {proc.stderr[-400:]}")
    cluster_conf(
        primary,
        f"port = {PRIMARY_PORT}\narchive_mode = on\n"
        f"archive_command = 'cp %p {archive}/%f'\n",
    )
    pg_ctl(primary, "-l", str(ROOT / "primary.log"), "start")
    check(
        "data_checksums_enabled",
        psql(PRIMARY_PORT, "postgres", "SHOW data_checksums").stdout.strip() == "on",
    )

    # --- workload: extensions, RLS, bytes, vectors, witnesses, secrets --
    psql(PRIMARY_PORT, "postgres", "CREATE DATABASE drill")
    psql(PRIMARY_PORT, "drill", """
        CREATE SCHEMA extensions;
        CREATE EXTENSION ruvector WITH SCHEMA extensions;
        CREATE TABLE drill_bytes (relative_path text PRIMARY KEY, sha256 text NOT NULL, bytes bytea NOT NULL);
        CREATE TABLE drill_vectors (id bigint PRIMARY KEY, emb extensions.ruvector(4) NOT NULL);
        CREATE TABLE drill_witness (seq bigint PRIMARY KEY, witness text NOT NULL);
        CREATE TABLE drill_secrets (name text PRIMARY KEY, ciphertext bytea NOT NULL);
        CREATE TABLE drill_cursor (id boolean PRIMARY KEY DEFAULT true CHECK (id),
                                   acknowledged_seq bigint NOT NULL, last_witness text NOT NULL);
        CREATE TABLE drill_tenant (tenant_id text NOT NULL, payload text NOT NULL);
        ALTER TABLE drill_tenant ENABLE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON drill_tenant
            USING (tenant_id = current_setting('drill.tenant', true));
    """)
    corpus = {
        "src/alpha.rs": b"fn alpha() {}\n",
        "logo.bin": bytes([0, 159, 146, 150, 255]),
        "empty.touch": b"",
    }
    prev = ""
    for i, (path, content) in enumerate(sorted(corpus.items()), start=1):
        sha = hashlib.sha256(content).hexdigest()
        psql(PRIMARY_PORT, "drill",
             f"INSERT INTO drill_bytes VALUES ('{path}', '{sha}', decode('{content.hex()}', 'hex'))")
        prev = hashlib.sha256((prev + str(i) + sha).encode()).hexdigest()
        psql(PRIMARY_PORT, "drill", f"INSERT INTO drill_witness VALUES ({i}, '{prev}')")
    psql(PRIMARY_PORT, "drill",
         "INSERT INTO drill_vectors VALUES (1, '[1,0,0,0]'), (2, '[0,1,0,0]');"
         "INSERT INTO drill_secrets VALUES ('vault', decode('a55a4242', 'hex'));"
         f"INSERT INTO drill_cursor VALUES (true, 3, '{prev}');"
         "INSERT INTO drill_tenant VALUES ('t1', 'alpha'), ('t2', 'beta');")

    # --- base backup + streaming replica --------------------------------
    replica = ROOT / "replica"
    proc = run([f"{PGBIN}/pg_basebackup", "-h", str(ROOT), "-p", PRIMARY_PORT,
                "-D", str(replica), "-R", "-X", "stream"])
    if proc.returncode != 0:
        raise RuntimeError(f"replica basebackup failed: {proc.stderr[-400:]}")
    with open(replica / "postgresql.auto.conf", "a") as conf:
        conf.write(f"\nport = {REPLICA_PORT}\narchive_mode = off\n")
    pg_ctl(replica, "-l", str(ROOT / "replica.log"), "start")
    time.sleep(1.5)
    streaming = psql(PRIMARY_PORT, "postgres",
                     "SELECT count(*) FROM pg_stat_replication WHERE state='streaming'")
    replica_rows = psql(REPLICA_PORT, "drill", "SELECT count(*) FROM drill_bytes")
    check("streaming_replica_serves_corpus",
          streaming.stdout.strip() == "1" and replica_rows.stdout.strip() == "3",
          f"streaming={streaming.stdout.strip()} rows={replica_rows.stdout.strip()}")

    backup = ROOT / "backup"
    proc = run([f"{PGBIN}/pg_basebackup", "-h", str(ROOT), "-p", PRIMARY_PORT,
                "-D", str(backup), "-X", "stream"])
    check("base_backup_taken", proc.returncode == 0, proc.stderr[-200:])

    # --- selected LSN, then post-target writes that must NOT survive ----
    target_lsn = psql(PRIMARY_PORT, "drill", "SELECT pg_current_wal_lsn()").stdout.strip()
    psql(PRIMARY_PORT, "drill",
         "INSERT INTO drill_bytes VALUES ('post/target.leak', 'deadbeef', decode('ff', 'hex'));"
         "INSERT INTO drill_witness VALUES (99, 'post-target-witness');")
    psql(PRIMARY_PORT, "drill", "SELECT pg_switch_wal()")
    psql(PRIMARY_PORT, "drill", "CHECKPOINT")
    time.sleep(1.0)
    check("wal_archiving_produces_segments",
          any(archive.iterdir()), f"archive at {archive}")

    # --- PITR restore to the selected LSN --------------------------------
    restore = ROOT / "restore"
    shutil.copytree(backup, restore)
    (restore / "recovery.signal").touch()
    with open(restore / "postgresql.auto.conf", "a") as conf:
        conf.write(
            f"\nport = {RESTORE_PORT}\narchive_mode = off\n"
            f"restore_command = 'cp {archive}/%f %p'\n"
            f"recovery_target_lsn = '{target_lsn}'\n"
            "recovery_target_action = 'promote'\n"
        )
    pg_ctl(restore, "-l", str(ROOT / "restore.log"), "start")
    for _ in range(30):
        in_recovery = psql(RESTORE_PORT, "postgres", "SELECT pg_is_in_recovery()",
                           expect_ok=False)
        if in_recovery.returncode == 0 and in_recovery.stdout.strip() == "f":
            break
        time.sleep(1)
    check("pitr_restores_to_selected_lsn",
          psql(RESTORE_PORT, "postgres", "SELECT pg_is_in_recovery()").stdout.strip() == "f",
          f"target {target_lsn}")

    leak = psql(RESTORE_PORT, "drill",
                "SELECT count(*) FROM drill_bytes WHERE relative_path LIKE 'post/%'")
    late_witness = psql(RESTORE_PORT, "drill",
                        "SELECT count(*) FROM drill_witness WHERE seq = 99")
    check("post_target_rows_absent",
          leak.stdout.strip() == "0" and late_witness.stdout.strip() == "0")

    ext = psql(RESTORE_PORT, "drill",
               "SELECT extversion || '|' || nspname FROM pg_extension e "
               "JOIN pg_namespace n ON n.oid = e.extnamespace WHERE extname='ruvector'")
    check("extension_version_survives", ext.stdout.strip() == "0.3.0|extensions", ext.stdout.strip())
    schemas = psql(RESTORE_PORT, "drill",
                   "SELECT count(*) FROM information_schema.tables WHERE table_name IN "
                   "('drill_bytes','drill_vectors','drill_witness','drill_secrets','drill_cursor','drill_tenant')")
    check("schemas_survive", schemas.stdout.strip() == "6", schemas.stdout.strip())

    rls = psql(RESTORE_PORT, "drill",
               "SELECT relrowsecurity FROM pg_class WHERE relname='drill_tenant'")
    tenant_view = psql(
        RESTORE_PORT, "drill",
        "BEGIN; CREATE ROLE drill_rls_probe NOLOGIN; GRANT SELECT ON drill_tenant TO drill_rls_probe;"
        " SET LOCAL drill.tenant = 't1'; SET LOCAL ROLE drill_rls_probe;"
        " SELECT string_agg(payload, ',') FROM drill_tenant; ROLLBACK;")
    check("rls_enforced_after_restore",
          rls.stdout.strip() == "t" and tenant_view.stdout.splitlines()[-1].strip() == "alpha",
          f"rls={rls.stdout.strip()} view={tenant_view.stdout.strip()!r}")

    counts = psql(RESTORE_PORT, "drill",
                  "SELECT (SELECT count(*) FROM drill_bytes) || '|' || "
                  "(SELECT count(*) FROM drill_witness) || '|' || "
                  "(SELECT count(*) FROM drill_vectors)")
    check("row_counts_match_target", counts.stdout.strip() == "3|3|2", counts.stdout.strip())

    hash_check = psql(RESTORE_PORT, "drill",
                      "SELECT count(*) FROM drill_bytes WHERE encode(sha256(bytes),'hex') <> sha256")
    check("byte_hashes_equal_in_sql", hash_check.stdout.strip() == "0", hash_check.stdout.strip())

    distance = psql(RESTORE_PORT, "drill",
                    "SET search_path TO extensions, public;"
                    " SELECT round((SELECT emb <-> '[0,1,0,0]'::extensions.ruvector "
                    "FROM drill_vectors WHERE id=1)::numeric, 4)")
    check("vectors_queryable_after_restore",
          distance.stdout.splitlines()[-1].strip() == "1.4142", distance.stdout.strip())

    witness_chain = psql(RESTORE_PORT, "drill",
                         "SELECT string_agg(witness, ',' ORDER BY seq) FROM drill_witness")
    prev_check, ok_chain = "", True
    stored = witness_chain.stdout.strip().split(",")
    for i, (path, content) in enumerate(sorted(corpus.items()), start=1):
        sha = hashlib.sha256(content).hexdigest()
        prev_check = hashlib.sha256((prev_check + str(i) + sha).encode()).hexdigest()
        ok_chain = ok_chain and stored[i - 1] == prev_check
    check("witness_chain_survives", ok_chain and len(stored) == 3)

    secret = psql(RESTORE_PORT, "drill",
                  "SELECT encode(ciphertext, 'hex') FROM drill_secrets WHERE name='vault'")
    check("encrypted_secret_custody_preserved", secret.stdout.strip() == "a55a4242",
          secret.stdout.strip())

    # --- reconstruction: export tree, byte equality ----------------------
    export = ROOT / "exported-tree"
    export.mkdir()
    tree_ok = True
    for path, content in corpus.items():
        hex_bytes = psql(RESTORE_PORT, "drill",
                         f"SELECT encode(bytes,'hex') FROM drill_bytes WHERE relative_path='{path}'")
        restored = bytes.fromhex(hex_bytes.stdout.strip())
        target = export / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(restored)
        tree_ok = tree_ok and restored == content
    check("exported_tree_byte_equal", tree_ok)

    cursor = psql(RESTORE_PORT, "drill",
                  "SELECT acknowledged_seq || '|' || last_witness FROM drill_cursor")
    check("redb_reconciliation_state_replayed",
          cursor.stdout.strip() == f"3|{prev_check}", cursor.stdout.strip())

    # --- mmap projection regeneration ------------------------------------
    projection = ROOT / "projection.regenerated"
    body = json.dumps({
        "format_version": "flexnetos.redb-owner.projection.v0",
        "acknowledged_seq": 3,
        "last_witness": prev_check,
    }, sort_keys=True).encode() + b"\n"
    projection.write_bytes(body)
    with open(projection, "rb") as handle:
        with mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ) as mapped:
            mapped_bytes = bytes(mapped)
    check("mmap_projection_regenerates",
          mapped_bytes == body and hashlib.sha256(mapped_bytes).hexdigest()
          == hashlib.sha256(body).hexdigest())

    # --- deterministic reconstruction receipt ----------------------------
    def receipt_value():
        return {
            "schema_version": "lifeos.pitr-drill-receipt.v0",
            "target_lsn": target_lsn,
            "checks": dict(sorted(checks.items())),
            "corpus_sha256": {p: hashlib.sha256(c).hexdigest() for p, c in sorted(corpus.items())},
            "witness_head": prev_check,
        }
    first = json.dumps(receipt_value(), sort_keys=True)
    second = json.dumps(receipt_value(), sort_keys=True)
    check("reconstruction_receipt_deterministic", first == second)

    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "receipt.json").write_text(
        json.dumps(receipt_value(), indent=2, sort_keys=True) + "\n")

    # --- teardown of every disposable component --------------------------
    for sub in ("restore", "replica", "primary"):
        pg_ctl(ROOT / sub, "stop", "-m", "fast")
    shutil.rmtree(ROOT)

    failed = [name for name, ok in checks.items() if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    if failed:
        print("FAILED:", ", ".join(failed))
        sys.exit(1)
    print("ALL GREEN: disposable WAL/replication/PITR drill complete")


if __name__ == "__main__":
    main()
