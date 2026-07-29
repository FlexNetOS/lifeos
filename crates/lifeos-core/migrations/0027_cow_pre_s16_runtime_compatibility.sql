-- Restore the INV-011 COW runtime after the §16 canonical-schema migration.
--
-- Migration 0011 preserved the checksum-pinned 0005-0010 COW relations as
-- *_pre_s16 because the §16 relations reuse several names with incompatible
-- UUID/object-envelope shapes. Migration 0017 then replaced SHAKE256 function
-- bodies from the live catalog, but left their qualified relation references
-- pointing at the new §16 tables. PostgreSQL validates PL/pgSQL bodies lazily,
-- so those definitions installed successfully and failed only when invoked.
--
-- The COW support tables still have foreign keys to the preserved relations
-- and lifeos_blob.object_pre_s16. Rebind only the exact COW v2 functions to
-- that coherent, data-preserving lineage. CREATE OR REPLACE retains owners,
-- grants, volatility, security-definer status, and the native RuVector
-- SHAKE256 executor installed by 0017.

DO $cow_pre_s16_runtime_compatibility$
DECLARE
  routine_signature TEXT;
  routine_oid OID;
  definition TEXT;
  rewritten TEXT;
BEGIN
  IF to_regclass('lifeos_blob.object_pre_s16') IS NULL
     OR to_regclass('lifeos_runtime.branch_pre_s16') IS NULL
     OR to_regclass('lifeos_runtime.branch_overlay_pre_s16') IS NULL
     OR to_regclass('lifeos_runtime.merge_gate_pre_s16') IS NULL
     OR to_regclass('lifeos_runtime.merge_conflict_pre_s16') IS NULL
     OR to_regclass('lifeos_runtime.promotion_pre_s16') IS NULL
     OR to_regclass('lifeos_rvf.container_pre_s16') IS NULL
     OR to_regclass('lifeos_rvf.cow_map_pre_s16') IS NULL
     OR to_regclass('lifeos_rvf.membership_pre_s16') IS NULL THEN
    RAISE EXCEPTION
      'COW pre-S16 preservation lineage is incomplete; refusing partial repair';
  END IF;

  FOREACH routine_signature IN ARRAY ARRAY[
    'lifeos_agent.append_branch_witness_v2(uuid,bigint,text,bigint,jsonb)',
    'lifeos_runtime.active_branch_snapshot_v2(uuid,text)',
    'lifeos_runtime.append_branch_overlay_internal_v2(uuid,regclass,jsonb,text,bytea,bytea,jsonb,uuid,uuid,uuid,bytea,boolean,text)',
    'lifeos_runtime.append_branch_overlay_v2(uuid,regclass,jsonb,text,bytea,bytea,jsonb,uuid,uuid,text)',
    'lifeos_runtime.begin_cow_request_v2(uuid,text,text,jsonb,uuid,uuid)',
    'lifeos_runtime.branch_gates_satisfied_v2(uuid)',
    'lifeos_runtime.compare_promotion_snapshot_v2(uuid)',
    'lifeos_runtime.cow_branch_capability()',
    'lifeos_runtime.create_branch_v2(uuid,text,text,jsonb,jsonb,text,uuid,uuid,text)',
    'lifeos_runtime.create_root_branch_v2(uuid,text,text,jsonb,jsonb,text,uuid,uuid,text)',
    'lifeos_runtime.materialize_branch_v2(uuid,bigint)',
    'lifeos_runtime.merge_branch_v2(uuid,uuid,uuid,uuid,text)',
    'lifeos_runtime.promote_branch_v2(uuid,text,uuid,uuid,uuid,text)',
    'lifeos_runtime.record_cow_acceptance_receipt_v2(text,text,boolean,bytea,uuid,uuid,text)',
    'lifeos_runtime.record_merge_gate_v2(uuid,text,boolean,bytea,uuid,uuid,text)',
    'lifeos_runtime.resolve_branch_record_v2(uuid,bigint,regclass,jsonb)',
    'lifeos_runtime.resolve_merge_conflict_v2(uuid,text,bytea,jsonb,uuid,uuid,text)',
    'lifeos_runtime.resolved_branch_members_v2(uuid,bigint)',
    'lifeos_runtime.rollback_branch_v2(uuid,text,uuid,uuid,uuid,text)',
    'lifeos_runtime.store_generated_object(bytea,text)',
    'lifeos_rvf.mirror_branch_membership_v2(uuid,uuid,bytea,bytea,uuid,uuid,text)'
  ]
  LOOP
    routine_oid := to_regprocedure(routine_signature);
    IF routine_oid IS NULL THEN
      RAISE EXCEPTION 'required COW routine is missing: %', routine_signature;
    END IF;

    SELECT pg_get_functiondef(routine_oid) INTO STRICT definition;
    rewritten := definition;
    rewritten := regexp_replace(
      rewritten, '\mlifeos_blob[.]object\M',
      'lifeos_blob.object_pre_s16', 'g'
    );
    rewritten := regexp_replace(
      rewritten, '\mlifeos_runtime[.]branch_overlay\M',
      'lifeos_runtime.branch_overlay_pre_s16', 'g'
    );
    rewritten := regexp_replace(
      rewritten, '\mlifeos_runtime[.]merge_conflict\M',
      'lifeos_runtime.merge_conflict_pre_s16', 'g'
    );
    rewritten := regexp_replace(
      rewritten, '\mlifeos_runtime[.]merge_gate\M',
      'lifeos_runtime.merge_gate_pre_s16', 'g'
    );
    rewritten := regexp_replace(
      rewritten, '\mlifeos_runtime[.]promotion\M',
      'lifeos_runtime.promotion_pre_s16', 'g'
    );
    rewritten := regexp_replace(
      rewritten, '\mlifeos_runtime[.]branch\M',
      'lifeos_runtime.branch_pre_s16', 'g'
    );
    rewritten := regexp_replace(
      rewritten, '\mlifeos_rvf[.]container\M',
      'lifeos_rvf.container_pre_s16', 'g'
    );
    rewritten := regexp_replace(
      rewritten, '\mlifeos_rvf[.]cow_map\M',
      'lifeos_rvf.cow_map_pre_s16', 'g'
    );
    rewritten := regexp_replace(
      rewritten, '\mlifeos_rvf[.]membership\M',
      'lifeos_rvf.membership_pre_s16', 'g'
    );

    IF rewritten = definition THEN
      RAISE EXCEPTION
        'COW routine had no incompatible relation binding: %',
        routine_signature;
    END IF;
    EXECUTE rewritten;
  END LOOP;
