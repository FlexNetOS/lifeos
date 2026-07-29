-- LifeOS migration 0100 — repair the partial idempotency conflict target.
--
-- network_plan_idempotency_uidx is intentionally partial because the catalog
-- permits NULL idempotency keys. PostgreSQL therefore requires the predicate
-- on the ON CONFLICT target; without it, an authorized network submission
-- fails before the physical executor can run.

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
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING network_plan_id INTO plan_id;
  IF plan_id IS NULL THEN
    SELECT network_plan_id INTO STRICT plan_id
      FROM lifeos_coord.network_plan
     WHERE tenant_id = tenant AND idempotency_key = p_idempotency_key;
  END IF;
  RETURN plan_id;
END
$function$;
