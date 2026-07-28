-- LifeOS migration 0014 — blueprint §16.3 task, coordination, and secret procedures (SQL block 4+5 of 6, verbatim after role preamble).
-- Packaging preamble only: restore the migrator session state the original
-- single-session §16 stream carried into this block.
SET ROLE lifeos_migrator;

CREATE OR REPLACE FUNCTION lifeos_runtime.claim_task(
  worker uuid,
  capabilities jsonb,
  lease_interval interval
) RETURNS TABLE (
  leased_task_id uuid,
  leased_lease_id uuid,
  leased_payload_object_id uuid,
  leased_branch_id uuid,
  leased_capability_token bytea
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  selected_task lifeos_runtime.task%ROWTYPE;
  lease_object uuid;
  lease_payload jsonb;
BEGIN
  IF lease_interval <= interval '0 seconds' THEN
    RAISE EXCEPTION 'lease interval must be positive';
  END IF;
  IF lease_interval > interval '1 hour' OR NOT EXISTS (
    SELECT 1 FROM lifeos_security.current_binding() binding
    WHERE binding.identity_id = worker
      AND binding.tenant_id = lifeos_security.current_tenant()
      AND binding.expires_at > statement_timestamp()
  ) THEN
    RAISE EXCEPTION 'task claim worker is not the active bound identity';
  END IF;
  SELECT task_row.* INTO selected_task
  FROM lifeos_runtime.task task_row
  WHERE task_row.tenant_id = lifeos_security.current_tenant()
    AND task_row.state_code = 'queued'
    AND task_row.available_at <= statement_timestamp()
    AND capabilities @> task_row.capability_requirements
    AND NOT EXISTS (
      SELECT 1
      FROM lifeos_runtime.task_dependency dependency
      JOIN lifeos_runtime.task prerequisite
        ON prerequisite.task_id = dependency.depends_on_task_id
      WHERE dependency.task_id = task_row.task_id
        AND prerequisite.state_code <> 'completed'
    )
  ORDER BY task_row.priority DESC, task_row.available_at, task_row.created_at
  FOR UPDATE OF task_row SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;
  leased_capability_token := extensions.gen_random_bytes(32);
  lease_payload := jsonb_build_object(
    'task_id', selected_task.task_id,
    'worker', worker,
    'issued_at', statement_timestamp(),
    'expires_at', statement_timestamp() + lease_interval,
    'capabilities', capabilities,
    'capability_token_sha256',
      encode(extensions.digest(leased_capability_token,'sha256'),'hex')
  );
  lease_object := lifeos_blob.store_generated_object(
    selected_task.tenant_id, lease_payload,
    jsonb_build_object('producer', 'lifeos_runtime.claim_task')
  );
  INSERT INTO lifeos_runtime.lease (
    tenant_id, task_id, holder_identity_id, capability_token_hash,
    raw_object_id, expires_at
  ) VALUES (
    selected_task.tenant_id, selected_task.task_id, worker,
    extensions.digest(leased_capability_token, 'sha256'),
    lease_object, statement_timestamp() + lease_interval
  ) RETURNING lease_id INTO leased_lease_id;
  UPDATE lifeos_runtime.task SET state_code = 'leased'
  WHERE task_id = selected_task.task_id;

  leased_task_id := selected_task.task_id;
  leased_payload_object_id := selected_task.payload_object_id;
  leased_branch_id := selected_task.branch_id;
  RETURN NEXT;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.complete_execution(
  p_execution_id uuid,
  result_objects jsonb,
  effects jsonb,
  witness jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent, lifeos_security
AS $function$
DECLARE
  execution_row lifeos_runtime.execution%ROWTYPE;
  task_row lifeos_runtime.task%ROWTYPE;
  lease_row lifeos_runtime.lease%ROWTYPE;
  item record;
  object_id uuid;
  typed_object_id uuid;
  request_object_id uuid;
  response_object_id uuid;
  acknowledgement_object_id uuid;
  rollback_object_id uuid;
  completion_object uuid;
  completion_payload jsonb;
  completed_witness uuid;
  completed_witness_sequence bigint;
  witness_chain uuid := nullif(witness->>'chain_id','')::uuid;
BEGIN
  SELECT * INTO STRICT execution_row
  FROM lifeos_runtime.execution
  WHERE lifeos_runtime.execution.execution_id = p_execution_id
  FOR UPDATE;
  SELECT * INTO STRICT task_row FROM lifeos_runtime.task
  WHERE task_id = execution_row.task_id FOR UPDATE;
  SELECT * INTO STRICT lease_row FROM lifeos_runtime.lease
  WHERE lease_id = execution_row.lease_id FOR UPDATE;

  IF execution_row.tenant_id IS DISTINCT FROM lifeos_security.current_tenant()
     OR execution_row.state_code <> 'running'
     OR task_row.tenant_id <> execution_row.tenant_id
     OR task_row.branch_id <> execution_row.branch_id
     OR task_row.state_code NOT IN ('leased','running')
     OR lease_row.tenant_id <> execution_row.tenant_id
     OR lease_row.task_id <> execution_row.task_id
     OR lease_row.holder_identity_id <> execution_row.runner_identity_id
     OR lease_row.revoked_at IS NOT NULL
     OR lease_row.acknowledged_at IS NOT NULL
     OR lease_row.expires_at <= statement_timestamp()
     OR nullif(witness->>'signer_identity','')::uuid
          IS DISTINCT FROM execution_row.runner_identity_id
     OR NOT EXISTS (
       SELECT 1
       FROM lifeos_security.current_binding() binding
       JOIN lifeos_security."grant" grant_row
         ON grant_row.grant_id = binding.grant_id
        AND grant_row.tenant_id = binding.tenant_id
        AND grant_row.identity_id = binding.identity_id
        AND grant_row.lease_id = binding.lease_id
        AND grant_row.revoked_at IS NULL
        AND grant_row.expires_at > statement_timestamp()
       WHERE binding.binding_kind = 'task'
         AND binding.tenant_id = execution_row.tenant_id
         AND binding.identity_id = execution_row.runner_identity_id
         AND binding.lease_id = execution_row.lease_id
         AND binding.expires_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'execution, runner binding, or lease is not active in the bound tenant';
  END IF;
  IF jsonb_typeof(coalesce(result_objects, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(result_objects, '[]'::jsonb)) = 0
     OR jsonb_typeof(coalesce(effects, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'at least one complete result object is required';
  END IF;
  IF witness_chain IS NULL OR NOT EXISTS (
    SELECT 1 FROM lifeos_agent.witness_chain chain_row
    WHERE chain_row.chain_id = witness_chain
      AND chain_row.tenant_id = execution_row.tenant_id
      AND chain_row.branch_id = execution_row.branch_id
  ) OR (task_row.witness_chain_id IS NOT NULL
        AND task_row.witness_chain_id <> witness_chain) THEN
    RAISE EXCEPTION 'completion witness chain is outside the task branch';
  END IF;

  FOR item IN
    SELECT value, ordinality
    FROM jsonb_array_elements(result_objects) WITH ORDINALITY
  LOOP
    object_id := (item.value->>'raw_object_id')::uuid;
    typed_object_id := nullif(item.value->>'typed_object_id','')::uuid;
    IF NOT lifeos_blob.verify_object(object_id)
       OR (typed_object_id IS NOT NULL
           AND NOT lifeos_blob.verify_object(typed_object_id)) THEN
      RAISE EXCEPTION 'result raw or typed object failed tenant byte verification';
    END IF;
  END LOOP;

  FOR item IN
    SELECT value, ordinality
    FROM jsonb_array_elements(coalesce(effects, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    request_object_id := (item.value->>'request_object_id')::uuid;
    response_object_id := nullif(item.value->>'response_object_id','')::uuid;
    acknowledgement_object_id :=
      nullif(item.value->>'acknowledgement_object_id','')::uuid;
    rollback_object_id := nullif(item.value->>'rollback_object_id','')::uuid;
    IF nullif(item.value->>'effect_kind','') IS NULL
       OR acknowledgement_object_id IS NULL
       OR NOT lifeos_blob.verify_object(request_object_id)
       OR NOT lifeos_blob.verify_object(acknowledgement_object_id)
       OR (response_object_id IS NOT NULL
           AND NOT lifeos_blob.verify_object(response_object_id))
       OR (rollback_object_id IS NOT NULL
           AND NOT lifeos_blob.verify_object(rollback_object_id)) THEN
      RAISE EXCEPTION 'effect kind, request, response, acknowledgement, or rollback bytes are invalid';
    END IF;
  END LOOP;
  IF coalesce((task_row.capability_requirements->>
               'requires_effect_receipt')::boolean, false)
     AND jsonb_array_length(coalesce(effects, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'task requires an external-effect receipt';
  END IF;

  completion_payload := jsonb_build_object(
    'execution_id', execution_row.execution_id,
    'task_id', execution_row.task_id,
    'branch_id', execution_row.branch_id,
    'result_objects', result_objects,
    'effects', effects
  );
  completion_object := lifeos_blob.store_generated_object(
    execution_row.tenant_id, completion_payload,
    jsonb_build_object('producer', 'lifeos_runtime.complete_execution')
  );
  completed_witness := lifeos_agent.append_witness(
    witness_chain,
    completion_payload || jsonb_build_object(
      'canonical_object_id', completion_object,
      'execution_id', execution_row.execution_id,
      'signer_identity', witness->>'signer_identity',
      'signature_verification_object_id', witness->>'verification_object_id'
    ),
    decode(witness->>'signature', 'hex')
  );
  SELECT sequence INTO STRICT completed_witness_sequence
  FROM lifeos_agent.witness_entry
  WHERE witness_id = completed_witness;

  FOR item IN
    SELECT value, ordinality
    FROM jsonb_array_elements(result_objects) WITH ORDINALITY
  LOOP
    INSERT INTO lifeos_runtime.result (
      tenant_id, execution_id, result_no, result_kind, raw_object_id,
      typed_object_id, metadata, witness_chain_id, witness_sequence
    ) VALUES (
      execution_row.tenant_id, execution_row.execution_id, item.ordinality,
      coalesce(item.value->>'result_kind', 'result'),
      (item.value->>'raw_object_id')::uuid,
      nullif(item.value->>'typed_object_id','')::uuid,
      coalesce(item.value->'metadata', '{}'::jsonb),
      witness_chain, completed_witness_sequence
    );
  END LOOP;

  FOR item IN
    SELECT value, ordinality
    FROM jsonb_array_elements(coalesce(effects, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    INSERT INTO lifeos_runtime.effect (
      tenant_id, execution_id, effect_no, effect_kind, request_object_id,
      response_object_id, acknowledgement_object_id, rollback_object_id
    ) VALUES (
      execution_row.tenant_id, execution_row.execution_id, item.ordinality,
      item.value->>'effect_kind',
      (item.value->>'request_object_id')::uuid,
      nullif(item.value->>'response_object_id','')::uuid,
      nullif(item.value->>'acknowledgement_object_id','')::uuid,
      nullif(item.value->>'rollback_object_id','')::uuid
    );
  END LOOP;

  UPDATE lifeos_runtime.execution
  SET state_code = 'completed', completed_at = clock_timestamp()
  WHERE lifeos_runtime.execution.execution_id = execution_row.execution_id;
  UPDATE lifeos_runtime.lease
  SET acknowledged_at = clock_timestamp()
  WHERE lease_id = execution_row.lease_id;
  UPDATE lifeos_runtime.task SET state_code = 'completed'
  WHERE task_id = execution_row.task_id;
  RETURN completed_witness;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.create_branch(
  parent_branch uuid,
  kind text,
  branch_purpose text,
  branch_policy jsonb,
  creator uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_runtime, lifeos_security
AS $function$
DECLARE
  parent_row lifeos_runtime.branch%ROWTYPE;
  branch_payload jsonb;
  branch_object uuid;
  new_branch uuid;
BEGIN
  SELECT * INTO STRICT parent_row FROM lifeos_runtime.branch
  WHERE branch_id = parent_branch FOR SHARE;
  IF parent_row.tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'parent branch is outside the bound tenant';
  END IF;
  branch_payload := jsonb_build_object(
    'parent_branch_id', parent_branch, 'branch_kind', kind,
    'purpose', branch_purpose, 'policy', branch_policy,
    'created_by', creator
  );
  branch_object := lifeos_blob.store_generated_object(
    parent_row.tenant_id, branch_payload,
    jsonb_build_object('producer', 'lifeos_runtime.create_branch')
  );
  INSERT INTO lifeos_runtime.branch (
    tenant_id, parent_branch_id, base_lsn, branch_kind, purpose, policy,
    raw_object_id, head_generation, created_by
  ) VALUES (
    parent_row.tenant_id, parent_branch, pg_current_wal_lsn(), kind,
    branch_purpose, branch_policy, branch_object,
    parent_row.head_generation, creator
  ) RETURNING branch_id INTO new_branch;
  RETURN new_branch;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.merge_branch(
  source_branch uuid,
  target_branch uuid,
  merge_record jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  tenant uuid;
  merge_object uuid;
  gate_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    least(source_branch::text, target_branch::text) || ':' ||
    greatest(source_branch::text, target_branch::text), 0));
  SELECT source.tenant_id INTO STRICT tenant
  FROM lifeos_runtime.branch source
  JOIN lifeos_runtime.branch target
    ON target.branch_id = target_branch
   AND target.tenant_id = source.tenant_id
  WHERE source.branch_id = source_branch;
  IF tenant IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'merge branches are outside the bound tenant';
  END IF;
  merge_object := lifeos_blob.store_generated_object(
    tenant, merge_record || jsonb_build_object(
      'source_branch', source_branch, 'target_branch', target_branch),
    jsonb_build_object('producer', 'lifeos_runtime.merge_branch')
  );
  INSERT INTO lifeos_runtime.merge_gate (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time
  ) VALUES (
    tenant, target_branch, 'branch-merge-gate', merge_object,
    merge_record || jsonb_build_object('source_branch', source_branch,
                                       'target_branch', target_branch),
    digest(convert_to(merge_record::text, 'UTF8'), 'sha256'),
    source_branch::text || ':' || target_branch::text,
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING merge_gate_id INTO gate_id;
  RETURN gate_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_conflict(
  conflict_id uuid,
  resolution jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  conflict_row lifeos_runtime.merge_conflict%ROWTYPE;
  resolution_object uuid;
  resolution_id uuid;
BEGIN
  SELECT * INTO STRICT conflict_row
  FROM lifeos_runtime.merge_conflict
  WHERE merge_conflict_id = conflict_id;
  resolution_object := lifeos_blob.store_generated_object(
    conflict_row.tenant_id,
    resolution || jsonb_build_object('resolves', conflict_id),
    jsonb_build_object('producer', 'lifeos_runtime.resolve_conflict')
  );
  INSERT INTO lifeos_runtime.merge_conflict (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time
  ) VALUES (
    conflict_row.tenant_id, conflict_row.branch_id, 'conflict-resolution',
    resolution_object,
    resolution || jsonb_build_object('resolves', conflict_id),
    digest(convert_to(resolution::text, 'UTF8'), 'sha256'),
    'resolve:' || conflict_id::text,
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING merge_conflict_id INTO resolution_id;
  RETURN resolution_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.promote_branch(
  source_branch uuid,
  target_branch uuid,
  promotion_record jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  source_row lifeos_runtime.branch%ROWTYPE;
  target_row lifeos_runtime.branch%ROWTYPE;
  promotion_object uuid;
  new_promotion_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_branch::text, 1));
  SELECT * INTO STRICT source_row FROM lifeos_runtime.branch
  WHERE branch_id = source_branch FOR SHARE;
  SELECT * INTO STRICT target_row FROM lifeos_runtime.branch
  WHERE branch_id = target_branch FOR UPDATE;
  IF source_row.tenant_id <> target_row.tenant_id
     OR source_row.tenant_id IS DISTINCT FROM lifeos_security.current_tenant()
     OR EXISTS (
       SELECT 1 FROM lifeos_runtime.merge_conflict conflict
       WHERE conflict.branch_id = source_branch
         AND conflict.record_kind <> 'conflict-resolution'
         AND NOT EXISTS (
           SELECT 1 FROM lifeos_runtime.merge_conflict resolution
           WHERE resolution.record_kind = 'conflict-resolution'
             AND resolution.typed_payload->>'resolves' =
                 conflict.merge_conflict_id::text
         )
     ) THEN
    RAISE EXCEPTION 'branch promotion gates are not satisfied';
  END IF;
  promotion_object := lifeos_blob.store_generated_object(
    source_row.tenant_id,
    promotion_record || jsonb_build_object(
      'source_branch', source_branch, 'target_branch', target_branch,
      'generation', source_row.head_generation),
    jsonb_build_object('producer', 'lifeos_runtime.promote_branch')
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time
  ) VALUES (
    source_row.tenant_id, target_branch, 'branch-promotion', promotion_object,
    promotion_record || jsonb_build_object('source_branch', source_branch,
                                           'target_branch', target_branch),
    digest(convert_to(promotion_record::text, 'UTF8'), 'sha256'),
    source_branch::text || ':' || source_row.head_generation::text,
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING promotion_id INTO new_promotion_id;
  UPDATE lifeos_runtime.branch
  SET head_generation = source_row.head_generation,
      head_witness_id = (promotion_record->>'witness_id')::uuid
  WHERE branch_id = target_branch;
  RETURN new_promotion_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.authorize_secret(
  p_identity_id uuid,
  p_task_id uuid,
  p_lease_id uuid,
  p_secret_object_id uuid,
  p_purpose text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  authorized_grant uuid;
  tenant uuid := lifeos_security.current_tenant();
  event_payload jsonb;
  event_object uuid;
BEGIN
  SELECT grant_row.grant_id INTO STRICT authorized_grant
  FROM lifeos_security."grant" grant_row
  JOIN lifeos_runtime.lease lease_row
    ON lease_row.lease_id = p_lease_id
   AND lease_row.task_id = p_task_id
   AND lease_row.holder_identity_id = p_identity_id
  WHERE grant_row.tenant_id = tenant
    AND grant_row.identity_id = p_identity_id
    AND EXISTS (
      SELECT 1 FROM lifeos_security.current_binding() binding
      WHERE binding.tenant_id = tenant
        AND binding.identity_id = p_identity_id
        AND binding.lease_id = p_lease_id
        AND binding.expires_at > statement_timestamp()
    )
    AND grant_row.task_id = p_task_id
    AND grant_row.lease_id = p_lease_id
    AND grant_row.purpose = p_purpose
    AND grant_row.resource_scope @>
        jsonb_build_object('secret_object_id', p_secret_object_id)
    AND 'relay' = ANY (grant_row.action_scope)
    AND grant_row.revoked_at IS NULL
    AND grant_row.expires_at > statement_timestamp()
    AND lease_row.revoked_at IS NULL
    AND lease_row.expires_at > statement_timestamp();
  event_payload := jsonb_build_object(
    'grant_id', authorized_grant, 'identity_id', p_identity_id,
    'task_id', p_task_id, 'lease_id', p_lease_id,
    'secret_object_id', p_secret_object_id, 'purpose', p_purpose,
    'decision', 'allow'
  );
  event_object := lifeos_blob.store_generated_object(
    tenant, event_payload,
    jsonb_build_object('producer', 'lifeos_security.authorize_secret')
  );
  INSERT INTO lifeos_security.broker_event (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, valid_time
  ) VALUES (
    tenant, 'secret-authorization', event_object, event_payload,
    extensions.digest(convert_to(event_payload::text, 'UTF8'), 'sha256'),
    authorized_grant::text || ':' || p_lease_id::text,
    tstzrange(statement_timestamp(), NULL, '[)')
  );
  RETURN authorized_grant;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.mint_secret(
  p_secret_object_id uuid,
  p_ciphertext_object_id uuid,
  p_wrapping_key_ref text,
  p_algorithm text,
  p_nonce bytea,
  p_mint_object_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  next_version bigint;
  new_version uuid;
  event_payload jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_security.current_binding() binding
    JOIN lifeos_security."grant" authority ON authority.grant_id=binding.grant_id
    WHERE binding.tenant_id=tenant
      AND binding.expires_at > statement_timestamp()
      AND authority.tenant_id=binding.tenant_id
      AND authority.identity_id=binding.identity_id
      AND authority.revoked_at IS NULL
      AND authority.expires_at > statement_timestamp()
      AND 'mint-secret' = ANY(authority.action_scope)
      AND authority.resource_scope @>
          jsonb_build_object('secret_object_id',p_secret_object_id)
  ) THEN
    RAISE EXCEPTION 'secret mint authority is not active';
  END IF;
  PERFORM 1 FROM lifeos_security.secret_object
  WHERE secret_object_id = p_secret_object_id AND tenant_id = tenant
  FOR UPDATE;
  IF NOT FOUND OR NOT lifeos_blob.verify_object(p_ciphertext_object_id)
     OR NOT lifeos_blob.verify_object(p_mint_object_id) THEN
    RAISE EXCEPTION 'secret mint inputs failed canonical verification';
  END IF;
  SELECT coalesce(max(version_no), 0) + 1 INTO next_version
  FROM lifeos_security.secret_version
  WHERE secret_object_id = p_secret_object_id;
  INSERT INTO lifeos_security.secret_version (
    tenant_id, secret_object_id, version_no, ciphertext_object_id,
    wrapping_key_ref, algorithm, nonce
  ) VALUES (
    tenant, p_secret_object_id, next_version, p_ciphertext_object_id,
    p_wrapping_key_ref, p_algorithm, p_nonce
  ) RETURNING secret_version_id INTO new_version;
  event_payload := jsonb_build_object(
    'secret_object_id', p_secret_object_id,
    'secret_version_id', new_version, 'version_no', next_version,
    'ciphertext_object_id', p_ciphertext_object_id,
    'wrapping_key_ref', p_wrapping_key_ref, 'algorithm', p_algorithm
  );
  INSERT INTO lifeos_security.mint_event (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, valid_time
  ) VALUES (
    tenant, 'secret-mint', p_mint_object_id, event_payload,
    extensions.digest(convert_to(event_payload::text, 'UTF8'), 'sha256'),
    new_version::text, tstzrange(statement_timestamp(), NULL, '[)')
  );
  RETURN new_version;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.relay_secret(
  p_secret_version_id uuid,
  p_grant_id uuid,
  p_task_lease_id uuid,
  p_target_identity_id uuid,
  p_purpose text,
  p_relay_nonce bytea,
  p_relay_object_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  grant_row lifeos_security."grant"%ROWTYPE;
  version_row lifeos_security.secret_version%ROWTYPE;
  new_secret_lease uuid;
  event_payload jsonb;
BEGIN
  SELECT * INTO STRICT grant_row FROM lifeos_security."grant"
  WHERE grant_id = p_grant_id FOR SHARE;
  SELECT * INTO STRICT version_row FROM lifeos_security.secret_version
  WHERE secret_version_id = p_secret_version_id FOR SHARE;
  IF grant_row.tenant_id IS DISTINCT FROM lifeos_security.current_tenant()
     OR grant_row.tenant_id <> version_row.tenant_id
     OR grant_row.identity_id <> p_target_identity_id
     OR grant_row.lease_id <> p_task_lease_id
     OR grant_row.purpose <> p_purpose
     OR grant_row.revoked_at IS NOT NULL
     OR grant_row.expires_at <= statement_timestamp()
     OR NOT lifeos_blob.verify_object(p_relay_object_id) THEN
    RAISE EXCEPTION 'secret relay grant, lease, target, or bytes are invalid';
  END IF;
  INSERT INTO lifeos_security.secret_lease (
    tenant_id, secret_version_id, grant_id, task_lease_id,
    target_identity_id, purpose, relay_nonce, raw_object_id, expires_at
  ) VALUES (
    grant_row.tenant_id, p_secret_version_id, p_grant_id, p_task_lease_id,
    p_target_identity_id, p_purpose, p_relay_nonce, p_relay_object_id,
    least(grant_row.expires_at, statement_timestamp() + interval '5 minutes')
  ) RETURNING secret_lease_id INTO new_secret_lease;
  event_payload := jsonb_build_object(
    'secret_lease_id', new_secret_lease,
    'secret_version_id', p_secret_version_id, 'grant_id', p_grant_id,
    'task_lease_id', p_task_lease_id,
    'target_identity_id', p_target_identity_id, 'purpose', p_purpose
  );
  INSERT INTO lifeos_security.relay_event (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, valid_time
  ) VALUES (
    grant_row.tenant_id, 'secret-relay', p_relay_object_id, event_payload,
    extensions.digest(convert_to(event_payload::text, 'UTF8'), 'sha256'),
    encode(p_relay_nonce, 'hex'),
    tstzrange(statement_timestamp(), NULL, '[)')
  );
  RETURN new_secret_lease;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.rotate_secret(
  p_secret_object_id uuid,
  p_ciphertext_object_id uuid,
  p_wrapping_key_ref text,
  p_algorithm text,
  p_nonce bytea,
  p_rotation_object_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  new_version uuid;
  rotation_payload jsonb;
BEGIN
  new_version := lifeos_security.mint_secret(
    p_secret_object_id, p_ciphertext_object_id, p_wrapping_key_ref,
    p_algorithm, p_nonce, p_rotation_object_id
  );
  UPDATE lifeos_security.secret_version
  SET retired_at = clock_timestamp()
  WHERE secret_object_id = p_secret_object_id
    AND secret_version_id <> new_version
    AND retired_at IS NULL;
  rotation_payload := jsonb_build_object(
    'secret_object_id', p_secret_object_id,
    'new_secret_version_id', new_version
  );
  INSERT INTO lifeos_security.rotation (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, valid_time
  ) VALUES (
    tenant, 'secret-rotation', p_rotation_object_id, rotation_payload,
    extensions.digest(convert_to(rotation_payload::text, 'UTF8'), 'sha256'),
    new_version::text, tstzrange(statement_timestamp(), NULL, '[)')
  );
  RETURN new_version;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.revoke_secret(
  p_secret_object_id uuid,
  p_reason text,
  p_revocation_object_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  revocation_payload jsonb;
  new_revocation uuid;
BEGIN
  IF NOT lifeos_blob.verify_object(p_revocation_object_id) THEN
    RAISE EXCEPTION 'revocation record failed canonical verification';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_security.current_binding() binding
    JOIN lifeos_security."grant" authority ON authority.grant_id=binding.grant_id
    WHERE binding.tenant_id=tenant
      AND binding.expires_at > statement_timestamp()
      AND authority.tenant_id=binding.tenant_id
      AND authority.identity_id=binding.identity_id
      AND authority.revoked_at IS NULL
      AND authority.expires_at > statement_timestamp()
      AND 'revoke-secret' = ANY(authority.action_scope)
      AND authority.resource_scope @>
          jsonb_build_object('secret_object_id',p_secret_object_id)
  ) THEN
    RAISE EXCEPTION 'secret revocation authority is not active';
  END IF;
  UPDATE lifeos_security."grant" grant_row
  SET revoked_at = clock_timestamp()
  WHERE grant_row.tenant_id = tenant
    AND grant_row.resource_scope @>
        jsonb_build_object('secret_object_id', p_secret_object_id)
    AND grant_row.revoked_at IS NULL;
  UPDATE lifeos_security.secret_lease lease_row
  SET revoked_at = clock_timestamp()
  FROM lifeos_security.secret_version version_row
  WHERE lease_row.secret_version_id = version_row.secret_version_id
    AND version_row.secret_object_id = p_secret_object_id
    AND lease_row.revoked_at IS NULL;
  revocation_payload := jsonb_build_object(
    'secret_object_id', p_secret_object_id, 'reason', p_reason,
    'revoked_at', statement_timestamp()
  );
  INSERT INTO lifeos_security.revocation (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, valid_time
  ) VALUES (
    tenant, 'secret-revocation', p_revocation_object_id,
    revocation_payload,
    extensions.digest(convert_to(revocation_payload::text, 'UTF8'), 'sha256'),
    p_secret_object_id::text || ':' || encode(
      extensions.digest(convert_to(p_reason, 'UTF8'), 'sha256'), 'hex'),
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING revocation_id INTO new_revocation;
  RETURN new_revocation;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_release.promote(p_release_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_release, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  required_gate text;
  manifest_object uuid;
  activation_payload jsonb;
  activation_object uuid;
  outbox_payload jsonb;
  outbox_object uuid;
  new_activation uuid;
BEGIN
  FOREACH required_gate IN ARRAY ARRAY[
    'build','test','byte-reconstruction','retrieval','graph-causal',
    'security','model','forecast','witness','runner-receipt','rollback'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM lifeos_release.verification gate_row
      WHERE gate_row.tenant_id = tenant
        AND gate_row.typed_payload->>'release_id' = p_release_id::text
        AND gate_row.typed_payload->>'gate' = required_gate
        AND (gate_row.typed_payload->>'passed')::boolean
    ) THEN
      RAISE EXCEPTION 'release gate % did not pass', required_gate;
    END IF;
  END LOOP;
  SELECT raw_object_id INTO STRICT manifest_object
  FROM lifeos_release.manifest
  WHERE tenant_id = tenant
    AND typed_payload->>'release_id' = p_release_id::text;
  IF NOT EXISTS (
       SELECT 1 FROM lifeos_release.closure
       WHERE tenant_id = tenant
         AND typed_payload->>'release_id' = p_release_id::text
     ) OR NOT EXISTS (
       SELECT 1 FROM lifeos_release.rollback
       WHERE tenant_id = tenant
         AND typed_payload->>'release_id' = p_release_id::text
     ) OR NOT lifeos_blob.verify_object(manifest_object) THEN
    RAISE EXCEPTION 'release closure, rollback, or manifest bytes are missing';
  END IF;
  activation_payload := jsonb_build_object(
    'release_id', p_release_id, 'manifest_object_id', manifest_object,
    'issued_at', statement_timestamp(),
    'materializer', 'envctl', 'activation', 'atomic-symlink-and-session-reload'
  );
  activation_object := lifeos_blob.store_generated_object(
    tenant, activation_payload,
    jsonb_build_object('producer', 'lifeos_release.promote')
  );
  INSERT INTO lifeos_release.activation (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, valid_time
  ) VALUES (
    tenant, 'release-activation', activation_object, activation_payload,
    extensions.digest(convert_to(activation_payload::text, 'UTF8'), 'sha256'),
    p_release_id::text, tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING activation_id INTO new_activation;
  outbox_payload := activation_payload ||
    jsonb_build_object('activation_id',new_activation);
  outbox_object := lifeos_blob.store_generated_object(
    tenant,outbox_payload,
    jsonb_build_object('producer','lifeos_release.promote-outbox'));
  INSERT INTO lifeos_runtime.outbox (
    tenant_id, destination_component, raw_object_id, typed_payload
  ) VALUES (
    tenant, 'envctl-release-materializer', outbox_object, outbox_payload
  );
  RETURN new_activation;
END
$function$;