END
$cow_pre_s16_runtime_compatibility$;

-- Migration 0015 attached its UUID-only generic reference trigger to every
-- tenant table, including the preserved COW lineage. Those rows intentionally
-- retain bigint object identities and references to *_pre_s16 branch/RVF
-- tables, so the trigger either casts bigint values to UUID or checks the
-- wrong lineage. The COW tables already have structural foreign keys, FORCE
-- RLS, tenant WITH CHECK policies, and are writable by envctl only through
-- tenant-validating security-definer functions. Remove only the incompatible
-- generic trigger from this closed set.
DO $cow_pre_s16_reference_trigger_closure$
DECLARE
  target REGCLASS;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'lifeos_agent.branch_witness'::regclass,
    'lifeos_runtime.branch_pre_s16'::regclass,
    'lifeos_runtime.branch_overlay_pre_s16'::regclass,
    'lifeos_runtime.branch_pointer'::regclass,
    'lifeos_runtime.canonical_projection'::regclass,
    'lifeos_runtime.cow_request'::regclass,
    'lifeos_runtime.cow_request_result'::regclass,
    'lifeos_runtime.merge_conflict_application'::regclass,
    'lifeos_runtime.merge_conflict_pre_s16'::regclass,
    'lifeos_runtime.merge_conflict_resolution'::regclass,
    'lifeos_runtime.merge_gate_pre_s16'::regclass,
    'lifeos_runtime.promotion_pre_s16'::regclass,
    'lifeos_rvf.branch_roundtrip_receipt'::regclass,
    'lifeos_rvf.container_pre_s16'::regclass,
    'lifeos_rvf.cow_map_pre_s16'::regclass,
    'lifeos_rvf.member_vector_identity'::regclass,
    'lifeos_rvf.membership_pre_s16'::regclass
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS tenant_reference_guard ON %s',
      target
    );
  END LOOP;
END
$cow_pre_s16_reference_trigger_closure$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_semantic_self_check_v2_base()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent
AS $function$
DECLARE
  required_table_count INTEGER := 18;
  table_count INTEGER;
  required_function_count INTEGER := 21;
  function_count INTEGER;
  forced_rls_count INTEGER;
  legacy_witness_count BIGINT;
  invalid_witness_count BIGINT;
  invalid_chain_count BIGINT;
  old_envctl_execute_count INTEGER := 0;
