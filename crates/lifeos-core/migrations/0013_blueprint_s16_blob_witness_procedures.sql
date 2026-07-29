-- LifeOS migration 0013 — blueprint §16.3 blob, witness, and semantic procedures (SQL block 3 of 6, verbatim after role preamble).
-- Packaging preamble only: restore the migrator session state the original
-- single-session §16 stream carried into this block.
SET ROLE lifeos_migrator;

CREATE OR REPLACE FUNCTION lifeos_blob.store_generated_object(
  p_tenant_id uuid,
  p_payload jsonb,
  p_provenance jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  payload_bytes bytea := convert_to(p_payload::text, 'UTF8');
  payload_sha256 bytea;
  payload_shake256 bytea;
  stored_object_id uuid;
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  payload_sha256 := extensions.digest(payload_bytes, 'sha256');
  payload_shake256 := extensions.digest(payload_bytes, 'shake256');
  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance
  ) VALUES (
    p_tenant_id, payload_sha256, payload_shake256,
    octet_length(payload_bytes), 'application/json', payload_bytes, false,
    p_provenance
  )
  ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING
  RETURNING object_id INTO stored_object_id;

  IF stored_object_id IS NULL THEN
    SELECT object_id INTO STRICT stored_object_id
    FROM lifeos_blob.object
    WHERE tenant_id = p_tenant_id
      AND sha256 = payload_sha256
      AND byte_length = octet_length(payload_bytes);
  END IF;
  RETURN stored_object_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_blob.verify_object_internal(p_object_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob
AS $function$
DECLARE
  object_row lifeos_blob.object%ROWTYPE;
  reconstructed bytea;
  layout_valid boolean;
  chunks_valid boolean;
BEGIN
  SELECT * INTO STRICT object_row
  FROM lifeos_blob.object
  WHERE object_id = p_object_id;

  IF object_row.chunked THEN
    WITH ordered_chunks AS (
      SELECT chunk_no, byte_offset, data, sha256,
             row_number() OVER (ORDER BY chunk_no) - 1 AS expected_chunk,
             coalesce(sum(octet_length(data)) OVER (
               ORDER BY chunk_no
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
             ), 0)::bigint AS expected_offset
      FROM lifeos_blob.object_chunk
      WHERE object_id = p_object_id
    )
    SELECT coalesce(bool_and(chunk_no = expected_chunk AND
                             byte_offset = expected_offset), true),
           coalesce(bool_and(extensions.digest(data, 'sha256') = sha256), true),
           coalesce(string_agg(data, ''::bytea ORDER BY chunk_no), ''::bytea)
    INTO layout_valid, chunks_valid, reconstructed
    FROM ordered_chunks;
  ELSE
    layout_valid := true;
    SELECT NOT EXISTS (
      SELECT 1 FROM lifeos_blob.object_chunk
      WHERE object_id = p_object_id
    ) INTO chunks_valid;
    reconstructed := object_row.bytes_inline;
  END IF;

  RETURN layout_valid
     AND chunks_valid
     AND octet_length(reconstructed)::bigint = object_row.byte_length
     AND extensions.digest(reconstructed, 'sha256') = object_row.sha256
     AND extensions.digest(reconstructed, 'shake256') = object_row.shake256;
EXCEPTION WHEN no_data_found THEN
  RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_blob.verify_object(p_object_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_security
AS $function$
BEGIN
  IF lifeos_security.current_tenant() IS NULL OR NOT EXISTS (
    SELECT 1 FROM lifeos_blob.object object_row
    WHERE object_row.object_id = p_object_id
      AND object_row.tenant_id = lifeos_security.current_tenant()
  ) THEN
    RETURN false;
  END IF;
  RETURN lifeos_blob.verify_object_internal(p_object_id);
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_blob.verify_object_for_backup(p_object_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob
AS $function$
BEGIN
  IF NOT pg_has_role(session_user, 'lifeos_backup', 'member') THEN
    RAISE EXCEPTION 'backup verification requires the backup role';
  END IF;
  RETURN lifeos_blob.verify_object_internal(p_object_id);
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_blob.enforce_object_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob
AS $function$
DECLARE
  target_object_id uuid;
BEGIN
  target_object_id := CASE
    WHEN TG_TABLE_NAME = 'object' THEN NEW.object_id
    ELSE NEW.object_id
  END;
  IF NOT lifeos_blob.verify_object_internal(target_object_id) THEN
    RAISE EXCEPTION 'object % failed complete-byte verification',
                    target_object_id;
  END IF;
  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER verify_object_row
  AFTER INSERT OR UPDATE ON lifeos_blob.object
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION lifeos_blob.enforce_object_integrity();
CREATE CONSTRAINT TRIGGER verify_object_chunks
  AFTER INSERT OR UPDATE ON lifeos_blob.object_chunk
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION lifeos_blob.enforce_object_integrity();

CREATE OR REPLACE FUNCTION lifeos_runtime.ingest_event(
  raw bytea,
  typed bytea,
  context jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  tenant uuid := (context->>'tenant_id')::uuid;
  raw_object uuid;
  typed_object uuid;
  durable_request uuid;
  raw_sha bytea := extensions.digest(raw, 'sha256');
  typed_sha bytea := extensions.digest(typed, 'sha256');
BEGIN
  IF tenant IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance
  ) VALUES (
    tenant, raw_sha, extensions.digest(raw, 'shake256'), octet_length(raw),
    coalesce(context->>'raw_media_type', 'application/octet-stream'), raw,
    false, context
  ) ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING
  RETURNING object_id INTO raw_object;
  IF raw_object IS NULL THEN
    SELECT object_id INTO STRICT raw_object FROM lifeos_blob.object
    WHERE tenant_id = tenant AND sha256 = raw_sha
      AND byte_length = octet_length(raw);
  END IF;

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance
  ) VALUES (
    tenant, typed_sha, extensions.digest(typed, 'shake256'),
    octet_length(typed),
    coalesce(context->>'typed_media_type', 'application/msgpack'), typed,
    false, context
  ) ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING
  RETURNING object_id INTO typed_object;
  IF typed_object IS NULL THEN
    SELECT object_id INTO STRICT typed_object FROM lifeos_blob.object
    WHERE tenant_id = tenant AND sha256 = typed_sha
      AND byte_length = octet_length(typed);
  END IF;

  INSERT INTO lifeos_runtime.request (
    tenant_id, session_id, branch_id, identity_id, raw_object_id,
    typed_object_id, authorization_context, idempotency_key
  ) VALUES (
    tenant, (context->>'session_id')::uuid, (context->>'branch_id')::uuid,
    (context->>'identity_id')::uuid, raw_object, typed_object,
    coalesce(context->'authorization', '{}'::jsonb),
    context->>'idempotency_key'
  ) RETURNING request_id INTO durable_request;

  INSERT INTO lifeos_runtime.request_hop (
    request_id, hop_no, component, input_object_id, output_object_id,
    metadata, started_at, completed_at
  ) VALUES (
    durable_request, 0, 'envctl/codedb-ingress', raw_object, typed_object,
    context, statement_timestamp(), clock_timestamp()
  );
  INSERT INTO lifeos_runtime.outbox (
    tenant_id, destination_component, branch_id, raw_object_id, typed_payload
  ) VALUES (
    tenant, 'semantic-refresh', (context->>'branch_id')::uuid, raw_object,
    jsonb_build_object('request_id', durable_request,
                       'typed_object_id', typed_object)
  );
  RETURN durable_request;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_semantic.enqueue_refresh(
  p_object_id uuid,
  p_branch_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_runtime, lifeos_semantic,
                  lifeos_security
AS $function$
DECLARE
  tenant uuid;
  queued_id uuid;
BEGIN
  SELECT tenant_id INTO STRICT tenant
  FROM lifeos_blob.object WHERE object_id = p_object_id;
  IF tenant IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  INSERT INTO lifeos_runtime.outbox (
    tenant_id, destination_component, branch_id, raw_object_id, typed_payload
  ) VALUES (
    tenant, 'ast-symbol-lexical-vector-graph-causal-refresh', p_branch_id,
    p_object_id, jsonb_build_object('object_id', p_object_id,
                                    'branch_id', p_branch_id)
  ) RETURNING outbox_id INTO queued_id;
  RETURN queued_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_semantic.refresh_object(p_task_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_semantic, lifeos_security
AS $function$
DECLARE
  task_row lifeos_runtime.task%ROWTYPE;
  generation_id uuid;
  generation_payload jsonb;
BEGIN
  SELECT * INTO STRICT task_row
  FROM lifeos_runtime.task WHERE task_id = p_task_id FOR UPDATE;
  generation_payload := jsonb_build_object(
    'task_id', p_task_id,
    'object_id', task_row.payload_object_id,
    'pipeline', jsonb_build_array('ast','symbol','lexical','embedding',
                                  'graph','causal')
  );
  INSERT INTO lifeos_semantic.index_generation (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time
  ) VALUES (
    task_row.tenant_id, task_row.branch_id, 'semantic-generation',
    task_row.payload_object_id, generation_payload,
    extensions.digest(convert_to(generation_payload::text, 'UTF8'), 'sha256'),
    p_task_id::text, tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING index_generation_id INTO generation_id;
  RETURN generation_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_agentdb.register_native_definition(
  p_definition_kind text,
  p_native_name text,
  p_source_object_id uuid,
  p_byte_start bigint,
  p_byte_end bigint,
  p_target_relation text,
  p_generated_ddl_object_id uuid,
  p_witness_chain_id uuid,
  p_witness_sequence bigint
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_agentdb,
                  lifeos_security
AS $function$
DECLARE
  tenant uuid;
  definition_payload jsonb;
  definition_id uuid;
BEGIN
  IF p_definition_kind NOT IN ('table','index','trigger','view')
     OR p_byte_start < 0 OR p_byte_end < p_byte_start THEN
    RAISE EXCEPTION 'AgentDB definition kind or source range is invalid';
  END IF;
  SELECT tenant_id INTO STRICT tenant FROM lifeos_blob.object
  WHERE object_id = p_source_object_id;
  IF tenant IS DISTINCT FROM lifeos_security.current_tenant()
     OR NOT lifeos_blob.verify_object(p_source_object_id)
     OR NOT lifeos_blob.verify_object(p_generated_ddl_object_id) THEN
    RAISE EXCEPTION 'AgentDB definition bytes failed authority checks';
  END IF;
  definition_payload := jsonb_build_object(
    'definition_kind', p_definition_kind,
    'native_name', p_native_name,
    'source_object_id', p_source_object_id,
    'byte_start', p_byte_start,
    'byte_end', p_byte_end,
    'target_relation', p_target_relation,
    'generated_ddl_object_id', p_generated_ddl_object_id,
    'source_revision', '04968e3fba3bf01ef4e9978d0446485452365a86'
  );
  INSERT INTO lifeos_agentdb.native_definition (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, witness_chain_id, witness_sequence, valid_time
  ) VALUES (
    tenant, 'agentdb-native-definition', p_source_object_id,
    definition_payload,
    extensions.digest(convert_to(definition_payload::text, 'UTF8'), 'sha256'),
    p_definition_kind || ':' || p_native_name,
    p_witness_chain_id, p_witness_sequence,
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING native_definition_id INTO definition_id;
  RETURN definition_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_agentdb.assert_native_inventory()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_agentdb, lifeos_security
AS $function$
DECLARE
  expected record;
  actual_count bigint;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('table',24::bigint), ('index',55::bigint),
    ('trigger',6::bigint), ('view',8::bigint)
  ) AS inventory(definition_kind, expected_count)
  LOOP
    SELECT count(*) INTO actual_count
    FROM lifeos_agentdb.native_definition definition_row
    WHERE definition_row.tenant_id = lifeos_security.current_tenant()
      AND definition_row.typed_payload->>'definition_kind' =
          expected.definition_kind;
    IF actual_count <> expected.expected_count THEN
      RAISE EXCEPTION 'AgentDB % inventory expected %, found %',
        expected.definition_kind, expected.expected_count, actual_count;
    END IF;
  END LOOP;
END
$function$;

ALTER TABLE lifeos_runtime.branch ADD COLUMN head_witness_id uuid
  REFERENCES lifeos_agent.witness_entry (witness_id);

CREATE OR REPLACE FUNCTION lifeos_runtime.ingest_event(
  raw bytea,
  typed bytea,
  context jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_agent, lifeos_security
AS $function$
DECLARE
  tenant uuid := (context->>'tenant_id')::uuid;
  raw_object uuid;
  typed_object uuid;
  durable_request uuid;
  existing_request lifeos_runtime.request%ROWTYPE;
  inbox_identity uuid;
  emitted_lsn pg_lsn;
  witness_identity uuid;
  witness_chain uuid := (context->>'witness_chain_id')::uuid;
  witness_sequence bigint;
  capture_payload jsonb;
  outbox_payload jsonb;
  outbox_object uuid;
BEGIN
  IF tenant IS DISTINCT FROM lifeos_security.current_tenant()
     OR NOT EXISTS (
       SELECT 1 FROM lifeos_security.current_binding() binding
       JOIN lifeos_security."grant" grant_row
         ON grant_row.grant_id = binding.grant_id
        AND grant_row.tenant_id = binding.tenant_id
        AND grant_row.identity_id = binding.identity_id
       WHERE binding.binding_kind = 'session'
         AND binding.tenant_id = tenant
         AND binding.identity_id = (context->>'identity_id')::uuid
         AND binding.expires_at > statement_timestamp()
         AND 'ingest' = ANY (grant_row.action_scope)
         AND grant_row.revoked_at IS NULL
         AND grant_row.expires_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'ingress requires an active envctl session authority';
  END IF;

  raw_object := lifeos_blob.store_bytes(
    tenant, raw, coalesce(context->>'raw_media_type','application/octet-stream'),
    context, 'envctl-ingress-raw', nullif(context->>'envctl_execution_id','')::uuid);
  typed_object := lifeos_blob.store_bytes(
    tenant, typed, coalesce(context->>'typed_media_type','application/msgpack'),
    context, 'codedb-typed-frame', nullif(context->>'envctl_execution_id','')::uuid);

  INSERT INTO lifeos_runtime.request (
    tenant_id, session_id, branch_id, identity_id, raw_object_id,
    typed_object_id, authorization_context, idempotency_key
  ) VALUES (
    tenant, (context->>'session_id')::uuid, (context->>'branch_id')::uuid,
    (context->>'identity_id')::uuid, raw_object, typed_object,
    coalesce(context->'authorization','{}'::jsonb), context->>'idempotency_key'
  ) ON CONFLICT (tenant_id,idempotency_key) DO NOTHING
  RETURNING request_id INTO durable_request;
  IF durable_request IS NULL THEN
    SELECT * INTO STRICT existing_request FROM lifeos_runtime.request
    WHERE tenant_id = tenant AND idempotency_key = context->>'idempotency_key';
    IF existing_request.raw_object_id <> raw_object
       OR existing_request.typed_object_id <> typed_object
       OR existing_request.session_id <> (context->>'session_id')::uuid
       OR existing_request.branch_id <> (context->>'branch_id')::uuid
       OR existing_request.identity_id <> (context->>'identity_id')::uuid THEN
      RAISE EXCEPTION 'idempotency key was reused for different ingress bytes';
    END IF;
    RETURN existing_request.request_id;
  END IF;

  emitted_lsn := pg_logical_emit_message(
    true, 'lifeos-envctl-ingress',
    jsonb_build_object('request_id',durable_request,
                       'redb_transaction_id',context->>'redb_transaction_id')::text);
  INSERT INTO lifeos_runtime.inbox (
    tenant_id, source_component, source_sequence, raw_object_id,
    record_digest, committed_lsn
  ) VALUES (
    tenant, 'envctl-codedb-redb', (context->>'source_sequence')::bigint,
    raw_object, extensions.digest(raw,'sha256'), emitted_lsn
  ) RETURNING inbox_id INTO inbox_identity;

  INSERT INTO lifeos_runtime.request_hop (
    tenant_id, request_id, hop_no, component, input_object_id,
    output_object_id, metadata, started_at, completed_at
  ) VALUES (
    tenant, durable_request, 0, 'envctl/codedb-ingress', raw_object,
    typed_object, context, statement_timestamp(), clock_timestamp());

  capture_payload := jsonb_build_object(
    'request_id',durable_request,'raw_object_id',raw_object,
    'typed_object_id',typed_object,'postgres_lsn',emitted_lsn,
    'branch_id',context->>'branch_id',
    'redb_transaction_id',context->>'redb_transaction_id');
  INSERT INTO lifeos_blob.capture_event (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, valid_time
  ) VALUES (
    tenant,(context->>'branch_id')::uuid,'envctl-ingress',raw_object,
    capture_payload,'\x00'::bytea,'capture:'||durable_request::text,
    tstzrange(statement_timestamp(),NULL,'[)'));

  witness_identity := lifeos_agent.append_witness(
    witness_chain,
    capture_payload || jsonb_build_object(
      'canonical_object_id',raw_object,
      'request_id',durable_request,
      'source_object_id',raw_object,
      'signer_identity',context->>'identity_id',
      'signature_verification_object_id',context->>'verification_object_id'),
    decode(context->>'signature','hex'));
  SELECT sequence INTO STRICT witness_sequence
  FROM lifeos_agent.witness_entry WHERE witness_id = witness_identity;

  INSERT INTO lifeos_runtime.reconcile_commit (
    tenant_id,inbox_id,envctl_execution_id,redb_transaction_id,postgres_lsn,
    raw_object_id,witness_chain_id,witness_sequence
  ) VALUES (
    tenant,inbox_identity,(context->>'envctl_execution_id')::uuid,
    decode(context->>'redb_transaction_id','hex'),emitted_lsn,raw_object,
    witness_chain,witness_sequence);

  outbox_payload := jsonb_build_object(
    'request_id',durable_request,'source_object_id',raw_object,
    'typed_object_id',typed_object,'witness_id',witness_identity);
  outbox_object := lifeos_blob.store_generated_object(
    tenant,outbox_payload,jsonb_build_object('producer','envctl-ingress-outbox'));
  INSERT INTO lifeos_runtime.outbox (
    tenant_id,destination_component,branch_id,raw_object_id,typed_payload
  ) VALUES (
    tenant,'semantic-refresh',(context->>'branch_id')::uuid,
    outbox_object,outbox_payload);
  RETURN durable_request;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.guard_execution_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.state_code = 'completed' AND OLD.state_code <> 'completed' THEN
    IF NOT EXISTS (SELECT 1 FROM lifeos_runtime.result
                   WHERE execution_id = NEW.execution_id)
       OR (SELECT count(DISTINCT stream_name) FROM lifeos_runtime.log_frame
           WHERE execution_id = NEW.execution_id
             AND stream_name IN ('stdout','stderr')) <> 2
       OR EXISTS (
         SELECT 1 FROM (
           SELECT stream_name,frame_no,byte_offset,
             row_number() OVER (PARTITION BY stream_name ORDER BY frame_no)-1 AS expected_frame,
             coalesce(sum(octet_length(lifeos_blob.load_object_bytes(raw_object_id)))
               OVER (PARTITION BY stream_name ORDER BY frame_no
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS expected_offset
           FROM lifeos_runtime.log_frame WHERE execution_id = NEW.execution_id
         ) ordered WHERE frame_no <> expected_frame OR byte_offset <> expected_offset
       ) OR EXISTS (
         SELECT 1 FROM lifeos_runtime.effect
         WHERE execution_id = NEW.execution_id AND acknowledgement_object_id IS NULL
       ) OR NOT EXISTS (
         SELECT 1 FROM lifeos_agent.witness_entry
         WHERE execution_id = NEW.execution_id
           AND signer_identity = NEW.runner_identity_id
       ) OR NOT EXISTS (
         SELECT 1 FROM lifeos_runtime.lease
         WHERE lease_id = NEW.lease_id AND revoked_at IS NULL
           AND expires_at > statement_timestamp() AND acknowledged_at IS NULL
       ) THEN
      RAISE EXCEPTION 'execution completion lacks contiguous streams, receipts, active lease, result, or witness';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_runtime.guard_branch_head()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE witness_payload jsonb;
BEGIN
  IF NEW.head_generation <> OLD.head_generation THEN
    IF NEW.head_witness_id IS NULL OR NEW.head_witness_id IS NOT DISTINCT FROM OLD.head_witness_id THEN
      RAISE EXCEPTION 'branch head change requires a new witness';
    END IF;
    SELECT convert_from(lifeos_blob.load_object_bytes(entry.canonical_object_id),'UTF8')::jsonb
      INTO STRICT witness_payload
    FROM lifeos_agent.witness_entry entry
    JOIN lifeos_agent.witness_chain chain_row ON chain_row.chain_id = entry.chain_id
    WHERE entry.witness_id = NEW.head_witness_id
      AND chain_row.tenant_id = NEW.tenant_id
      AND chain_row.branch_id = NEW.branch_id;
    IF witness_payload->>'branch_id' <> NEW.branch_id::text
       OR (witness_payload->>'new_generation')::bigint <> NEW.head_generation THEN
      RAISE EXCEPTION 'branch witness covers a different head';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_security.guard_secret_lease()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_security."grant" grant_row
    JOIN lifeos_runtime.lease task_lease ON task_lease.lease_id = NEW.task_lease_id
    JOIN lifeos_security.secret_version version_row
      ON version_row.secret_version_id = NEW.secret_version_id
    JOIN lifeos_security.secret_object secret_row
      ON secret_row.secret_object_id = version_row.secret_object_id
    JOIN lifeos_security.identity target
      ON target.identity_id = NEW.target_identity_id
    WHERE grant_row.grant_id = NEW.grant_id
      AND grant_row.tenant_id = NEW.tenant_id
      AND task_lease.tenant_id = NEW.tenant_id
      AND version_row.tenant_id = NEW.tenant_id
      AND secret_row.tenant_id = NEW.tenant_id
      AND target.tenant_id = NEW.tenant_id
      AND grant_row.identity_id = NEW.target_identity_id
      AND grant_row.lease_id = NEW.task_lease_id
      AND grant_row.task_id = task_lease.task_id
      AND grant_row.purpose = NEW.purpose
      AND 'relay' = ANY(grant_row.action_scope)
      AND grant_row.resource_scope @>
          jsonb_build_object('secret_object_id',secret_row.secret_object_id)
      AND grant_row.revoked_at IS NULL
      AND grant_row.issued_at <= statement_timestamp()
      AND grant_row.expires_at >= NEW.expires_at
      AND task_lease.revoked_at IS NULL
      AND task_lease.expires_at >= NEW.expires_at
      AND version_row.retired_at IS NULL
      AND target.active_from <= statement_timestamp()
      AND (target.active_until IS NULL OR target.active_until > statement_timestamp())
  ) THEN
    RAISE EXCEPTION 'secret lease authority, scope, tenant, or lifetime is invalid';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_release.guard_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE required_gate text;
BEGIN
  IF NEW.typed_payload->>'release_id' IS NULL
     OR NOT lifeos_blob.verify_object(NEW.raw_object_id) THEN
    RAISE EXCEPTION 'activation identity or bytes are invalid';
  END IF;
  FOREACH required_gate IN ARRAY ARRAY[
    'build','test','byte-reconstruction','retrieval','graph-causal','security',
    'model','forecast','witness','runner-receipt','rollback'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM lifeos_release.verification gate_row
      WHERE gate_row.tenant_id = NEW.tenant_id
        AND gate_row.typed_payload->>'release_id' = NEW.typed_payload->>'release_id'
        AND gate_row.typed_payload->>'gate' = required_gate
        AND (gate_row.typed_payload->>'passed')::boolean
        AND gate_row.witness_chain_id IS NOT NULL
        AND lifeos_blob.verify_object(gate_row.raw_object_id)
    ) THEN
      RAISE EXCEPTION 'activation gate % is not witnessed and byte-verified',required_gate;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM lifeos_release.manifest row_value
                 WHERE row_value.tenant_id=NEW.tenant_id
                   AND row_value.typed_payload->>'release_id'=NEW.typed_payload->>'release_id'
                   AND lifeos_blob.verify_object(row_value.raw_object_id))
     OR NOT EXISTS (SELECT 1 FROM lifeos_release.closure row_value
                    WHERE row_value.tenant_id=NEW.tenant_id
                      AND row_value.typed_payload->>'release_id'=NEW.typed_payload->>'release_id'
                      AND lifeos_blob.verify_object(row_value.raw_object_id))
     OR NOT EXISTS (SELECT 1 FROM lifeos_release.rollback row_value
                    WHERE row_value.tenant_id=NEW.tenant_id
                      AND row_value.typed_payload->>'release_id'=NEW.typed_payload->>'release_id'
                      AND lifeos_blob.verify_object(row_value.raw_object_id)) THEN
    RAISE EXCEPTION 'activation manifest, closure, or rollback bytes are invalid';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_agent.append_witness(
  p_chain_id uuid,
  p_canonical_record jsonb,
  p_signature bytea
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_agent,
                  lifeos_runtime, lifeos_security
AS $function$
DECLARE
  chain_row lifeos_agent.witness_chain%ROWTYPE;
  object_row lifeos_blob.object%ROWTYPE;
  canonical_object uuid := (p_canonical_record->>'canonical_object_id')::uuid;
  next_sequence bigint;
  next_digest bytea;
  new_witness_id uuid;
BEGIN
  SELECT * INTO STRICT chain_row FROM lifeos_agent.witness_chain
  WHERE chain_id = p_chain_id FOR UPDATE;
  SELECT * INTO STRICT object_row FROM lifeos_blob.object
  WHERE object_id = canonical_object
    AND tenant_id = chain_row.tenant_id;
  IF NOT lifeos_blob.verify_object(canonical_object) THEN
    RAISE EXCEPTION 'witness canonical object failed byte verification';
  END IF;
  IF p_signature IS NULL OR octet_length(p_signature) = 0 THEN
    RAISE EXCEPTION 'witness signature is required';
  END IF;
  next_sequence := chain_row.head_sequence + 1;
  next_digest := extensions.digest(
    chain_row.head_shake256 || object_row.shake256 ||
    convert_to(p_canonical_record::text, 'UTF8'), 'shake256'
  );
  INSERT INTO lifeos_agent.witness_entry (
    chain_id, sequence, previous_shake256, canonical_object_id,
    entry_shake256, source_object_id, request_id, execution_id,
    signer_identity, signature
  ) VALUES (
    p_chain_id, next_sequence, chain_row.head_shake256, canonical_object,
    next_digest, nullif(p_canonical_record->>'source_object_id','')::uuid,
    nullif(p_canonical_record->>'request_id','')::uuid,
    nullif(p_canonical_record->>'execution_id','')::uuid,
    (p_canonical_record->>'signer_identity')::uuid, p_signature
  ) RETURNING witness_id INTO new_witness_id;
  UPDATE lifeos_agent.witness_chain
  SET head_sequence = next_sequence, head_shake256 = next_digest
  WHERE chain_id = p_chain_id;
  RETURN new_witness_id;
END
$function$;
