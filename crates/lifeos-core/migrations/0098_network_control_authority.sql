-- LifeOS migration 0098 — database-authorized network-control envelopes.
--
-- The canonical `lifeos_coord.network_plan` and `network_effect` relations
-- are append-only envelope tables created by the blueprint core DDL. These
-- procedures add the missing lease/policy boundary without introducing a
-- second mutable status store. Lifecycle and result status live in typed
-- payloads, while every physical request/effect retains its raw object.

CREATE OR REPLACE FUNCTION lifeos_coord.submit_network_plan(
  p_task_id uuid,
  p_lease_id uuid,
  p_branch_id uuid,
  p_operation text,
  p_request jsonb,
  p_rollback_request jsonb,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security, lifeos_coord
AS $function$
DECLARE
  binding lifeos_security.backend_binding;
  tenant uuid;
  raw_object uuid;
  plan_id uuid;
  payload jsonb;
BEGIN
  binding := lifeos_security.current_binding();
  tenant := lifeos_security.current_tenant();
  IF tenant IS NULL OR binding.lease_id IS DISTINCT FROM p_lease_id
     OR binding.binding_kind <> 'task' THEN
    RAISE EXCEPTION 'network plan requires the active task lease binding';
  END IF;
  IF p_operation <> 'netctl' OR btrim(p_idempotency_key) = ''
     OR jsonb_typeof(p_request) <> 'object'
     OR jsonb_typeof(p_request->'argv') <> 'array'
     OR jsonb_typeof(p_rollback_request) <> 'object'
     OR jsonb_typeof(p_rollback_request->'argv') <> 'array' THEN
    RAISE EXCEPTION 'network plan must be a netctl argv request with rollback argv';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM lifeos_security."grant" grant_row
    WHERE grant_row.grant_id = binding.grant_id
      AND grant_row.tenant_id = tenant
      AND grant_row.identity_id = binding.identity_id
      AND grant_row.revoked_at IS NULL
      AND grant_row.expires_at > statement_timestamp()
      AND grant_row.action_scope @> ARRAY['network:apply']::text[]
  ) THEN
    RAISE EXCEPTION 'active grant does not authorize network:apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_runtime.lease lease_row
    WHERE lease_row.lease_id = p_lease_id
      AND lease_row.tenant_id = tenant
      AND lease_row.task_id = p_task_id
      AND lease_row.holder_identity_id = binding.identity_id
      AND lease_row.revoked_at IS NULL
      AND lease_row.acknowledged_at IS NULL
      AND lease_row.expires_at > statement_timestamp()
  ) OR NOT EXISTS (
    SELECT 1 FROM lifeos_runtime.task task_row
    WHERE task_row.task_id = p_task_id
      AND task_row.tenant_id = tenant
      AND task_row.branch_id = p_branch_id
      AND task_row.state_code IN ('leased', 'running')
  ) THEN
    RAISE EXCEPTION 'network plan task, branch, or lease is not active';
  END IF;

  payload := jsonb_build_object(
    'schema_version', 'lifeos.network-plan.v1',
    'status', 'queued',
    'operation', p_operation,
    'task_id', p_task_id,
    'lease_id', p_lease_id,
    'branch_id', p_branch_id,
    'request', p_request,
    'rollback_request', p_rollback_request,
    'idempotency_key', p_idempotency_key
  );
  raw_object := lifeos_blob.store_generated_object(
    tenant, payload,
    jsonb_build_object('producer', 'lifeos_coord.submit_network_plan')
  );
  INSERT INTO lifeos_coord.network_plan (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    idempotency_key, source_execution_id, valid_time
  ) VALUES (
    tenant, p_branch_id, 'network-plan', raw_object, payload,
    p_idempotency_key, p_task_id, tstzrange(statement_timestamp(), NULL, '[)')
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING network_plan_id INTO plan_id;
  IF plan_id IS NULL THEN
    SELECT network_plan_id INTO STRICT plan_id
      FROM lifeos_coord.network_plan
     WHERE tenant_id = tenant AND idempotency_key = p_idempotency_key;
  END IF;
  RETURN plan_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_coord.start_network_plan(p_plan_id uuid)
RETURNS TABLE (plan_id uuid, tenant_id uuid, operation text, request jsonb,
               rollback_request jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security, lifeos_coord
AS $function$
DECLARE
  plan_row lifeos_coord.network_plan;
  binding lifeos_security.backend_binding;
  start_payload jsonb;
  raw_object uuid;
BEGIN
  binding := lifeos_security.current_binding();
  SELECT * INTO STRICT plan_row
    FROM lifeos_coord.network_plan
   WHERE network_plan_id = p_plan_id
     AND tenant_id = lifeos_security.current_tenant()
   FOR UPDATE;
  IF plan_row.record_kind <> 'network-plan'
     OR plan_row.tenant_id IS DISTINCT FROM lifeos_security.current_tenant()
     OR binding.lease_id IS DISTINCT FROM (plan_row.typed_payload->>'lease_id')::uuid
     OR NOT EXISTS (
       SELECT 1 FROM lifeos_runtime.lease lease_row
        WHERE lease_row.lease_id = binding.lease_id
          AND lease_row.revoked_at IS NULL
          AND lease_row.expires_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'network plan is not tenant-bound or lease-authorized';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_plan_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM lifeos_coord.network_effect
     WHERE tenant_id = plan_row.tenant_id
       AND typed_payload->>'plan_id' = p_plan_id::text
       AND record_kind = 'network-plan-start'
  ) THEN
    RETURN QUERY SELECT p_plan_id, plan_row.tenant_id,
      plan_row.typed_payload->>'operation',
      plan_row.typed_payload->'request', plan_row.typed_payload->'rollback_request';
    RETURN;
  END IF;
  start_payload := jsonb_build_object(
    'schema_version', 'lifeos.network-effect.v1',
    'status', 'running', 'plan_id', p_plan_id,
    'lease_id', binding.lease_id, 'started_at', statement_timestamp()
  );
  raw_object := lifeos_blob.store_generated_object(
    plan_row.tenant_id, start_payload,
    jsonb_build_object('producer', 'lifeos_coord.start_network_plan')
  );
  INSERT INTO lifeos_coord.network_effect (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    idempotency_key, source_execution_id, valid_time
  ) VALUES (
    plan_row.tenant_id, plan_row.branch_id, 'network-plan-start', raw_object,
    start_payload, p_plan_id::text || ':start', plan_row.source_execution_id,
    tstzrange(statement_timestamp(), NULL, '[)')
  );
  RETURN QUERY SELECT p_plan_id, plan_row.tenant_id,
    plan_row.typed_payload->>'operation',
    plan_row.typed_payload->'request', plan_row.typed_payload->'rollback_request';
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_coord.record_network_effect(
  p_plan_id uuid,
  p_status text,
  p_exit_code integer,
  p_effect jsonb,
  p_rollback_effect jsonb,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security, lifeos_coord
AS $function$
DECLARE
  plan_row lifeos_coord.network_plan;
  raw_object uuid;
  effect_id uuid;
  payload jsonb;
BEGIN
  SELECT * INTO STRICT plan_row
    FROM lifeos_coord.network_plan
   WHERE network_plan_id = p_plan_id
     AND tenant_id = lifeos_security.current_tenant();
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_coord.network_effect
     WHERE tenant_id = plan_row.tenant_id
       AND typed_payload->>'plan_id' = p_plan_id::text
       AND record_kind = 'network-plan-start'
  ) OR p_status NOT IN ('succeeded', 'failed', 'rolled_back')
    OR jsonb_typeof(p_effect) <> 'object'
    OR (p_rollback_effect IS NOT NULL AND jsonb_typeof(p_rollback_effect) <> 'object')
    OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'network effect does not match a started plan';
  END IF;
  SELECT network_effect_id INTO effect_id
    FROM lifeos_coord.network_effect
   WHERE tenant_id = plan_row.tenant_id
     AND idempotency_key = p_idempotency_key;
  IF effect_id IS NOT NULL THEN
    RETURN effect_id;
  END IF;
  payload := jsonb_build_object(
    'schema_version', 'lifeos.network-effect.v1',
    'status', p_status, 'plan_id', p_plan_id,
    'exit_code', p_exit_code, 'effect', p_effect,
    'rollback_effect', p_rollback_effect, 'completed_at', statement_timestamp()
  );
  raw_object := lifeos_blob.store_generated_object(
    plan_row.tenant_id, payload,
    jsonb_build_object('producer', 'lifeos_coord.record_network_effect')
  );
  INSERT INTO lifeos_coord.network_effect (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    idempotency_key, source_execution_id, valid_time
  ) VALUES (
    plan_row.tenant_id, plan_row.branch_id, 'network-plan-result', raw_object,
    payload, p_idempotency_key, plan_row.source_execution_id,
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING network_effect_id INTO effect_id;
  RETURN effect_id;
END
$function$;

GRANT EXECUTE ON FUNCTION lifeos_coord.submit_network_plan(uuid, uuid, uuid, text, jsonb, jsonb, text)
  TO lifeos_runtime, lifeos_envctl;
GRANT EXECUTE ON FUNCTION lifeos_coord.start_network_plan(uuid)
  TO lifeos_runtime, lifeos_envctl;
GRANT EXECUTE ON FUNCTION lifeos_coord.record_network_effect(uuid, text, integer, jsonb, jsonb, text)
  TO lifeos_runtime, lifeos_envctl;
