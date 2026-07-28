#!/usr/bin/env python3
"""Adversarial acceptance suite for LifeOS INV-011 COW database semantics."""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[2]
RTK = Path("/home/flexnetos/.nix-profile/bin/rtk")
SOCKET = Path("/home/flexnetos/meta/var/run/postgresql")
MIGRATIONS = REPO / "crates/lifeos-core/migrations"
BOOTSTRAP = REPO / "crates/lifeos-core/sql/bootstrap-postgres-ruvector.sql"
ARTIFACT = (
    REPO
    / "planning-spine-v0/envctl-db-nu-plugin-migration-automation-package"
    / "execution-framework/migration-artifacts/inv-011"
    / "cow-db-semantic-suite.json"
)
DB_PATTERN = re.compile(r"^lifeos_inv011_(fresh|upgrade)_suite_[0-9a-f]{8}$")
BASELINE_GATES = (
    "build",
    "byte-reconstruction",
    "security",
    "static-analysis",
    "test",
    "witness-integrity",
)
CONFLICT_CLASSES = (
    "key",
    "byte",
    "ast",
    "semantic",
    "graph",
    "policy",
    "release",
)
TENANT_A = "10000000-0000-4000-8000-000000000001"
TENANT_B = "20000000-0000-4000-8000-000000000002"


class VerificationFailure(RuntimeError):
    pass


