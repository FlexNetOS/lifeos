-- LifeOS migration 0054 — bind the current S16 branch front door to the
-- accepted, receipt-gated COW v2 lineage.
--
-- S16 owns the public branch identity and tenant boundary.  The earlier COW
-- relations are preserved as *_pre_s16 because their bigint object envelopes
-- are incompatible with the S16 UUID blob catalog.  This bridge makes that
-- compatibility explicit and durable instead of leaving callers to guess
-- which branch lineage they are addressing.

CREATE TABLE IF NOT EXISTS lifeos_runtime.cow_frontdoor_binding (
  current_branch_id uuid PRIMARY KEY REFERENCES lifeos_runtime.branch(branch_id),
  tenant_id uuid NOT NULL,
  cow_branch_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE lifeos_runtime.cow_frontdoor_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_runtime.cow_frontdoor_binding FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cow_frontdoor_binding_tenant_isolation
  ON lifeos_runtime.cow_frontdoor_binding;
CREATE POLICY cow_frontdoor_binding_tenant_isolation
  ON lifeos_runtime.cow_frontdoor_binding
  USING (tenant_id = lifeos_security.current_tenant())
  WITH CHECK (tenant_id = lifeos_security.current_tenant());

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_frontdoor_branch_v2(
  target_branch uuid,
  target_execution uuid,
  target_effect uuid,
  target_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_security
AS $function$
DECLARE
  current_row lifeos_runtime.branch%ROWTYPE;
  bound_branch uuid;
  root_key text;
BEGIN
  IF to_regclass('lifeos_runtime.branch_pre_s16') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM lifeos_runtime.branch_pre_s16
       WHERE branch_id = target_branch
     ) THEN
    RETURN target_branch;
  END IF;

  SELECT * INTO STRICT current_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  PERFORM lifeos_runtime.require_tenant(current_row.tenant_id);

  SELECT cow_branch_id INTO bound_branch
  FROM lifeos_runtime.cow_frontdoor_binding
  WHERE current_branch_id = target_branch
    AND tenant_id = current_row.tenant_id;
  IF bound_branch IS NOT NULL THEN
    RETURN bound_branch;
  END IF;

  root_key := 'cow-frontdoor-root:' || target_branch::text;
  bound_branch := lifeos_runtime.create_root_branch_v2(
    current_row.tenant_id,
    'bootstrap',
    root_key,
    current_row.policy,
    jsonb_build_object(
      'frontdoor_branch_id', target_branch,
      'frontdoor_generation', current_row.head_generation,
      'frontdoor_raw_object_id', current_row.raw_object_id
    ),
    'lifeos-s16-frontdoor',
    target_execution,
    target_effect,
    target_idempotency_key || ':root'
  );

  INSERT INTO lifeos_runtime.cow_frontdoor_binding (
    current_branch_id, tenant_id, cow_branch_id
  ) VALUES (
    target_branch, current_row.tenant_id, bound_branch
  ) ON CONFLICT (current_branch_id) DO UPDATE
    SET cow_branch_id = EXCLUDED.cow_branch_id;
  RETURN bound_branch;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_frontdoor_create_v2(
  parent_branch uuid,
  branch_kind text,
  branch_purpose text,
  branch_policy jsonb,
  creator uuid,
  target_execution uuid,
  target_effect uuid,
  target_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_security
AS $function$
DECLARE
  parent_cow uuid;
BEGIN
  parent_cow := lifeos_runtime.cow_frontdoor_branch_v2(
    parent_branch, target_execution, target_effect,
    target_idempotency_key
  );
  RETURN lifeos_runtime.create_branch_v2(
    parent_cow, branch_kind, branch_purpose, branch_policy,
    jsonb_build_object('creator', creator, 'frontdoor_parent', parent_branch),
    'lifeos-s16-frontdoor', target_execution, target_effect,
    target_idempotency_key
  );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_frontdoor_merge_v2(
  source_branch uuid,
  target_branch uuid,
  merge_record jsonb,
  target_execution uuid,
  target_effect uuid,
  target_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_security
AS $function$
DECLARE
  source_cow uuid;
  target_cow uuid;
  result jsonb;
BEGIN
  source_cow := lifeos_runtime.cow_frontdoor_branch_v2(
    source_branch, target_execution, target_effect,
    target_idempotency_key || ':source'
  );
  target_cow := lifeos_runtime.cow_frontdoor_branch_v2(
    target_branch, target_execution, target_effect,
    target_idempotency_key || ':target'
  );
  result := lifeos_runtime.merge_branch_v2(
    source_cow, target_cow, target_execution, target_effect,
    target_idempotency_key
  );
  RETURN (result->>'promotion_id')::uuid;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_frontdoor_promote_v2(
  source_branch uuid,
  target_branch uuid,
  promotion_record jsonb,
  target_execution uuid,
  target_effect uuid,
  target_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_security
AS $function$
DECLARE
  source_cow uuid;
  target_cow uuid;
  pointer_name text := coalesce(
    nullif(promotion_record->>'pointer_name', ''), 'lifeos-default'
  );
  tenant uuid := lifeos_security.current_tenant();
BEGIN
  source_cow := lifeos_runtime.cow_frontdoor_branch_v2(
    source_branch, target_execution, target_effect,
    target_idempotency_key || ':source'
  );
  target_cow := lifeos_runtime.cow_frontdoor_branch_v2(
    target_branch, target_execution, target_effect,
    target_idempotency_key || ':target'
  );
  IF source_cow <> target_cow
     AND NOT EXISTS (
       SELECT 1 FROM lifeos_runtime.branch_pre_s16
       WHERE branch_id = source_cow AND parent_branch_id = target_cow
     ) THEN
    RAISE EXCEPTION 'promotion source is not a proposal of the target branch';
  END IF;
  RETURN lifeos_runtime.promote_branch_v2(
    tenant, pointer_name, source_cow, target_execution, target_effect,
    target_idempotency_key
  );
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.cow_frontdoor_binding_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_security
AS $function$
  SELECT jsonb_build_object(
    'current_branch_count', count(*),
    'bound_branch_count', count(*) FILTER (WHERE binding.cow_branch_id IS NOT NULL),
    'pre_s16_lineage_available', to_regclass('lifeos_runtime.branch_pre_s16') IS NOT NULL,
    'tenant', lifeos_security.current_tenant()
  )
  FROM lifeos_runtime.branch current_branch
  LEFT JOIN lifeos_runtime.cow_frontdoor_binding binding
    ON binding.current_branch_id = current_branch.branch_id
   AND binding.tenant_id = current_branch.tenant_id
  WHERE current_branch.tenant_id = lifeos_security.current_tenant()
$function$;

DO $grant_cow_frontdoor$
DECLARE
  routine_signature text;
BEGIN
  FOREACH routine_signature IN ARRAY ARRAY[
    'lifeos_runtime.cow_frontdoor_branch_v2(uuid,uuid,uuid,text)',
    'lifeos_runtime.cow_frontdoor_create_v2(uuid,text,text,jsonb,uuid,uuid,uuid,text)',
    'lifeos_runtime.cow_frontdoor_merge_v2(uuid,uuid,jsonb,uuid,uuid,text)',
    'lifeos_runtime.cow_frontdoor_promote_v2(uuid,uuid,jsonb,uuid,uuid,text)',
    'lifeos_runtime.cow_frontdoor_binding_report()'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO lifeos_envctl', routine_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', routine_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lifeos_runtime, lifeos_envctl', routine_signature);
  END LOOP;
END
$grant_cow_frontdoor$;

GRANT SELECT ON lifeos_runtime.cow_frontdoor_binding
  TO lifeos_runtime, lifeos_envctl;
