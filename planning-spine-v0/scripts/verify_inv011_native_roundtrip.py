#!/usr/bin/env python3
"""Native RVF/PostgreSQL/AgentDB acceptance suite for LifeOS INV-011."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import verify_inv011_cow_db as dbsuite


LIFEOS_ROOT = Path(__file__).resolve().parents[2]
META_ROOT = LIFEOS_ROOT.parents[1]
RUVECTOR_ROOT = META_ROOT / "src/meta-ruvector"
TOOL_ROOT = (
    RUVECTOR_ROOT
    / "crates/ruvector-postgres/inv011-native-roundtrip"
)
TOOL_MANIFEST = TOOL_ROOT / "Cargo.toml"
TARGET_DIR = META_ROOT / "var/tmp/ruvector-inv011-native-target"
TOOL_BINARY = TARGET_DIR / "debug/ruvector-postgres-inv011-roundtrip"
MIGRATION_0009 = (
    LIFEOS_ROOT
    / "crates/lifeos-core/migrations/0009_native_rvf_postgres_acceptance.sql"
)
MIGRATION_0010 = (
    LIFEOS_ROOT
    / "crates/lifeos-core/migrations/0010_native_rvf_catalog_binding.sql"
)
DB_ARTIFACT = (
    LIFEOS_ROOT
    / "planning-spine-v0/envctl-db-nu-plugin-migration-automation-package"
    / "execution-framework/migration-artifacts/inv-011"
    / "cow-db-semantic-suite.json"
)
ARTIFACT = (
    LIFEOS_ROOT
    / "planning-spine-v0/envctl-db-nu-plugin-migration-automation-package"
    / "execution-framework/migration-artifacts/inv-011"
    / "native-rvf-postgres-roundtrip.json"
)
PROFILE_LIBRARY = Path("/home/flexnetos/.nix-profile/lib/ruvector.so")
SUITE_VERSION = "lifeos.native-rvf-postgres-roundtrip.v1"
INPUT_SCHEMA = "lifeos.native-rvf-postgres-input.v1"
TENANT = "40000000-0000-4000-8000-000000000004"


class NativeVerificationFailure(RuntimeError):
    pass


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise NativeVerificationFailure(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha384(path: Path) -> str:
    return hashlib.sha384(path.read_bytes()).hexdigest()


def digest_paths(paths: list[Path], root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def run(
    command: list[str],
    *,
    cwd: Path = META_ROOT,
    check: bool = True,
    timeout: int = 900,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [str(dbsuite.RTK), "proxy", *command],
        cwd=cwd,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        env=env,
    )
    if check and completed.returncode != 0:
        raise NativeVerificationFailure(
            f"command failed ({completed.returncode}): {' '.join(command)}\n"
            f"{completed.stdout}{completed.stderr}"
        )
    return completed


def build_native_tool() -> dict[str, Any]:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment["CARGO_TARGET_DIR"] = str(TARGET_DIR)
    environment["CARGO_NET_OFFLINE"] = "true"
    run(
        [
            "cargo",
            "build",
            "--offline",
            "--manifest-path",
            str(TOOL_MANIFEST),
        ],
        cwd=TOOL_ROOT,
        env=environment,
    )
    assert_true(TOOL_BINARY.is_file(), "native acceptance binary was not built")
    return {
        "path": str(TOOL_BINARY),
        "sha256": sha256(TOOL_BINARY),
        "rvf_runtime_source_sha256": digest_paths(
            [
                RUVECTOR_ROOT / "crates/rvf/rvf-runtime/src/store.rs",
                RUVECTOR_ROOT / "crates/rvf/rvf-runtime/src/membership.rs",
                RUVECTOR_ROOT / "crates/rvf/rvf-runtime/src/cow_map.rs",
                RUVECTOR_ROOT / "crates/rvf/rvf-wire/src/cow_map_codec.rs",
                RUVECTOR_ROOT / "crates/rvf/rvf-wire/src/membership_codec.rs",
            ],
            RUVECTOR_ROOT,
        ),
        "ruvector_postgres_source_sha256": digest_paths(
            [TOOL_MANIFEST, TOOL_ROOT / "src/main.rs"],
            RUVECTOR_ROOT,
        ),
    }


def installed_libraries(database: str = "lifeos") -> list[dict[str, Any]]:
    raw = dbsuite.scalar(
        database,
        "SELECT coalesce(json_agg(json_build_object("
        "'catalog_binding', catalog_binding, 'function_count', function_count"
        ") ORDER BY catalog_binding), '[]'::json) "
        "FROM ("
        "SELECT procedure.probin AS catalog_binding, count(*) AS function_count "
        "FROM pg_proc procedure "
        "JOIN pg_language language ON language.oid=procedure.prolang "
        "JOIN pg_depend dependency "
        "ON dependency.classid='pg_proc'::regclass "
        "AND dependency.objid=procedure.oid "
        "AND dependency.refclassid='pg_extension'::regclass "
        "AND dependency.deptype='e' "
        "JOIN pg_extension extension ON extension.oid=dependency.refobjid "
        "WHERE extension.extname='ruvector' AND language.lanname='c' "
        "GROUP BY procedure.probin"
        ") libraries",
    )
    bindings = json.loads(raw)
    assert_true(bool(bindings), "live RuVector extension has no C-library bindings")
    result: list[dict[str, Any]] = []
    for binding in bindings:
        catalog_binding = binding["catalog_binding"]
        if catalog_binding == "$libdir/ruvector":
            path = PROFILE_LIBRARY
        elif catalog_binding.startswith("/"):
            path = Path(catalog_binding + ".so")
        else:
            raise NativeVerificationFailure(
                f"unsupported live RuVector library binding: {catalog_binding}"
            )
        assert_true(path.is_file(), f"installed RuVector library is missing: {path}")
        result.append(
            {
                "catalog_binding": catalog_binding,
                "function_count": int(binding["function_count"]),
                "path": str(path),
                "sha256": sha256(path),
            }
        )
    return result


def extension_version(database: str = "lifeos") -> str:
    return dbsuite.scalar(database, "SELECT extensions.ruvector_version()")


def extension_catalog_version(database: str = "lifeos") -> str:
    return dbsuite.scalar(
        database,
        "SELECT extversion FROM pg_extension WHERE extname='ruvector'",
    )


def record_receipt(
    database: str,
    kind: str,
    suite: str,
    evidence: bytes,
    label: str,
) -> str:
    evidence_hash = hashlib.sha256(evidence).hexdigest()
    return dbsuite.scalar(
        database,
        "SELECT lifeos_runtime.record_cow_acceptance_receipt_v2("
        f"{dbsuite.sql_text(kind)}, {dbsuite.sql_text(suite)}, true, "
        f"decode({dbsuite.sql_text(evidence.hex())}, 'hex'), "
        f"{dbsuite.sql_text(dbsuite.stable_uuid(label + ':execution:' + evidence_hash))}::uuid, "
        f"{dbsuite.sql_text(dbsuite.stable_uuid(label + ':effect:' + evidence_hash))}::uuid, "
        f"{dbsuite.sql_text(label + ':' + evidence_hash)})",
        role="lifeos_envctl",
    )


def receipt_details(database: str, receipt_id: str) -> dict[str, Any]:
    raw = dbsuite.scalar(
        database,
        "SELECT json_build_object("
        "'receipt_id', receipt_id, "
        "'receipt_digest', encode(receipt_digest,'hex'), "
        "'evidence_digest', encode(evidence_digest,'hex'), "
        "'accepted', accepted, "
        "'suite_version', suite_version"
        ") FROM lifeos_runtime.cow_acceptance_receipt "
        f"WHERE receipt_id={dbsuite.sql_text(receipt_id)}::uuid",
    )
    return json.loads(raw)


def latest_database_receipt(database: str) -> dict[str, Any]:
    raw = dbsuite.scalar(
        database,
        "SELECT json_build_object("
        "'receipt_id', receipt_id, "
        "'receipt_digest', encode(receipt_digest,'hex'), "
        "'evidence_digest', encode(evidence_digest,'hex')"
        ") FROM lifeos_runtime.cow_acceptance_receipt "
        "WHERE receipt_kind='database-semantics' "
        "AND suite_version='lifeos.cow-db-semantic-suite.v1' "
        "AND accepted "
        "ORDER BY created_at DESC, receipt_id DESC LIMIT 1",
    )
    return json.loads(raw)


def branch_generation(database: str, branch_id: str) -> int:
    return int(
        dbsuite.scalar(
            database,
            "SELECT head_generation FROM lifeos_runtime.branch "
            f"WHERE branch_id={dbsuite.sql_text(branch_id)}::uuid",
            role="lifeos_migrator",
            tenant=TENANT,
        )
    )


def resolved_rows(database: str, branch_id: str) -> list[dict[str, Any]]:
    generation = branch_generation(database, branch_id)
    raw = dbsuite.scalar(
        database,
        "SELECT coalesce(json_agg(json_build_object("
        "'relation_name', member.relation_name::text, "
        "'logical_key_digest', encode(member.logical_key_digest,'hex'), "
        "'operation', member.operation, "
        "'tombstone', member.operation='delete', "
        "'vector_id', identity.vector_id"
        ") ORDER BY member.relation_name::text, identity.vector_id), '[]'::json) "
        "FROM lifeos_runtime.resolved_branch_members_v2("
        f"{dbsuite.sql_text(branch_id)}::uuid, {generation}::bigint"
        ") member "
        "JOIN lifeos_rvf.member_vector_identity identity "
        "ON identity.tenant_id=current_setting('lifeos.tenant_id')::uuid "
        "AND identity.relation_name=member.relation_name "
        "AND identity.member_key_digest=member.logical_key_digest",
        role="lifeos_migrator",
        tenant=TENANT,
    )
    rows = json.loads(raw)
    for row in rows:
        row["vector_id"] = int(row["vector_id"])
    return rows


def durable_vector_id(database: str, member: str) -> int:
    return int(
        dbsuite.scalar(
            database,
            "SELECT identity.vector_id "
            "FROM lifeos_rvf.member_vector_identity identity "
            f"WHERE identity.tenant_id={dbsuite.sql_text(TENANT)}::uuid "
            f"AND identity.relation_name={dbsuite.relation()} "
            "AND identity.member_key_digest=extensions.digest("
            f"convert_to({dbsuite.key(member)}::text,'UTF8'),'sha256')",
            role="lifeos_migrator",
            tenant=TENANT,
        )
    )


def seed_roundtrip(database: str) -> dict[str, Any]:
    root = dbsuite.create_root(database, TENANT, "native-root")
    dbsuite.append_overlay(
        database,
        TENANT,
        root,
        "alpha",
        "insert",
        "native-root:alpha",
        {"value": "alpha-v1"},
    )
    dbsuite.append_overlay(
        database,
        TENANT,
        root,
        "beta",
        "insert",
        "native-root:beta",
        {"value": "beta-v1"},
    )
    alpha_before = durable_vector_id(database, "alpha")
    beta_before = durable_vector_id(database, "beta")
    child = dbsuite.create_child(database, TENANT, root, "native-child")
    alpha_digest = dbsuite.row_digest(database, TENANT, child, "alpha")
    dbsuite.append_overlay(
        database,
        TENANT,
        child,
        "alpha",
        "update",
        "native-child:alpha-replacement",
        {"value": "alpha-v2"},
        alpha_digest,
    )
    beta_digest = dbsuite.row_digest(database, TENANT, child, "beta")
    dbsuite.append_overlay(
        database,
        TENANT,
        child,
        "beta",
        "delete",
        "native-child:beta-tombstone",
        base_digest=beta_digest,
    )
    alpha_after = durable_vector_id(database, "alpha")
    beta_after = durable_vector_id(database, "beta")
    assert_true(
        alpha_before == alpha_after and beta_before == beta_after,
        "durable vector identities changed across replacement/tombstone",
    )
    return {
        "root": root,
        "child": child,
        "parent_generation_id": branch_generation(database, root),
        "generation_id": branch_generation(database, child),
        "parent_rows": resolved_rows(database, root),
        "rows": resolved_rows(database, child),
        "stable_vector_ids": {
            "alpha": alpha_after,
            "beta": beta_after,
        },
    }


def execute_native_tool(seed: dict[str, Any]) -> tuple[dict[str, Any], Path]:
    staging_root = Path(
        tempfile.mkdtemp(prefix="ruvector-inv011-roundtrip.", dir=META_ROOT / "var/tmp")
    )
    input_path = staging_root / "input.json"
    output_dir = staging_root / "rvf"
    tool_input = {
        "schema": INPUT_SCHEMA,
        "parent_generation_id": seed["parent_generation_id"],
        "parent_rows": seed["parent_rows"],
        "generation_id": seed["generation_id"],
        "rows": seed["rows"],
    }
    input_path.write_bytes(canonical_bytes(tool_input))
    completed = run([str(TOOL_BINARY), str(input_path), str(output_dir)])
    report = json.loads(completed.stdout.strip().splitlines()[-1])
    assert_true(report["status"] == "passed", "native tool did not pass")

    overflow_input = copy.deepcopy(tool_input)
    overflow_input["generation_id"] = 2**32
    overflow_path = staging_root / "overflow.json"
    overflow_path.write_bytes(canonical_bytes(overflow_input))
    overflow = run(
        [str(TOOL_BINARY), str(overflow_path), str(staging_root / "overflow-rvf")],
        check=False,
    )
    assert_true(overflow.returncode != 0, "native u32 overflow was accepted")
    assert_true(
        "exceeds u32::MAX" in overflow.stderr,
        "native overflow failure did not identify the u32 boundary",
    )

    child_sha = sha256(output_dir / "agentdb-child.rvf")
    durable_dir = META_ROOT / "var/lib/ruvector/inv011" / child_sha
    durable_dir.parent.mkdir(parents=True, exist_ok=True)
    if durable_dir.exists():
        for name in (
            "agentdb-parent.rvf",
            "agentdb-child.rvf",
            "cow-map.payload",
            "parent-membership.payload",
            "membership.payload",
        ):
            assert_true(
                sha256(durable_dir / name) == sha256(output_dir / name),
                f"content-addressed RVF collision for {name}",
            )
    else:
        output_dir.rename(durable_dir)
    return report, durable_dir


def mirror_and_compare(
    database: str,
    seed: dict[str, Any],
    durable_dir: Path,
) -> dict[str, Any]:
    parent_bytes = (durable_dir / "agentdb-parent.rvf").read_bytes()
    parent_membership = (durable_dir / "parent-membership.payload").read_bytes()
    child_bytes = (durable_dir / "agentdb-child.rvf").read_bytes()
    cow_payload = (durable_dir / "cow-map.payload").read_bytes()

    parent_container = dbsuite.api(
        database,
        TENANT,
        "SELECT lifeos_rvf.mirror_branch_membership_v2("
        f"{dbsuite.sql_text(seed['root'])}::uuid, NULL, "
        f"decode({dbsuite.sql_text(parent_bytes.hex())},'hex'), "
        f"decode({dbsuite.sql_text(parent_membership.hex())},'hex'), "
        f"{dbsuite.sql_text(dbsuite.stable_uuid('native-parent:execution'))}::uuid, "
        f"{dbsuite.sql_text(dbsuite.stable_uuid('native-parent:effect'))}::uuid, "
        "'native-parent-rvf')",
    )
    child_container = dbsuite.api(
        database,
        TENANT,
        "SELECT lifeos_rvf.mirror_branch_membership_v2("
        f"{dbsuite.sql_text(seed['child'])}::uuid, "
        f"{dbsuite.sql_text(parent_container)}::uuid, "
        f"decode({dbsuite.sql_text(child_bytes.hex())},'hex'), "
        f"decode({dbsuite.sql_text(cow_payload.hex())},'hex'), "
        f"{dbsuite.sql_text(dbsuite.stable_uuid('native-child:execution'))}::uuid, "
        f"{dbsuite.sql_text(dbsuite.stable_uuid('native-child:effect'))}::uuid, "
        "'native-child-rvf')",
    )
    mirrored_raw = dbsuite.scalar(
        database,
        "SELECT coalesce(json_agg(json_build_object("
        "'relation_name', membership.relation_name::text, "
        "'logical_key_digest', encode(membership.member_key_digest,'hex'), "
        "'operation', resolved.operation, "
        "'tombstone', membership.tombstone, "
        "'vector_id', membership.vector_id"
        ") ORDER BY membership.relation_name::text, membership.vector_id), '[]'::json) "
        "FROM lifeos_rvf.membership membership "
        "JOIN lifeos_runtime.resolved_branch_members_v2("
        f"{dbsuite.sql_text(seed['child'])}::uuid, "
        f"{seed['generation_id']}::bigint"
        ") resolved "
        "ON resolved.relation_name=membership.relation_name "
        "AND resolved.logical_key_digest=membership.member_key_digest "
        f"WHERE membership.container_id={dbsuite.sql_text(child_container)}::uuid",
        role="lifeos_migrator",
        tenant=TENANT,
    )
    mirrored = json.loads(mirrored_raw)
    for row in mirrored:
        row["vector_id"] = int(row["vector_id"])
    assert_true(
        mirrored == seed["rows"],
        f"PostgreSQL/AgentDB membership differs from native RVF: {mirrored}",
    )
    cow_roundtrip = dbsuite.scalar(
        database,
        "SELECT encode(object.raw_bytes,'hex') "
        "FROM lifeos_rvf.cow_map map "
        "JOIN lifeos_blob.object object ON object.id=map.range_map_object_id "
        f"WHERE map.child_container_id={dbsuite.sql_text(child_container)}::uuid",
        role="lifeos_migrator",
        tenant=TENANT,
    )
    assert_true(cow_roundtrip == cow_payload.hex(), "canonical COW_MAP bytes changed in SQL")
    generation_pair = dbsuite.scalar(
        database,
        "SELECT container.generation::text || ':' || map.generation::text "
        "FROM lifeos_rvf.container container "
        "JOIN lifeos_rvf.cow_map map "
        "ON map.child_container_id=container.container_id "
        f"WHERE container.container_id={dbsuite.sql_text(child_container)}::uuid",
        role="lifeos_migrator",
        tenant=TENANT,
    )
    assert_true(
        generation_pair
        == f"{seed['generation_id']}:{seed['generation_id']}",
        "SQL container/COW generation differs from the RVF generation",
    )
    return {
        "parent_container_id": parent_container,
        "child_container_id": child_container,
        "compared_row_count": len(mirrored),
        "generation_id": seed["generation_id"],
        "cow_payload_sha256": hashlib.sha256(cow_payload).hexdigest(),
    }


def verify_upgrade(database: str) -> dict[str, Any]:
    root = dbsuite.create_root(database, TENANT, "native-upgrade-root")
    before = dbsuite.scalar(
        database,
        "SELECT count(*) FROM lifeos_runtime.branch",
        role="lifeos_migrator",
        tenant=TENANT,
    )
    dbsuite.apply_migration(database, 9)
    dbsuite.apply_migration(database, 10)
    after = dbsuite.scalar(
        database,
        "SELECT count(*) FROM lifeos_runtime.branch",
        role="lifeos_migrator",
        tenant=TENANT,
    )
    report = dbsuite.json_result(
        dbsuite.scalar(database, "SELECT lifeos_runtime.cow_branch_capability()")
    )
    assert_true(before == after == "1", "0009 upgrade changed durable branch rows")
    assert_true(report["implemented"] is False, "0009 upgrade did not fail closed")
    assert_true(report["rvf_roundtrip"] is False, "upgrade invented a native receipt")
    assert_true(bool(root), "upgrade seed branch was not created")
    return {
        "status": "passed",
        "preserved_branch_rows": int(after),
        "capability": report,
    }


def apply_live_migration() -> dict[str, Any]:
    migrations = (
        (9, "native rvf postgres acceptance", MIGRATION_0009),
        (10, "native rvf catalog binding", MIGRATION_0010),
    )
    for target_version, description, migration in migrations:
        version = int(
            dbsuite.scalar(
                "lifeos",
                "SELECT coalesce(max(version),0) "
                "FROM lifeos_runtime._sqlx_migrations WHERE success",
            )
        )
        checksum = sha384(migration)
        if version < target_version:
            assert_true(
                version == target_version - 1,
                f"live migration predecessor is {version}, expected {target_version - 1}",
            )
            insert = (
                "INSERT INTO lifeos_runtime._sqlx_migrations("
                "version, description, installed_on, success, checksum, execution_time"
                f") VALUES ({target_version}, {dbsuite.sql_text(description)}, "
                "clock_timestamp(), "
                f"true, decode('{checksum}','hex'), 0)"
            )
            run(
                [
                    "psql",
                    "-h",
                    str(dbsuite.SOCKET),
                    "-d",
                    "lifeos",
                    "-X",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-1",
                    "-f",
                    str(migration),
                    "-c",
                    insert,
                ]
            )
        else:
            ledger_checksum = dbsuite.scalar(
                "lifeos",
                "SELECT encode(checksum,'hex') "
                "FROM lifeos_runtime._sqlx_migrations "
                f"WHERE version={target_version} AND success",
            )
            assert_true(
                ledger_checksum == checksum,
                f"live {target_version:04d} SQLx checksum differs from current source",
            )
    report = dbsuite.json_result(
        dbsuite.scalar("lifeos", "SELECT lifeos_runtime.cow_branch_capability()")
    )
    assert_true(
        report["database_semantics_receipt"] is True,
        "live database-semantic receipt is not valid after 0009",
    )
    return report


def source_digests() -> dict[str, str]:
    paths = [
        MIGRATION_0009,
        MIGRATION_0010,
        LIFEOS_ROOT / "crates/lifeos-core/migrations/0007_cow_truthful_semantics.sql",
        LIFEOS_ROOT / "crates/lifeos-core/migrations/0008_cow_least_privilege_closure.sql",
        LIFEOS_ROOT / "crates/lifeos-core/src/storage/branches.rs",
        Path(__file__),
        LIFEOS_ROOT / "planning-spine-v0/scripts/verify_inv011_cow_db.py",
        TOOL_MANIFEST,
        TOOL_ROOT / "src/main.rs",
        RUVECTOR_ROOT / "crates/rvf/rvf-runtime/src/store.rs",
        RUVECTOR_ROOT / "crates/rvf/rvf-runtime/src/membership.rs",
        RUVECTOR_ROOT / "crates/rvf/rvf-wire/src/cow_map_codec.rs",
        RUVECTOR_ROOT / "crates/rvf/rvf-wire/src/membership_codec.rs",
    ]
    return {path.relative_to(META_ROOT).as_posix(): sha256(path) for path in paths}


def main() -> int:
    migration_suffix = sha256(MIGRATION_0010)[:8]
    fresh_db = f"lifeos_inv011_fresh_suite_{migration_suffix}"
    upgrade_db = f"lifeos_inv011_upgrade_suite_{migration_suffix}"
    dbsuite.validate_database_name(fresh_db)
    dbsuite.validate_database_name(upgrade_db)
    completed = False
    try:
        adversarial = run(
            [
                "python3",
                str(LIFEOS_ROOT / "planning-spine-v0/scripts/verify_inv011_cow_db.py"),
            ],
            cwd=LIFEOS_ROOT,
            timeout=1200,
        )
        adversarial_report = json.loads(adversarial.stdout.strip().splitlines()[-1])
        assert_true(adversarial_report["status"] == "passed", "adversarial suite failed")

        native_binary = build_native_tool()
        libraries = installed_libraries()
        current_extension_version = extension_version()
        live_catalog_version = extension_catalog_version()
        db_artifact_sha = sha256(DB_ARTIFACT)

        dbsuite.setup_database(fresh_db, 10)
        fresh_catalog_version = extension_catalog_version(fresh_db)
        initial = dbsuite.json_result(
            dbsuite.scalar(fresh_db, "SELECT lifeos_runtime.cow_branch_capability()")
        )
        assert_true(initial["implemented"] is False, "fresh 0009 did not fail closed")
        database_receipt_id = record_receipt(
            fresh_db,
            "database-semantics",
            "lifeos.cow-db-semantic-suite.v1",
            DB_ARTIFACT.read_bytes(),
            "native-fresh-database-suite",
        )
        database_receipt = receipt_details(fresh_db, database_receipt_id)
        database_only = dbsuite.json_result(
            dbsuite.scalar(fresh_db, "SELECT lifeos_runtime.cow_branch_capability()")
        )
        assert_true(
            database_only["database_semantics_receipt"] is True
            and database_only["implemented"] is False,
            "database receipt alone opened the native capability gate",
        )

        seed = seed_roundtrip(fresh_db)
        native_report, durable_dir = execute_native_tool(seed)
        mirror = mirror_and_compare(fresh_db, seed, durable_dir)
        dbsuite.verify_witness_chain(fresh_db, TENANT)
        self_check = dbsuite.json_result(
            dbsuite.scalar(
                fresh_db,
                "SELECT lifeos_runtime.cow_semantic_self_check_v2()",
                role="lifeos_migrator",
            )
        )
        assert_true(
            self_check["ready"] is True
            and self_check["public_security_definer_count"] == 0,
            "least-privilege/RLS self-check failed",
        )

        dbsuite.setup_database(upgrade_db, 8)
        upgrade = verify_upgrade(upgrade_db)

        evidence = {
            "schema": "lifeos.native-rvf-postgres-roundtrip.v1",
            "suite_version": SUITE_VERSION,
            "status": "passed",
            "database_semantics": {
                "suite_version": "lifeos.cow-db-semantic-suite.v1",
                "artifact_sha256": db_artifact_sha,
                "receipt_id": database_receipt["receipt_id"],
                "receipt_digest": database_receipt["receipt_digest"],
            },
            "installed_extension": {
                "version": current_extension_version,
                "catalog_version": fresh_catalog_version,
            },
            "installed_libraries": libraries,
            "native_binary": native_binary,
            "source_digests": source_digests(),
            "verification": {
                "adversarial_suite": "passed",
                "native_close_reopen": "passed",
                "postgres_roundtrip": "passed",
                "fresh_bootstrap": "passed",
                "upgrade_migration": "passed",
                "least_privilege_rls": "passed",
                "witness_chain": "passed",
                "generation_u32_overflow": "passed",
                "replacement_tombstone_identity": "passed",
            },
        }
        evidence_bytes = canonical_bytes(evidence)
        native_receipt_id = record_receipt(
            fresh_db,
            "native-rvf-roundtrip",
            SUITE_VERSION,
            evidence_bytes,
            "native-fresh-roundtrip",
        )
        native_receipt = receipt_details(fresh_db, native_receipt_id)
        fresh_capability = dbsuite.json_result(
            dbsuite.scalar(fresh_db, "SELECT lifeos_runtime.cow_branch_capability()")
        )
        assert_true(
            fresh_capability["implemented"] is True
            and fresh_capability["rvf_roundtrip"] is True
            and fresh_capability["native_evidence_valid"] is True
            and fresh_capability["runtime_digest_binding"] is True,
            f"native receipt did not open the strong capability gate: {fresh_capability}",
        )

        live_before_native = apply_live_migration()
        live_database_receipt = latest_database_receipt("lifeos")
        live_evidence = copy.deepcopy(evidence)
        live_evidence["database_semantics"]["receipt_id"] = live_database_receipt[
            "receipt_id"
        ]
        live_evidence["database_semantics"]["receipt_digest"] = live_database_receipt[
            "receipt_digest"
        ]
        live_evidence["installed_extension"]["catalog_version"] = live_catalog_version
        live_evidence_bytes = canonical_bytes(live_evidence)
        live_native_receipt_id = record_receipt(
            "lifeos",
            "native-rvf-roundtrip",
            SUITE_VERSION,
            live_evidence_bytes,
            "native-live-roundtrip",
        )
        live_native_receipt = receipt_details("lifeos", live_native_receipt_id)
        live_capability = dbsuite.json_result(
            dbsuite.scalar("lifeos", "SELECT lifeos_runtime.cow_branch_capability()")
        )
        assert_true(
            live_capability["implemented"] is True
            and live_capability["database_semantics_receipt"] is True
            and live_capability["rvf_roundtrip"] is True
            and live_capability["runtime_digest_binding"] is True,
            f"live capability did not pass: {live_capability}",
        )

        rvf_files = {
            name: {
                "path": str(durable_dir / name),
                "sha256": sha256(durable_dir / name),
                "bytes": (durable_dir / name).stat().st_size,
            }
            for name in (
                "agentdb-parent.rvf",
                "agentdb-child.rvf",
                "cow-map.payload",
                "parent-membership.payload",
                "membership.payload",
            )
        }
        artifact = {
            **evidence,
            "task_id": "CAP-INV011-004_RVF_POSTGRES_ROUNDTRIP",
            "verified_at": datetime.now(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "evidence_sha256": hashlib.sha256(evidence_bytes).hexdigest(),
            "native_roundtrip": native_report,
            "postgres_roundtrip": mirror,
            "rvf_files": rvf_files,
            "fresh_bootstrap": {
                "status": "passed",
                "database_receipt": database_receipt,
                "native_receipt": native_receipt,
                "capability": fresh_capability,
                "self_check": self_check,
            },
            "upgrade_from_0008": upgrade,
            "live": {
                "database": "lifeos",
                "before_native_receipt": live_before_native,
                "database_receipt": live_database_receipt,
                "native_receipt": live_native_receipt,
                "capability": live_capability,
            },
        }
        ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
        ARTIFACT.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
        completed = True
        print(json.dumps(artifact, sort_keys=True))
        return 0
    except (
        NativeVerificationFailure,
        dbsuite.VerificationFailure,
        subprocess.TimeoutExpired,
        json.JSONDecodeError,
        OSError,
    ) as error:
        print(f"INV-011 native roundtrip verification failed: {error}", file=sys.stderr)
        return 1
    finally:
        if completed:
            dbsuite.drop_database(fresh_db)
            dbsuite.drop_database(upgrade_db)


if __name__ == "__main__":
    raise SystemExit(main())
