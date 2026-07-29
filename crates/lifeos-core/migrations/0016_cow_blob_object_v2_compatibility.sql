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
      ('lifeos_runtime.branch'),
      ('lifeos_runtime.branch_overlay'),
      ('lifeos_agent.branch_witness'),
      ('lifeos_runtime.merge_gate'),
      ('lifeos_runtime.merge_conflict'),
      ('lifeos_runtime.merge_conflict_resolution'),
      ('lifeos_runtime.merge_conflict_application'),
      ('lifeos_runtime.promotion'),
      ('lifeos_runtime.branch_pointer'),
      ('lifeos_runtime.cow_request'),
      ('lifeos_runtime.cow_request_result'),
      ('lifeos_runtime.canonical_projection'),
      ('lifeos_runtime.cow_acceptance_receipt'),
      ('lifeos_rvf.container'),
      ('lifeos_rvf.cow_map'),
      ('lifeos_rvf.membership'),
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
  WHERE relation.relforcerowsecurity
    AND namespace.nspname IN ('lifeos_runtime', 'lifeos_agent', 'lifeos_rvf')
    AND relation.relname IN (
      'branch', 'branch_overlay', 'branch_witness', 'merge_gate',
      'merge_conflict', 'merge_conflict_resolution',
      'merge_conflict_application', 'promotion', 'branch_pointer',
      'cow_request', 'cow_request_result', 'canonical_projection',
      'container', 'cow_map', 'membership', 'member_vector_identity',
      'branch_roundtrip_receipt'
    );

  SELECT count(*) INTO legacy_witness_count
  FROM lifeos_agent.branch_witness witness
  WHERE witness.preimage_version = 0;

  SELECT count(*) INTO invalid_witness_count
  FROM lifeos_agent.branch_witness witness
  JOIN lifeos_blob.object preimage
    ON preimage.object_id = witness.preimage_object_id
  WHERE witness.preimage_version = 1
    AND witness.entry_shake256 <> extensions.ruvector_shake256_256(
      lifeos_blob.load_object_bytes(preimage.object_id)
    );

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