def stable_uuid(label: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"lifeos:inv011:{label}"))


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def run_raw(
    command: list[str],
    *,
    check: bool = True,
    timeout: int = 180,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [str(RTK), "proxy", *command],
        cwd=REPO,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if check and completed.returncode != 0:
        raise VerificationFailure(
            f"command failed ({completed.returncode}): {' '.join(command)}\n"
            f"{completed.stdout}{completed.stderr}"
        )
    return completed


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationFailure(message)


def validate_database_name(database: str) -> None:
    if not DB_PATTERN.fullmatch(database):
        raise VerificationFailure(f"refusing unsafe disposable database name: {database}")


def psql(
    database: str,
    statement: str,
    *,
    role: str | None = None,
    tenant: str | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    prefix: list[str] = []
    if role:
        prefix.append(f"SET ROLE {role}")
    if tenant:
        prefix.append(f"SET lifeos.tenant_id = {sql_text(tenant)}")
    sql = "; ".join([*prefix, statement])
    if not sql.rstrip().endswith(";"):
        sql += ";"
    return run_raw(
        [
            "psql",
            "-h",
            str(SOCKET),
            "-d",
            database,
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            sql,
        ],
        check=check,
    )


def scalar(
    database: str,
    statement: str,
    *,
    role: str | None = None,
    tenant: str | None = None,
) -> str:
    result = psql(database, statement, role=role, tenant=tenant)
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if not lines:
        raise VerificationFailure(f"query returned no rows: {statement}")
    return lines[-1].strip()


def api(database: str, tenant: str, statement: str) -> str:
    return scalar(
        database,
        statement,
        role="lifeos_envctl",
        tenant=tenant,
    )


def expect_error(
    database: str,
    statement: str,
    expected: str,
    *,
    role: str | None = None,
    tenant: str | None = None,
) -> None:
    result = psql(
        database,
        statement,
        role=role,
        tenant=tenant,
        check=False,
    )
    combined = result.stdout + result.stderr
    assert_true(result.returncode != 0, f"expected query failure: {statement}")
    assert_true(
        expected.lower() in combined.lower(),
        f"failure did not contain {expected!r}:\n{combined}",
    )


def drop_database(database: str) -> None:
    validate_database_name(database)
    run_raw(
        ["dropdb", "--if-exists", "-h", str(SOCKET), database],
        timeout=60,
    )


def create_database(database: str) -> None:
    validate_database_name(database)
    drop_database(database)
    run_raw(
        [
            "createdb",
            "-h",
            str(SOCKET),
            "-O",
            "lifeos_migrator",
            database,
        ],
        timeout=60,
    )
    run_raw(
        [
            "psql",
            "-h",
            str(SOCKET),
            "-d",
            database,
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-v",
            "lifeos_runtime_role=lifeos_migrator",
            "-f",
            str(BOOTSTRAP),
        ]
    )


def apply_migration(database: str, version: int) -> None:
    matches = sorted(MIGRATIONS.glob(f"{version:04d}_*.sql"))
    assert_true(len(matches) == 1, f"expected one migration for version {version}")
    run_raw(
        [
            "psql",
            "-h",
            str(SOCKET),
            "-d",
            database,
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "SET ROLE lifeos_migrator",
            "-f",
            str(matches[0]),
        ]
    )


def setup_database(database: str, through: int) -> None:
    create_database(database)
    for version in range(1, through + 1):
        apply_migration(database, version)


def json_result(value: str) -> dict[str, Any]:
    parsed = json.loads(value)
    assert_true(isinstance(parsed, dict), "expected JSON object result")
    return parsed


def relation() -> str:
    return "'lifeos_runtime.projection'::regclass"


def key(value: str) -> str:
    return f"{sql_text(json.dumps({'projection_key': value}, separators=(',', ':')))}::jsonb"


def bytes_expr(value: dict[str, Any]) -> tuple[str, str]:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return (
        f"convert_to({sql_text(canonical)}, 'UTF8')",
        f"{sql_text(canonical)}::jsonb",
    )


def create_root(
    database: str,
    tenant: str,
    label: str,
    policy: dict[str, Any] | None = None,
) -> str:
    return api(
        database,
        tenant,
        "SELECT lifeos_runtime.create_root_branch_v2("
        f"{sql_text(tenant)}::uuid, 'proposal', {sql_text(label)}, "
        f"{sql_text(json.dumps(policy or {}, sort_keys=True))}::jsonb, "
        f"'{{}}'::jsonb, 'inv011-verifier', "
        f"{sql_text(stable_uuid(label + ':execution'))}::uuid, "
        f"{sql_text(stable_uuid(label + ':effect'))}::uuid, "
        f"{sql_text(label + ':create')})",
    )


def create_child(database: str, tenant: str, parent: str, label: str) -> str:
    return api(
        database,
        tenant,
        "SELECT lifeos_runtime.create_branch_v2("
        f"{sql_text(parent)}::uuid, 'proposal', {sql_text(label)}, "
        f"'{{}}'::jsonb, '{{}}'::jsonb, 'inv011-verifier', "
        f"{sql_text(stable_uuid(label + ':execution'))}::uuid, "
        f"{sql_text(stable_uuid(label + ':effect'))}::uuid, "
        f"{sql_text(label + ':create')})",
    )


def row_digest(database: str, tenant: str, branch: str, member: str) -> str:
    generation = scalar(
        database,
        f"SELECT head_generation FROM lifeos_runtime.branch "
        f"WHERE branch_id={sql_text(branch)}::uuid",
        role="lifeos_migrator",
        tenant=tenant,
    )
    return api(
        database,
        tenant,
        "SELECT encode(row_digest, 'hex') "
        "FROM lifeos_runtime.resolve_branch_record_v2("
        f"{sql_text(branch)}::uuid, {generation}::bigint, {relation()}, {key(member)}) "
        "WHERE state_exists",
    )


def append_overlay(
    database: str,
    tenant: str,
    branch: str,
    member: str,
    operation: str,
    label: str,
    value: dict[str, Any] | None = None,
    base_digest: str | None = None,
) -> dict[str, Any]:
    replacement_bytes = "NULL"
    replacement_json = "NULL"
    if value is not None:
        replacement_bytes, replacement_json = bytes_expr(value)
    base = "NULL" if base_digest is None else f"decode({sql_text(base_digest)}, 'hex')"
    return json_result(
        api(
            database,
            tenant,
            "SELECT lifeos_runtime.append_branch_overlay_v2("
            f"{sql_text(branch)}::uuid, {relation()}, {key(member)}, "
            f"{sql_text(operation)}, {base}, {replacement_bytes}, "
            f"{replacement_json}, "
            f"{sql_text(stable_uuid(label + ':execution'))}::uuid, "
            f"{sql_text(stable_uuid(label + ':effect'))}::uuid, "
            f"{sql_text(label)})",
        )
    )


def record_gates(database: str, tenant: str, branch: str, label: str) -> None:
    for gate in BASELINE_GATES:
        evidence = f"{label}:{gate}".encode().hex()
        api(
            database,
            tenant,
            "SELECT lifeos_runtime.record_merge_gate_v2("
            f"{sql_text(branch)}::uuid, {sql_text(gate)}, true, "
            f"decode({sql_text(evidence)}, 'hex'), "
            f"{sql_text(stable_uuid(label + ':' + gate + ':execution'))}::uuid, "
            f"{sql_text(stable_uuid(label + ':' + gate + ':effect'))}::uuid, "
            f"{sql_text(label + ':' + gate)})",
        )


def promote(
    database: str,
    tenant: str,
    pointer: str,
    branch: str,
    label: str,
) -> str:
    return api(
        database,
        tenant,
        "SELECT lifeos_runtime.promote_branch_v2("
        f"{sql_text(tenant)}::uuid, {sql_text(pointer)}, "
        f"{sql_text(branch)}::uuid, "
        f"{sql_text(stable_uuid(label + ':execution'))}::uuid, "
        f"{sql_text(stable_uuid(label + ':effect'))}::uuid, "
        f"{sql_text(label)})",
    )


def verify_witness_chain(database: str, tenant: str) -> None:
    invalid = scalar(
        database,
        """
        WITH ordered AS (
          SELECT witness.branch_id, witness.sequence,
                 witness.previous_shake256,
                 lag(witness.entry_shake256) OVER (
                   PARTITION BY witness.branch_id ORDER BY witness.sequence
                 ) AS expected_previous,
                 witness.entry_shake256,
                 preimage.raw_bytes
          FROM lifeos_agent.branch_witness witness
          JOIN lifeos_blob.object preimage
            ON preimage.id = witness.preimage_object_id
          WHERE witness.tenant_id = current_setting('lifeos.tenant_id')::uuid
        )
        SELECT count(*)
        FROM ordered
        WHERE entry_shake256
                <> extensions.ruvector_shake256_256(raw_bytes)
           OR previous_shake256
                <> coalesce(expected_previous, decode(repeat('00', 32), 'hex'))
        """,
        role="lifeos_migrator",
        tenant=tenant,
    )
    assert_true(invalid == "0", f"invalid witness chain rows: {invalid}")


def verify_fresh(database: str) -> dict[str, Any]:
    checks: list[str] = []
    initial = json_result(
        scalar(database, "SELECT lifeos_runtime.cow_branch_capability()")
    )
    assert_true(initial["ready"] is True, "fresh structural self-check is not ready")
    assert_true(
        initial["public_security_definer_count"] == 0,
        "unexpected PUBLIC security-definer function",
    )
    assert_true(initial["implemented"] is False, "existence-only gate did not fail closed")
    assert_true(initial["rvf_roundtrip"] is False, "native RVF must remain pending")
    checks.append("acceptance receipt fail-closed")

    canonical_bytes, canonical_json = bytes_expr({"value": "canonical"})
    canonical = json_result(
        api(
            database,
            TENANT_A,
            "SELECT lifeos_runtime.put_canonical_projection_v2("
            f"{sql_text(TENANT_A)}::uuid, {relation()}, {key('base')}, "
            f"'insert', NULL, {canonical_bytes}, {canonical_json}, "
            f"{sql_text(stable_uuid('canonical:execution'))}::uuid, "
            f"{sql_text(stable_uuid('canonical:effect'))}::uuid, "
            "'canonical:insert')",
        )
    )
    canonical_digest = canonical["row_digest"]
    root = create_root(database, TENANT_A, "root-main")
    resolved = api(
        database,
        TENANT_A,
        "SELECT source_kind || ':' || state_exists::text || ':' "
        "|| encode(row_digest, 'hex') "
        "FROM lifeos_runtime.resolve_branch_record_v2("
        f"{sql_text(root)}::uuid, 0, {relation()}, {key('base')})",
    )
    assert_true(
        resolved == f"canonical:true:{canonical_digest}",
        f"canonical fallback mismatch: {resolved}",
    )
    expect_error(
        database,
        "SELECT lifeos_runtime.resolve_branch_record_v2("
        f"{sql_text(root)}::uuid, 0, {relation()}, {key('base')})",
        "tenant isolation violation",
        role="lifeos_envctl",
        tenant=TENANT_B,
    )
    expect_error(
        database,
        "SELECT count(*) FROM lifeos_runtime.branch",
        "permission denied",
        role="lifeos_envctl",
        tenant=TENANT_A,
    )
    checks.extend(("canonical projection fallback", "FORCE RLS tenant isolation"))

    expect_error(
        database,
        "SELECT lifeos_runtime.append_branch_overlay_v2("
        f"{sql_text(root)}::uuid, {relation()}, {key('base')}, 'insert', "
        f"NULL, decode('00','hex'), '{{}}'::jsonb, "
        f"{sql_text(stable_uuid('bad-insert:execution'))}::uuid, "
        f"{sql_text(stable_uuid('bad-insert:effect'))}::uuid, 'bad-insert')",
        "absent key",
        role="lifeos_envctl",
        tenant=TENANT_A,
    )
    expect_error(
        database,
        "SELECT lifeos_runtime.append_branch_overlay_v2("
        f"{sql_text(root)}::uuid, {relation()}, {key('base')}, 'update', "
        f"decode(repeat('00',32),'hex'), decode('00','hex'), '{{}}'::jsonb, "
        f"{sql_text(stable_uuid('bad-update:execution'))}::uuid, "
        f"{sql_text(stable_uuid('bad-update:effect'))}::uuid, 'bad-update')",
        "base digest precondition failed",
        role="lifeos_envctl",
        tenant=TENANT_A,
    )
    update = append_overlay(
        database,
        TENANT_A,
        root,
        "base",
        "update",
        "base:update",
        {"value": "overlay"},
        canonical_digest,
    )
    replay = append_overlay(
        database,
        TENANT_A,
        root,
        "base",
        "update",
        "base:update",
        {"value": "overlay"},
        canonical_digest,
    )
    assert_true(update == replay, "exact idempotent replay changed its result")
    changed_bytes, changed_json = bytes_expr({"value": "collision"})
    expect_error(
        database,
        "SELECT lifeos_runtime.append_branch_overlay_v2("
        f"{sql_text(root)}::uuid, {relation()}, {key('base')}, 'update', "
        f"decode({sql_text(canonical_digest)},'hex'), {changed_bytes}, "
        f"{changed_json}, "
        f"{sql_text(stable_uuid('base:update:execution'))}::uuid, "
        f"{sql_text(stable_uuid('base:update:effect'))}::uuid, 'base:update')",
        "full-input idempotency collision",
        role="lifeos_envctl",
        tenant=TENANT_A,
    )
    overlay_digest = row_digest(database, TENANT_A, root, "base")
    append_overlay(
        database,
        TENANT_A,
        root,
        "base",
        "delete",
        "base:delete",
        base_digest=overlay_digest,
    )
    append_overlay(
        database,
        TENANT_A,
        root,
        "base",
        "insert",
        "base:reinsert",
        {"value": "reinserted"},
    )
    checks.extend(("full-input idempotency", "insert/update/delete preconditions"))

    def concurrent_append(index: int) -> dict[str, Any]:
        return append_overlay(
            database,
            TENANT_A,
            root,
            f"concurrent-{index}",
            "insert",
            f"concurrent:{index}",
            {"value": index},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        concurrent_results = list(pool.map(concurrent_append, (1, 2)))
    generations = sorted(result["generation"] for result in concurrent_results)
    assert_true(
        generations[1] == generations[0] + 1,
        f"concurrent heads were not serialized: {generations}",
    )
    verify_witness_chain(database, TENANT_A)
    expect_error(
        database,
        "UPDATE lifeos_agent.branch_witness SET entry_shake256=decode(repeat('ff',32),'hex')",
        "append-only",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    checks.extend(("serialized witness heads", "witness tamper rejection"))

    expect_error(
        database,
        "SELECT lifeos_runtime.promote_branch_v2("
        f"{sql_text(TENANT_A)}::uuid, 'active', {sql_text(root)}::uuid, "
        f"{sql_text(stable_uuid('premature:execution'))}::uuid, "
        f"{sql_text(stable_uuid('premature:effect'))}::uuid, 'premature')",
        "baseline and policy gates",
        role="lifeos_envctl",
        tenant=TENANT_A,
    )
    record_gates(database, TENANT_A, root, "root:gates:v1")
    first_promotion = promote(database, TENANT_A, "active", root, "root:promote:v1")
    active_digest = row_digest(database, TENANT_A, root, "concurrent-1")
    append_overlay(
        database,
        TENANT_A,
        root,
        "concurrent-1",
        "update",
        "root:after-promotion",
        {"value": "new-head"},
        active_digest,
    )
    expect_error(
        database,
        "SELECT lifeos_runtime.promote_branch_v2("
        f"{sql_text(TENANT_A)}::uuid, 'active', {sql_text(root)}::uuid, "
        f"{sql_text(stable_uuid('stale-gates:execution'))}::uuid, "
        f"{sql_text(stable_uuid('stale-gates:effect'))}::uuid, 'stale-gates')",
        "baseline and policy gates",
        role="lifeos_envctl",
        tenant=TENANT_A,
    )
    record_gates(database, TENANT_A, root, "root:gates:v2")
    second_promotion = promote(database, TENANT_A, "active", root, "root:promote:v2")
    assert_true(
        api(
            database,
            TENANT_A,
            "SELECT lifeos_runtime.compare_promotion_snapshot_v2("
            f"{sql_text(first_promotion)}::uuid)",
        )
        == "t",
        "first promotion snapshot does not reconstruct",
    )
    assert_true(
        api(
            database,
            TENANT_A,
            "SELECT lifeos_runtime.compare_promotion_snapshot_v2("
            f"{sql_text(second_promotion)}::uuid)",
        )
        == "t",
        "second promotion snapshot does not reconstruct",
    )
    other = create_root(database, TENANT_A, "root-other")
    record_gates(database, TENANT_A, other, "other:gates")
    other_promotion = promote(database, TENANT_A, "other", other, "other:promote")
    expect_error(
        database,
        "SELECT lifeos_runtime.rollback_branch_v2("
        f"{sql_text(TENANT_A)}::uuid, 'active', "
        f"{sql_text(other_promotion)}::uuid, "
        f"{sql_text(stable_uuid('unrelated:execution'))}::uuid, "
        f"{sql_text(stable_uuid('unrelated:effect'))}::uuid, 'unrelated')",
        "recursive promotion ancestry",
        role="lifeos_envctl",
        tenant=TENANT_A,
    )
    rollback = api(
        database,
        TENANT_A,
        "SELECT lifeos_runtime.rollback_branch_v2("
        f"{sql_text(TENANT_A)}::uuid, 'active', "
        f"{sql_text(first_promotion)}::uuid, "
        f"{sql_text(stable_uuid('rollback:execution'))}::uuid, "
        f"{sql_text(stable_uuid('rollback:effect'))}::uuid, 'rollback:v1')",
    )
    restored = api(
        database,
        TENANT_A,
        "SELECT promotion_id::text FROM lifeos_runtime.active_branch_snapshot_v2("
        f"{sql_text(TENANT_A)}::uuid, 'active')",
    )
    assert_true(restored == rollback, "active snapshot did not follow rollback event")
    forged = psql(
        database,
        "BEGIN; SET ROLE lifeos_migrator; "
        f"SET lifeos.tenant_id={sql_text(TENANT_A)}; "
        "UPDATE lifeos_blob.object object SET raw_bytes = "
        "decode(repeat('00', object.byte_length::integer), 'hex') "
        "FROM lifeos_runtime.promotion promotion "
        f"WHERE promotion.promotion_id={sql_text(first_promotion)}::uuid "
        "AND object.id=promotion.snapshot_object_id; "
        "SET ROLE lifeos_envctl; "
        "SELECT lifeos_runtime.compare_promotion_snapshot_v2("
        f"{sql_text(first_promotion)}::uuid); ROLLBACK",
    )
    assert_true(
        "f" in forged.stdout.splitlines(),
        "snapshot forgery was not detected by reconstruction",
    )
    checks.extend(
        (
            "baseline gates including empty policy",
            "snapshot reconstruction and forgery detection",
            "active recursive-ancestry rollback",
        )
    )

    serial_a = create_root(database, TENANT_A, "serial-a")
    serial_b = create_root(database, TENANT_A, "serial-b")
    record_gates(database, TENANT_A, serial_a, "serial-a:gates")
    record_gates(database, TENANT_A, serial_b, "serial-b:gates")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        serial_promotions = list(
            pool.map(
                lambda item: promote(
                    database,
                    TENANT_A,
                    "serialized-first",
                    item[0],
                    item[1],
                ),
                ((serial_a, "serial-a:promote"), (serial_b, "serial-b:promote")),
            )
        )
    serialized_shape = scalar(
        database,
        "SELECT count(*)::text || ':' || "
        "count(*) FILTER (WHERE previous_promotion_id IS NULL)::text "
        "FROM lifeos_runtime.promotion "
        "WHERE tenant_id=current_setting('lifeos.tenant_id')::uuid "
        "AND pointer_name='serialized-first'",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    assert_true(
        serialized_shape == "2:1",
        f"first promotion was not serialized: {serialized_shape} {serial_promotions}",
    )
    checks.append("serialized first promotion")

    merge_root = create_root(database, TENANT_A, "merge-root")
    merge_child = create_child(database, TENANT_A, merge_root, "merge-child")
    append_overlay(
        database,
        TENANT_A,
        merge_root,
        "merge-key",
        "insert",
        "merge-root:insert",
        {"owner": "root"},
    )
    append_overlay(
        database,
        TENANT_A,
        merge_child,
        "merge-key",
        "insert",
        "merge-child:insert",
        {"owner": "child"},
    )
    merge_execution = stable_uuid("merge:execution")
    merge_effect = stable_uuid("merge:effect")
    merge_sql = (
        "SELECT lifeos_runtime.merge_branch_v2("
        f"{sql_text(merge_child)}::uuid, {sql_text(merge_root)}::uuid, "
        f"{sql_text(merge_execution)}::uuid, {sql_text(merge_effect)}::uuid, "
        "'merge:request')"
    )
    conflicted = json_result(api(database, TENANT_A, merge_sql))
    assert_true(conflicted["merged"] is False, "colliding merge did not stop")
    assert_true(conflicted["conflict_count"] == 7, "not all conflict classes emitted")
    conflict_rows = scalar(
        database,
        "SELECT string_agg(conflict_kind, ',' ORDER BY conflict_ordinal) "
        "FROM lifeos_runtime.merge_conflict "
        f"WHERE request_id={sql_text(conflicted['request_id'])}::uuid",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    assert_true(
        tuple(conflict_rows.split(",")) == CONFLICT_CLASSES,
        f"conflict classes mismatch: {conflict_rows}",
    )
    conflict_ids = scalar(
        database,
        "SELECT string_agg(merge_conflict_id::text, ',' ORDER BY conflict_ordinal) "
        "FROM lifeos_runtime.merge_conflict "
        f"WHERE request_id={sql_text(conflicted['request_id'])}::uuid",
        role="lifeos_migrator",
        tenant=TENANT_A,
    ).split(",")
    resolution_bytes, resolution_json = bytes_expr({"owner": "resolved"})
    for index, conflict_id in enumerate(conflict_ids):
        api(
            database,
            TENANT_A,
            "SELECT lifeos_runtime.resolve_merge_conflict_v2("
            f"{sql_text(conflict_id)}::uuid, 'update', {resolution_bytes}, "
            f"{resolution_json}, "
            f"{sql_text(stable_uuid(f'resolution:{index}:execution'))}::uuid, "
            f"{sql_text(stable_uuid(f'resolution:{index}:effect'))}::uuid, "
            f"{sql_text(f'resolution:{index}')})",
        )
    merged = json_result(api(database, TENANT_A, merge_sql))
    assert_true(merged["merged"] is True, "resolved merge was not applied")
    assert_true(
        merged["applied_resolution_count"] == 7,
        "declared resolutions were not durably applied",
    )
    applied = scalar(
        database,
        "SELECT count(*) FROM lifeos_runtime.merge_conflict_application "
        f"WHERE request_id={sql_text(conflicted['request_id'])}::uuid",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    assert_true(applied == "7", f"resolution application rows mismatch: {applied}")
    merge_generation = scalar(
        database,
        "SELECT head_generation FROM lifeos_runtime.branch "
        f"WHERE branch_id={sql_text(merge_root)}::uuid",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    materialized_a = api(
        database,
        TENANT_A,
        "SELECT encode(lifeos_runtime.materialize_branch_v2("
        f"{sql_text(merge_root)}::uuid, {merge_generation}::bigint), 'hex')",
    )
    materialized_b = api(
        database,
        TENANT_A,
        "SELECT encode(lifeos_runtime.materialize_branch_v2("
        f"{sql_text(merge_root)}::uuid, {merge_generation}::bigint), 'hex')",
    )
    assert_true(materialized_a == materialized_b, "materialization is nondeterministic")
    checks.extend(("all conflict classes and applied resolutions", "deterministic materialization"))

    container_one = api(
        database,
        TENANT_A,
        "SELECT lifeos_rvf.mirror_branch_membership_v2("
        f"{sql_text(merge_root)}::uuid, NULL, decode('0102','hex'), "
        f"decode('0304','hex'), {sql_text(stable_uuid('rvf1:execution'))}::uuid, "
        f"{sql_text(stable_uuid('rvf1:effect'))}::uuid, 'rvf:one')",
    )
    vector_one = scalar(
        database,
        "SELECT vector_id FROM lifeos_rvf.membership "
        f"WHERE container_id={sql_text(container_one)}::uuid "
        f"AND member_key_digest=extensions.digest(convert_to({key('merge-key')}::text,'UTF8'),'sha256')",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    merge_digest = row_digest(database, TENANT_A, merge_root, "merge-key")
    append_overlay(
        database,
        TENANT_A,
        merge_root,
        "merge-key",
        "update",
        "rvf:replace",
        {"owner": "replacement"},
        merge_digest,
    )
    container_two = api(
        database,
        TENANT_A,
        "SELECT lifeos_rvf.mirror_branch_membership_v2("
        f"{sql_text(merge_root)}::uuid, {sql_text(container_one)}::uuid, "
        f"decode('0506','hex'), decode('0708','hex'), "
        f"{sql_text(stable_uuid('rvf2:execution'))}::uuid, "
        f"{sql_text(stable_uuid('rvf2:effect'))}::uuid, 'rvf:two')",
    )
    vector_two = scalar(
        database,
        "SELECT vector_id FROM lifeos_rvf.membership "
        f"WHERE container_id={sql_text(container_two)}::uuid "
        f"AND member_key_digest=extensions.digest(convert_to({key('merge-key')}::text,'UTF8'),'sha256')",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    replacement_digest = row_digest(database, TENANT_A, merge_root, "merge-key")
    append_overlay(
        database,
        TENANT_A,
        merge_root,
        "merge-key",
        "delete",
        "rvf:tombstone",
        base_digest=replacement_digest,
    )
    container_three = api(
        database,
        TENANT_A,
        "SELECT lifeos_rvf.mirror_branch_membership_v2("
        f"{sql_text(merge_root)}::uuid, {sql_text(container_two)}::uuid, "
        f"decode('090a','hex'), decode('0b0c','hex'), "
        f"{sql_text(stable_uuid('rvf3:execution'))}::uuid, "
        f"{sql_text(stable_uuid('rvf3:effect'))}::uuid, 'rvf:three')",
    )
    vector_three = scalar(
        database,
        "SELECT vector_id FROM lifeos_rvf.membership "
        f"WHERE container_id={sql_text(container_three)}::uuid "
        f"AND member_key_digest=extensions.digest(convert_to({key('merge-key')}::text,'UTF8'),'sha256') "
        "AND tombstone",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    assert_true(
        vector_one == vector_two == vector_three,
        f"RVF vector identity changed: {vector_one}, {vector_two}, {vector_three}",
    )
    expect_error(
        database,
        "BEGIN; SET ROLE lifeos_migrator; "
        f"SET lifeos.tenant_id={sql_text(TENANT_A)}; "
        "UPDATE lifeos_runtime.branch SET head_generation=4294967296 "
        f"WHERE branch_id={sql_text(merge_root)}::uuid; "
        "SET ROLE lifeos_envctl; "
        "SELECT lifeos_rvf.mirror_branch_membership_v2("
        f"{sql_text(merge_root)}::uuid, NULL, decode('00','hex'), "
        f"decode('00','hex'), {sql_text(stable_uuid('rvf-high:execution'))}::uuid, "
        f"{sql_text(stable_uuid('rvf-high:effect'))}::uuid, 'rvf:high')",
        "exceeds u32::MAX",
    )
    checks.extend(("stable tenant-scoped RVF vector identity", "RVF u32 generation bound"))

    provenance = scalar(
        database,
        "SELECT count(*) FILTER (WHERE execution_id IS NULL OR effect_id IS NULL) "
        "FROM lifeos_runtime.cow_request",
        role="lifeos_migrator",
        tenant=TENANT_A,
    )
    assert_true(provenance == "0", "execution/effect provenance contains NULLs")
    verify_witness_chain(database, TENANT_A)

    evidence = json.dumps(
        {"checks": sorted(checks), "status": "passed"},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    receipt = scalar(
        database,
        "SELECT lifeos_runtime.record_cow_acceptance_receipt_v2("
        "'database-semantics', 'lifeos.cow-db-semantic-suite.v1', true, "
        f"decode({sql_text(evidence.hex())}, 'hex'), "
        f"{sql_text(stable_uuid('receipt:execution'))}::uuid, "
        f"{sql_text(stable_uuid('receipt:effect'))}::uuid, 'database-suite-v1')",
        role="lifeos_envctl",
    )
    assert_true(bool(receipt), "database acceptance receipt was not recorded")
    final = json_result(
        scalar(database, "SELECT lifeos_runtime.cow_branch_capability()")
    )
    assert_true(final["implemented"] is True, "receipt did not open capability gate")
    assert_true(final["database_semantics_receipt"] is True, "receipt is invalid")
    assert_true(final["rvf_roundtrip"] is False, "native RVF was incorrectly accepted")
    expect_error(
        database,
        "UPDATE lifeos_runtime.cow_acceptance_receipt SET accepted=false",
        "append-only",
        role="lifeos_migrator",
    )
    checks.extend(("execution/effect provenance", "versioned acceptance receipt"))
    return {"checks": checks, "capability": final}


def verify_upgrade(database: str) -> dict[str, Any]:
    legacy_tenant = "30000000-0000-4000-8000-000000000003"
    legacy_branch = scalar(
        database,
        "SELECT lifeos_runtime.create_root_branch("
        f"{sql_text(legacy_tenant)}::uuid, 'legacy', 'upgrade preservation', "
        "'{}'::jsonb, '{}'::jsonb, 'upgrade-verifier', "
        "decode(repeat('ab',32),'hex'))",
        role="lifeos_migrator",
    )
    before = scalar(
        database,
        "SELECT count(*) FROM lifeos_agent.branch_witness "
        f"WHERE branch_id={sql_text(legacy_branch)}::uuid",
        role="lifeos_migrator",
    )
    assert_true(before == "1", "legacy seed witness missing")
    apply_migration(database, 7)
    apply_migration(database, 8)
    preserved = scalar(
        database,
        "SELECT branch.tenant_id::text || ':' || witness.tenant_id::text || ':' "
        "|| witness.preimage_version::text "
        "FROM lifeos_runtime.branch branch "
        "JOIN lifeos_agent.branch_witness witness USING (branch_id) "
        f"WHERE branch.branch_id={sql_text(legacy_branch)}::uuid",
        role="lifeos_migrator",
        tenant=legacy_tenant,
    )
    assert_true(
        preserved == f"{legacy_tenant}:{legacy_tenant}:0",
        f"non-empty upgrade did not preserve/fail-close legacy state: {preserved}",
    )
    report = json_result(
        scalar(database, "SELECT lifeos_runtime.cow_branch_capability()")
    )
    assert_true(report["legacy_witness_count"] == 1, "legacy witness was hidden")
    assert_true(report["ready"] is False, "legacy witness should require audit")
    assert_true(report["implemented"] is False, "non-empty upgrade did not fail closed")
    forced = scalar(
        database,
        "SELECT relforcerowsecurity FROM pg_class "
        "WHERE oid='lifeos_runtime.branch'::regclass",
    )
    assert_true(forced == "t", "upgrade did not FORCE RLS")
    return {
        "checks": [
            "upgrade-from-0006",
            "non-empty row preservation",
            "legacy witness fail-closed",
            "FORCE RLS upgrade",
        ],
        "capability": report,
    }


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect_live() -> dict[str, Any]:
    result: dict[str, Any] = {"database": "lifeos", "migrated": False, "accepted": False}
    version = psql(
        "lifeos",
        "SELECT coalesce(max(version),0) FROM lifeos_runtime._sqlx_migrations "
        "WHERE success",
        check=False,
    )
    if version.returncode != 0:
        return result
    result["last_migration_version"] = int(version.stdout.strip() or "0")
    result["migrated"] = result["last_migration_version"] >= 8
    if result["migrated"]:
        capability = psql(
            "lifeos",
            "SELECT lifeos_runtime.cow_branch_capability()",
            check=False,
        )
        if capability.returncode == 0 and capability.stdout.strip():
            parsed = json.loads(capability.stdout.strip().splitlines()[-1])
            result["capability"] = parsed
            result["accepted"] = bool(parsed.get("implemented"))
            result["rvf_roundtrip"] = bool(parsed.get("rvf_roundtrip"))
    return result


def main() -> int:
    migration_sha = sha256(MIGRATIONS / "0007_cow_truthful_semantics.sql")
    suffix = migration_sha[:8]
    fresh_db = f"lifeos_inv011_fresh_suite_{suffix}"
    upgrade_db = f"lifeos_inv011_upgrade_suite_{suffix}"
    validate_database_name(fresh_db)
    validate_database_name(upgrade_db)
    completed = False
    try:
        setup_database(fresh_db, 8)
        fresh = verify_fresh(fresh_db)
        setup_database(upgrade_db, 6)
        upgrade = verify_upgrade(upgrade_db)
        live = inspect_live()
        artifact = {
            "schema": "lifeos.cow-db-semantic-suite.v1",
            "task_id": "CAP-INV011-003_COW_DB_SEMANTICS",
            "status": "passed",
            "verified_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "migrations": {
                "0005_sha256": sha256(MIGRATIONS / "0005_cow_branch_runtime.sql"),
                "0006_sha256": sha256(MIGRATIONS / "0006_cow_capability_boundary.sql"),
                "0007_sha256": migration_sha,
                "0008_sha256": sha256(
                    MIGRATIONS / "0008_cow_least_privilege_closure.sql"
                ),
            },
            "fresh_bootstrap": fresh,
            "upgrade_from_0006": upgrade,
            "live": live,
            "native_rvf_receipt_pending": True,
        }
        ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
        ARTIFACT.write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
        completed = True
        print(json.dumps(artifact, sort_keys=True))
        return 0
    except (VerificationFailure, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        print(f"INV-011 COW verification failed: {error}", file=sys.stderr)
        return 1
    finally:
        if completed:
            drop_database(fresh_db)
            drop_database(upgrade_db)


if __name__ == "__main__":
    raise SystemExit(main())
