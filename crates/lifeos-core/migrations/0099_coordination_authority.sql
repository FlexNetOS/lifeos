-- LifeOS migration 0099 — database-authorized weave/runner coordination.
--
-- weave and rusty-idd retain their native local redb/SQLite projections for
-- component operation. These procedures make PostgreSQL/RuVector the only
-- authority for dispatch, fencing, attempts, and receipts; the component
-- projections are consumers and return paths, never competing truth planes.

CREATE OR REPLACE FUNCTION lifeos_coord.require_coordination_lease(
  p_task_id uuid,
  p_lease_id uuid,
  p_branch_id uuid,
  p_action text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_runtime, lifeos_security, lifeos_coord
AS $function$
DECLARE
  binding lifeos_security.backend_binding;
  tenant uuid;
BEGIN
  binding := lifeos_security.current_binding();
  tenant := lifeos_security.current_tenant();
  IF tenant IS NULL OR binding.binding_kind <> 'task'
     OR binding.lease_id IS DISTINCT FROM p_lease_id THEN
    RAISE EXCEPTION 'coordination request requires the active task lease binding';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_security."grant" grant_row
    WHERE grant_row.grant_id = binding.grant_id
      AND grant_row.tenant_id = tenant
      AND grant_row.identity_id = binding.identity_id
      AND grant_row.revoked_at IS NULL
      AND grant_row.expires_at > statement_timestamp()
      AND grant_row.action_scope @> ARRAY[p_action]::text[]
  ) THEN
    RAISE EXCEPTION 'active grant does not authorize %', p_action;
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
    RAISE EXCEPTION 'coordination task, branch, or lease is not active';
  END IF;
  RETURN tenant;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_coord.submit_weave_job(
  p_task_id uuid,
  p_lease_id uuid,
  p_branch_id uuid,
  p_request jsonb,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security, lifeos_coord
AS $function$
DECLARE
  tenant uuid;
  payload jsonb;
  raw_object uuid;
  job_id uuid;
BEGIN
  tenant := lifeos_coord.require_coordination_lease(
    p_task_id, p_lease_id, p_branch_id, 'weave:dispatch');
  IF jsonb_typeof(p_request) <> 'object' OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'weave job requires an object request and idempotency key';
  END IF;
  payload := jsonb_build_object(
    'schema_version', 'lifeos.weave-job.v1', 'status', 'queued',
    'task_id', p_task_id, 'lease_id', p_lease_id, 'branch_id', p_branch_id,
    'request', p_request, 'idempotency_key', p_idempotency_key
  );
  raw_object := lifeos_blob.store_generated_object(
    tenant, payload,
    jsonb_build_object('producer', 'lifeos_coord.submit_weave_job')
  );
  INSERT INTO lifeos_coord.weave_job (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    idempotency_key, source_execution_id, valid_time
  ) VALUES (
    tenant, p_branch_id, 'weave-job', raw_object, payload, p_idempotency_key,
    p_task_id, tstzrange(statement_timestamp(), NULL, '[)')
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING weave_job_id INTO job_id;
  IF job_id IS NULL THEN
    SELECT weave_job_id INTO STRICT job_id
      FROM lifeos_coord.weave_job
     WHERE tenant_id = tenant AND idempotency_key = p_idempotency_key;
  END IF;
  RETURN job_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_coord.start_weave_job(p_job_id uuid)
RETURNS TABLE (job_id uuid, attempt_id uuid, request jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security, lifeos_coord
AS $function$
DECLARE
  job_row lifeos_coord.weave_job;
  binding lifeos_security.backend_binding;
  attempt uuid;
  payload jsonb;
  raw_object uuid;
BEGIN
  binding := lifeos_security.current_binding();
  SELECT * INTO STRICT job_row
    FROM lifeos_coord.weave_job
   WHERE weave_job_id = p_job_id
     AND tenant_id = lifeos_security.current_tenant()
   FOR UPDATE;
  IF job_row.record_kind <> 'weave-job'
     OR binding.lease_id IS DISTINCT FROM (job_row.typed_payload->>'lease_id')::uuid
     OR NOT EXISTS (
       SELECT 1 FROM lifeos_runtime.lease lease_row
        WHERE lease_row.lease_id = binding.lease_id
          AND lease_row.revoked_at IS NULL
          AND lease_row.expires_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'weave job is not lease-authorized';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::text, 0));
  SELECT (typed_payload->>'attempt_id')::uuid INTO attempt
    FROM lifeos_coord.weave_attempt
   WHERE tenant_id = job_row.tenant_id
     AND typed_payload->>'job_id' = p_job_id::text
     AND record_kind = 'weave-attempt-start'
   ORDER BY sequence DESC LIMIT 1;
  IF attempt IS NULL THEN
    attempt := extensions.gen_random_uuid();
    payload := jsonb_build_object(
      'schema_version', 'lifeos.weave-attempt.v1', 'status', 'running',
      'job_id', p_job_id, 'attempt_id', attempt,
      'lease_id', binding.lease_id, 'started_at', statement_timestamp()
    );
    raw_object := lifeos_blob.store_generated_object(
      job_row.tenant_id, payload,
      jsonb_build_object('producer', 'lifeos_coord.start_weave_job')
    );
    INSERT INTO lifeos_coord.weave_attempt (
      tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
      idempotency_key, source_execution_id, valid_time
    ) VALUES (
      job_row.tenant_id, job_row.branch_id, 'weave-attempt-start', raw_object,
      payload, p_job_id::text || ':attempt-start', job_row.source_execution_id,
      tstzrange(statement_timestamp(), NULL, '[)')
    );
  END IF;
  RETURN QUERY SELECT p_job_id, attempt, job_row.typed_payload->'request';
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_coord.record_weave_attempt(
  p_job_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_result jsonb,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security,
                  lifeos_coord
AS $function$
DECLARE
  job_row lifeos_coord.weave_job;
  payload jsonb;
  raw_object uuid;
  attempt_row uuid;
BEGIN
  SELECT * INTO STRICT job_row FROM lifeos_coord.weave_job
   WHERE weave_job_id = p_job_id AND tenant_id = lifeos_security.current_tenant();
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_coord.weave_attempt
     WHERE tenant_id = job_row.tenant_id
       AND typed_payload->>'job_id' = p_job_id::text
       AND typed_payload->>'attempt_id' = p_attempt_id::text
       AND record_kind = 'weave-attempt-start'
  ) OR p_status NOT IN ('succeeded', 'failed', 'cancelled')
    OR jsonb_typeof(p_result) <> 'object' OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'weave attempt is not fenced or result is invalid';
  END IF;
  SELECT weave_attempt_id INTO attempt_row FROM lifeos_coord.weave_attempt
   WHERE tenant_id = job_row.tenant_id AND idempotency_key = p_idempotency_key;
  IF attempt_row IS NOT NULL THEN RETURN attempt_row; END IF;
  payload := jsonb_build_object(
    'schema_version', 'lifeos.weave-attempt.v1', 'status', p_status,
    'job_id', p_job_id, 'attempt_id', p_attempt_id, 'result', p_result,
    'completed_at', statement_timestamp()
  );
  raw_object := lifeos_blob.store_generated_object(
    job_row.tenant_id, payload,
    jsonb_build_object('producer', 'lifeos_coord.record_weave_attempt')
  );
  INSERT INTO lifeos_coord.weave_attempt (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    idempotency_key, source_execution_id, valid_time
  ) VALUES (
    job_row.tenant_id, job_row.branch_id, 'weave-attempt-result', raw_object,
    payload, p_idempotency_key, job_row.source_execution_id,
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING weave_attempt_id INTO attempt_row;
  RETURN attempt_row;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_coord.submit_runner_job(
  p_task_id uuid,
  p_lease_id uuid,
  p_branch_id uuid,
  p_request jsonb,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security, lifeos_coord
AS $function$
DECLARE
  tenant uuid;
  payload jsonb;
  raw_object uuid;
  job_id uuid;
BEGIN
  tenant := lifeos_coord.require_coordination_lease(
    p_task_id, p_lease_id, p_branch_id, 'runner:execute');
  IF jsonb_typeof(p_request) <> 'object' OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'runner job requires an object request and idempotency key';
  END IF;
  payload := jsonb_build_object(
    'schema_version', 'lifeos.runner-job.v1', 'status', 'queued',
    'task_id', p_task_id, 'lease_id', p_lease_id, 'branch_id', p_branch_id,
    'request', p_request, 'idempotency_key', p_idempotency_key
  );
  raw_object := lifeos_blob.store_generated_object(
    tenant, payload,
    jsonb_build_object('producer', 'lifeos_coord.submit_runner_job')
  );
  INSERT INTO lifeos_coord.runner_job (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    idempotency_key, source_execution_id, valid_time
  ) VALUES (
    tenant, p_branch_id, 'runner-job', raw_object, payload, p_idempotency_key,
    p_task_id, tstzrange(statement_timestamp(), NULL, '[)')
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING runner_job_id INTO job_id;
  IF job_id IS NULL THEN
    SELECT runner_job_id INTO STRICT job_id FROM lifeos_coord.runner_job
     WHERE tenant_id = tenant AND idempotency_key = p_idempotency_key;
  END IF;
  RETURN job_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_coord.start_runner_job(p_job_id uuid)
RETURNS TABLE (job_id uuid, request jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security, lifeos_coord
AS $function$
DECLARE
  job_row lifeos_coord.runner_job;
  binding lifeos_security.backend_binding;
  payload jsonb;
  raw_object uuid;
BEGIN
  binding := lifeos_security.current_binding();
  SELECT * INTO STRICT job_row FROM lifeos_coord.runner_job
   WHERE runner_job_id = p_job_id AND tenant_id = lifeos_security.current_tenant()
   FOR UPDATE;
  IF binding.lease_id IS DISTINCT FROM (job_row.typed_payload->>'lease_id')::uuid
     OR NOT EXISTS (
       SELECT 1 FROM lifeos_runtime.lease lease_row
        WHERE lease_row.lease_id = binding.lease_id
          AND lease_row.revoked_at IS NULL
          AND lease_row.expires_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'runner job is not lease-authorized';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_coord.runner_receipt
     WHERE tenant_id = job_row.tenant_id
       AND typed_payload->>'job_id' = p_job_id::text
       AND record_kind = 'runner-job-start'
  ) THEN
    payload := jsonb_build_object(
      'schema_version', 'lifeos.runner-receipt.v1', 'status', 'running',
      'job_id', p_job_id, 'lease_id', binding.lease_id,
      'started_at', statement_timestamp()
    );
    raw_object := lifeos_blob.store_generated_object(
      job_row.tenant_id, payload,
      jsonb_build_object('producer', 'lifeos_coord.start_runner_job')
    );
    INSERT INTO lifeos_coord.runner_receipt (
      tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
      idempotency_key, source_execution_id, valid_time
    ) VALUES (
      job_row.tenant_id, job_row.branch_id, 'runner-job-start', raw_object,
      payload, p_job_id::text || ':runner-start', job_row.source_execution_id,
      tstzrange(statement_timestamp(), NULL, '[)')
    );
  END IF;
  RETURN QUERY SELECT p_job_id, job_row.typed_payload->'request';
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_coord.record_runner_receipt(
  p_job_id uuid,
  p_status text,
  p_result jsonb,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security,
                  lifeos_coord
AS $function$
DECLARE
  job_row lifeos_coord.runner_job;
  payload jsonb;
  raw_object uuid;
  receipt_id uuid;
BEGIN
  SELECT * INTO STRICT job_row FROM lifeos_coord.runner_job
   WHERE runner_job_id = p_job_id AND tenant_id = lifeos_security.current_tenant();
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_coord.runner_receipt
     WHERE tenant_id = job_row.tenant_id
       AND typed_payload->>'job_id' = p_job_id::text
       AND record_kind = 'runner-job-start'
  ) OR p_status NOT IN ('succeeded', 'failed', 'cancelled')
    OR jsonb_typeof(p_result) <> 'object' OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'runner receipt is not fenced or result is invalid';
  END IF;
  SELECT runner_receipt_id INTO receipt_id FROM lifeos_coord.runner_receipt
   WHERE tenant_id = job_row.tenant_id AND idempotency_key = p_idempotency_key;
  IF receipt_id IS NOT NULL THEN RETURN receipt_id; END IF;
  payload := jsonb_build_object(
    'schema_version', 'lifeos.runner-receipt.v1', 'status', p_status,
    'job_id', p_job_id, 'result', p_result, 'completed_at', statement_timestamp()
  );
  raw_object := lifeos_blob.store_generated_object(
    job_row.tenant_id, payload,
    jsonb_build_object('producer', 'lifeos_coord.record_runner_receipt')
  );
  INSERT INTO lifeos_coord.runner_receipt (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    idempotency_key, source_execution_id, valid_time
  ) VALUES (
    job_row.tenant_id, job_row.branch_id, 'runner-job-result', raw_object,
    payload, p_idempotency_key, job_row.source_execution_id,
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING runner_receipt_id INTO receipt_id;
  RETURN receipt_id;
END
$function$;

GRANT EXECUTE ON FUNCTION lifeos_coord.require_coordination_lease(uuid, uuid, uuid, text)
  TO lifeos_runtime, lifeos_envctl;
GRANT EXECUTE ON FUNCTION lifeos_coord.submit_weave_job(uuid, uuid, uuid, jsonb, text)
  TO lifeos_runtime, lifeos_envctl;
GRANT EXECUTE ON FUNCTION lifeos_coord.start_weave_job(uuid)
  TO lifeos_runtime, lifeos_envctl;
GRANT EXECUTE ON FUNCTION lifeos_coord.record_weave_attempt(uuid, uuid, text, jsonb, text)
  TO lifeos_runtime, lifeos_envctl;
GRANT EXECUTE ON FUNCTION lifeos_coord.submit_runner_job(uuid, uuid, uuid, jsonb, text)
  TO lifeos_runtime, lifeos_envctl;
GRANT EXECUTE ON FUNCTION lifeos_coord.start_runner_job(uuid)
  TO lifeos_runtime, lifeos_envctl;
GRANT EXECUTE ON FUNCTION lifeos_coord.record_runner_receipt(uuid, text, jsonb, text)
  TO lifeos_runtime, lifeos_envctl;