BEGIN
  WITH required(name) AS (
    VALUES
      ('lifeos_runtime.branch_pre_s16'),
      ('lifeos_runtime.branch_overlay_pre_s16'),
      ('lifeos_agent.branch_witness'),
      ('lifeos_runtime.merge_gate_pre_s16'),
      ('lifeos_runtime.merge_conflict_pre_s16'),
      ('lifeos_runtime.merge_conflict_resolution'),
      ('lifeos_runtime.merge_conflict_application'),
      ('lifeos_runtime.promotion_pre_s16'),
      ('lifeos_runtime.branch_pointer'),
      ('lifeos_runtime.cow_request'),
      ('lifeos_runtime.cow_request_result'),
      ('lifeos_runtime.canonical_projection'),
      ('lifeos_runtime.cow_acceptance_receipt'),
      ('lifeos_rvf.container_pre_s16'),
      ('lifeos_rvf.cow_map_pre_s16'),
      ('lifeos_rvf.membership_pre_s16'),
      ('lifeos_rvf.member_vector_identity'),
      ('lifeos_rvf.branch_roundtrip_receipt')
  )
  SELECT count(*) INTO table_count
  FROM required
  WHERE to_regclass(name) IS NOT NULL;

  WITH required(name) AS (
    VALUES
      ('lifeos_runtime.current_tenant()'),
      ('lifeos_runtime.cow_preimage_v1(text,jsonb)'),
      ('lifeos_runtime.cow_digest_v1(text,jsonb)'),
      ('lifeos_agent.append_branch_witness_v2(uuid,bigint,text,bigint,jsonb)'),
      ('lifeos_runtime.put_canonical_projection_v2(uuid,regclass,jsonb,text,bytea,bytea,jsonb,uuid,uuid,text)'),
      ('lifeos_runtime.resolve_branch_record_v2(uuid,bigint,regclass,jsonb)'),
      ('lifeos_runtime.materialize_branch_v2(uuid,bigint)'),
      ('lifeos_runtime.create_root_branch_v2(uuid,text,text,jsonb,jsonb,text,uuid,uuid,text)'),
      ('lifeos_runtime.create_branch_v2(uuid,text,text,jsonb,jsonb,text,uuid,uuid,text)'),
      ('lifeos_runtime.append_branch_overlay_v2(uuid,regclass,jsonb,text,bytea,bytea,jsonb,uuid,uuid,text)'),
      ('lifeos_runtime.record_merge_gate_v2(uuid,text,boolean,bytea,uuid,uuid,text)'),
      ('lifeos_runtime.branch_gates_satisfied_v2(uuid)'),
      ('lifeos_runtime.resolve_merge_conflict_v2(uuid,text,bytea,jsonb,uuid,uuid,text)'),
      ('lifeos_runtime.merge_branch_v2(uuid,uuid,uuid,uuid,text)'),
      ('lifeos_runtime.promote_branch_v2(uuid,text,uuid,uuid,uuid,text)'),
      ('lifeos_runtime.rollback_branch_v2(uuid,text,uuid,uuid,uuid,text)'),
      ('lifeos_runtime.compare_promotion_snapshot_v2(uuid)'),
      ('lifeos_runtime.active_branch_snapshot_v2(uuid,text)'),
      ('lifeos_rvf.stable_vector_id_v2(uuid,regclass,bytea)'),
      ('lifeos_rvf.mirror_branch_membership_v2(uuid,uuid,bytea,bytea,uuid,uuid,text)'),
      ('lifeos_runtime.record_cow_acceptance_receipt_v2(text,text,boolean,bytea,uuid,uuid,text)')
  )
  SELECT count(*) INTO function_count
  FROM required
  WHERE to_regprocedure(name) IS NOT NULL;

  SELECT count(*) INTO forced_rls_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relrowsecurity
    AND relation.relforcerowsecurity
    AND (
      (namespace.nspname = 'lifeos_runtime'
       AND relation.relname IN (
         'branch_pre_s16', 'branch_overlay_pre_s16',
         'merge_gate_pre_s16', 'merge_conflict_pre_s16',
         'merge_conflict_resolution', 'merge_conflict_application',
         'promotion_pre_s16', 'branch_pointer', 'cow_request',
         'cow_request_result', 'canonical_projection'
       ))
      OR
      (namespace.nspname = 'lifeos_agent'
       AND relation.relname = 'branch_witness')
      OR
      (namespace.nspname = 'lifeos_rvf'
       AND relation.relname IN (
         'container_pre_s16', 'cow_map_pre_s16', 'membership_pre_s16',
         'member_vector_identity', 'branch_roundtrip_receipt'
       ))
    );

  SELECT count(*) INTO legacy_witness_count
  FROM lifeos_agent.branch_witness witness
  WHERE witness.preimage_version = 0;

  SELECT count(*) INTO invalid_witness_count
  FROM lifeos_agent.branch_witness witness
  JOIN lifeos_blob.object_pre_s16 preimage
    ON preimage.id = witness.preimage_object_id
  WHERE witness.preimage_version = 1
    AND witness.entry_shake256
      <> extensions.ruvector_shake256_256(preimage.raw_bytes);

  WITH ordered AS (
    SELECT
      witness.branch_id,
      witness.sequence,
      witness.previous_shake256,
      lag(witness.entry_shake256) OVER (
        PARTITION BY witness.branch_id ORDER BY witness.sequence
      ) AS expected_previous
    FROM lifeos_agent.branch_witness witness
    WHERE witness.preimage_version = 1
  )
  SELECT count(*) INTO invalid_chain_count
  FROM ordered
  WHERE previous_shake256 <> coalesce(
    expected_previous,
    decode(repeat('00', 32), 'hex')
  );

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_envctl') THEN
    SELECT count(*) INTO old_envctl_execute_count
    FROM (VALUES
      ('lifeos_runtime.create_root_branch(uuid,text,text,jsonb,jsonb,text,bytea)'),
      ('lifeos_runtime.create_branch(uuid,text,text,jsonb,jsonb,text,bytea)'),
      ('lifeos_runtime.append_branch_overlay(uuid,regclass,jsonb,text,bytea,bytea,jsonb,uuid,bytea)'),
      ('lifeos_runtime.record_merge_gate(uuid,text,boolean,bytea,bytea,text)'),
      ('lifeos_runtime.resolve_merge_conflict(uuid,bytea,bytea,text)'),
      ('lifeos_runtime.merge_branch(uuid,uuid,bytea,text)'),
      ('lifeos_runtime.promote_branch(uuid,text,uuid,bytea,bytea,text)'),
      ('lifeos_runtime.rollback_branch(uuid,text,uuid,bytea,text)'),
      ('lifeos_rvf.mirror_branch_membership(uuid,uuid,bytea,bytea,bytea)')
    ) legacy(name)
    WHERE has_function_privilege('lifeos_envctl', name, 'EXECUTE');
  END IF;

  RETURN jsonb_build_object(
    'forced_rls_count', forced_rls_count,
    'function_count', function_count,
    'invalid_witness_chain_count', invalid_chain_count,
    'invalid_witness_count', invalid_witness_count,
    'legacy_envctl_execute_count', old_envctl_execute_count,
    'legacy_witness_count', legacy_witness_count,
    'ready',
      table_count = required_table_count
      AND function_count = required_function_count
      AND forced_rls_count = 17
      AND legacy_witness_count = 0
      AND invalid_witness_count = 0
      AND invalid_chain_count = 0
      AND old_envctl_execute_count = 0,
    'required_function_count', required_function_count,
    'required_table_count', required_table_count,
    'table_count', table_count
  );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_semantic_self_check_v2()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime
AS $function$
DECLARE
  base_report JSONB;
  compatibility_forced_rls_count INTEGER;
  public_security_definer_count INTEGER;
BEGIN
  base_report := lifeos_runtime.cow_semantic_self_check_v2_base();

  SELECT count(*) INTO compatibility_forced_rls_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relrowsecurity
    AND relation.relforcerowsecurity
    AND (
      (namespace.nspname = 'lifeos_runtime'
       AND relation.relname IN (
         'branch_pre_s16', 'branch_overlay_pre_s16',
         'merge_gate_pre_s16', 'merge_conflict_pre_s16',
         'promotion_pre_s16'
       ))
      OR
      (namespace.nspname = 'lifeos_rvf'
       AND relation.relname IN (
         'container_pre_s16', 'cow_map_pre_s16', 'membership_pre_s16'
       ))
    );

  SELECT count(*) INTO public_security_definer_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE procedure.prosecdef
    AND namespace.nspname IN ('lifeos_runtime', 'lifeos_agent', 'lifeos_rvf')
    AND procedure.oid
      <> 'lifeos_runtime.cow_branch_capability()'::regprocedure
    AND (
      procedure.proacl IS NULL
      OR aclcontains(
        procedure.proacl,
        makeaclitem(0, procedure.proowner, 'EXECUTE', false)
      )
    );

  RETURN base_report || jsonb_build_object(
    'compatibility_forced_rls_count', compatibility_forced_rls_count,
    'compatibility_required_forced_rls_count', 8,
    'public_security_definer_count', public_security_definer_count,
    'ready',
      (base_report->>'ready')::boolean
      AND compatibility_forced_rls_count = 8
      AND public_security_definer_count = 0
  );
END
$function$;

REVOKE ALL ON FUNCTION lifeos_runtime.cow_semantic_self_check_v2()
  FROM PUBLIC;
