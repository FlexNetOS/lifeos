-- LifeOS migration 0017 — SHAKE256 witness digests execute on RuVector's native
-- implementation.
--
-- Defect: blueprint §16.3 writes SHAKE256 witness digests as
-- extensions.digest(x,'shake256') (pgcrypto). pgcrypto cannot compute SHAKE at
-- all: SHAKE256 is an extendable-output function, so OpenSSL's
-- EVP_MD_CTX_size() has no defined value and the call fails at runtime with
-- "EVP_MD_CTX_size() failed". Every §16.3 routine that computes or verifies a
-- shake256 identity was therefore non-executable, which blocks the canonical
-- byte-commit path and operational invariant 12 (SHAKE256 witnesses bind source
-- bytes, vectors, lineage, transformations, executions, model state, artifacts,
-- and releases).
--
-- Correction: route those calls to extensions.ruvector_shake256_256(bytea),
-- RuVector's native SHAKE256-256 (32-byte output, matching the existing
-- octet_length(shake256) = 32 constraints). This satisfies hard rule 15 —
-- ruvnet/rUv components are installed and used, not replaced — and narrows no
-- gate: the digest requirement is unchanged, only its executor is corrected.
--
-- Bodies below are the live catalog definitions with that single substitution
-- applied, so no other blueprint semantics move.
-- Run as the login role: CREATE OR REPLACE preserves each function+s existing
-- owner, while SET ROLE lifeos_migrator cannot replace lifeos_security_owner functions.

-- lifeos_agent.append_branch_witness
CREATE OR REPLACE FUNCTION lifeos_agent.append_branch_witness(target_branch uuid, target_generation bigint, target_kind text, target_payload_object bigint, target_shake256 bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_head BIGINT;
  prior_shake256 BYTEA;
  new_witness_id UUID;
BEGIN
  IF octet_length(target_shake256) <> 32 THEN
    RAISE EXCEPTION 'SHAKE256-256 witness must contain exactly 32 bytes';
  END IF;

  SELECT head_generation INTO STRICT branch_head
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  IF target_generation > branch_head THEN
    RAISE EXCEPTION
      'witness generation % exceeds branch head %',
      target_generation, branch_head;
  END IF;

  SELECT entry_shake256 INTO prior_shake256
  FROM lifeos_agent.branch_witness
  WHERE branch_id = target_branch
  ORDER BY sequence DESC
  LIMIT 1;
  prior_shake256 := coalesce(
    prior_shake256,
    decode(repeat('00', 32), 'hex')
  );

  INSERT INTO lifeos_agent.branch_witness (
    branch_id, generation, witness_kind, previous_shake256,
    entry_shake256, payload_object_id
  ) VALUES (
    target_branch, target_generation, target_kind, prior_shake256,
    target_shake256, target_payload_object
  )
  RETURNING witness_id INTO new_witness_id;
  RETURN new_witness_id;
END
$function$

;

-- lifeos_agent.append_branch_witness_v2
CREATE OR REPLACE FUNCTION lifeos_agent.append_branch_witness_v2(target_branch uuid, target_generation bigint, target_kind text, target_payload_object bigint, target_context jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  payload_row lifeos_blob.object%ROWTYPE;
  prior_shake256 BYTEA;
  canonical_payload JSONB;
  canonical_preimage BYTEA;
  preimage_object BIGINT;
  derived_shake256 BYTEA;
  new_witness UUID;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR UPDATE;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF target_generation < 0 OR target_generation > branch_row.head_generation THEN
    RAISE EXCEPTION
      'witness generation % is outside branch head %',
      target_generation,
      branch_row.head_generation;
  END IF;
  IF btrim(coalesce(target_kind, '')) = ''
     OR jsonb_typeof(target_context) <> 'object' THEN
    RAISE EXCEPTION 'witness kind and context are required';
  END IF;
  SELECT * INTO STRICT payload_row
  FROM lifeos_blob.object
  WHERE id = target_payload_object;
  SELECT witness.entry_shake256 INTO prior_shake256
  FROM lifeos_agent.branch_witness witness
  WHERE witness.branch_id = target_branch
  ORDER BY witness.sequence DESC
  LIMIT 1;
  prior_shake256 := coalesce(
    prior_shake256,
    decode(repeat('00', 32), 'hex')
  );
  canonical_payload := jsonb_build_object(
    'branch_id', target_branch,
    'generation', target_generation,
    'payload', jsonb_build_object(
      'byte_length', payload_row.byte_length,
      'object_id', payload_row.id,
      'sha256', payload_row.sha256
    ),
    'previous_shake256', encode(prior_shake256, 'hex'),
    'tenant_id', branch_row.tenant_id,
    'witness_context', target_context,
    'witness_kind', target_kind
  );
  canonical_preimage := lifeos_runtime.cow_preimage_v1(
    'branch-witness',
    canonical_payload
  );
  derived_shake256 := extensions.ruvector_shake256_256(canonical_preimage);
  preimage_object := lifeos_runtime.store_generated_object(
    canonical_preimage,
    'cow-witness-preimage-v1'
  );
  INSERT INTO lifeos_agent.branch_witness (
    tenant_id, branch_id, generation, witness_kind, previous_shake256,
    entry_shake256, payload_object_id, preimage_version, preimage_object_id,
    witness_context
  ) VALUES (
    branch_row.tenant_id, target_branch, target_generation, target_kind,
    prior_shake256, derived_shake256, target_payload_object, 1,
    preimage_object, target_context
  )
  RETURNING witness_id INTO new_witness;
  RETURN new_witness;
END
$function$

;

-- lifeos_agent.append_witness
CREATE OR REPLACE FUNCTION lifeos_agent.append_witness(p_chain_id uuid, p_canonical_record jsonb, p_signature bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_agent', 'lifeos_security'
AS $function$
DECLARE
  chain_row lifeos_agent.witness_chain%ROWTYPE;
  object_row lifeos_blob.object%ROWTYPE;
  canonical_object uuid := (p_canonical_record->>'canonical_object_id')::uuid;
  verification_object uuid :=
    (p_canonical_record->>'signature_verification_object_id')::uuid;
  signer uuid := (p_canonical_record->>'signer_identity')::uuid;
  proof jsonb;
  next_sequence bigint;
  next_digest bytea;
  new_witness_id uuid;
BEGIN
  SELECT * INTO STRICT chain_row FROM lifeos_agent.witness_chain
  WHERE chain_id = p_chain_id FOR UPDATE;
  IF chain_row.tenant_id IS DISTINCT FROM lifeos_security.current_tenant()
     OR (p_canonical_record ? 'branch_id'
         AND p_canonical_record->>'branch_id' <> chain_row.branch_id::text)
     OR NOT EXISTS (
       SELECT 1 FROM lifeos_security.current_binding() binding
       WHERE binding.tenant_id = chain_row.tenant_id
         AND binding.identity_id = signer
         AND binding.expires_at > statement_timestamp()
     ) THEN
    RAISE EXCEPTION 'witness signer is not the active bound identity';
  END IF;
  SELECT * INTO STRICT object_row FROM lifeos_blob.object
  WHERE object_id = canonical_object AND tenant_id = chain_row.tenant_id;
  proof := convert_from(lifeos_blob.load_object_bytes(verification_object),'UTF8')::jsonb;
  IF p_signature IS NULL OR octet_length(p_signature) = 0
     OR coalesce((proof->>'verified')::boolean,false) IS NOT TRUE
     OR proof->>'signer_identity' <> signer::text
     OR proof->>'signature_sha256' <>
        encode(extensions.digest(p_signature,'sha256'),'hex') THEN
    RAISE EXCEPTION 'cryptographic witness verification receipt is invalid';
  END IF;
  next_sequence := chain_row.head_sequence + 1;
  next_digest := extensions.digest(
    convert_to('lifeos-witness-v1', 'UTF8') || chain_row.head_shake256 ||
    object_row.shake256 || lifeos_blob.canonical_jsonb_bytes(
      p_canonical_record - 'signature_verification_object_id'),
    'shake256'
  );
  IF proof->>'signed_digest' <> encode(next_digest,'hex') THEN
    RAISE EXCEPTION 'signature receipt covers a different witness digest';
  END IF;
  INSERT INTO lifeos_agent.witness_entry (
    tenant_id, chain_id, sequence, previous_shake256, canonical_object_id,
    entry_shake256, source_object_id, source_range, vector_id, graph_edge_id,
    request_id, execution_id, signer_identity, signature,
    signature_verification_object_id
  ) VALUES (
    chain_row.tenant_id, p_chain_id, next_sequence, chain_row.head_shake256,
    canonical_object, next_digest,
    nullif(p_canonical_record->>'source_object_id','')::uuid,
    CASE WHEN p_canonical_record ? 'byte_start' THEN
      int8range((p_canonical_record->>'byte_start')::bigint,
                (p_canonical_record->>'byte_end')::bigint,'[)') END,
    nullif(p_canonical_record->>'vector_id','')::uuid,
    nullif(p_canonical_record->>'graph_edge_id','')::uuid,
    nullif(p_canonical_record->>'request_id','')::uuid,
    nullif(p_canonical_record->>'execution_id','')::uuid,
    signer, p_signature, verification_object
  ) RETURNING witness_id INTO new_witness_id;
  UPDATE lifeos_agent.witness_chain
  SET head_sequence = next_sequence, head_shake256 = next_digest
  WHERE chain_id = p_chain_id;
  RETURN new_witness_id;
END
$function$

;

-- lifeos_blob.store_bytes
CREATE OR REPLACE FUNCTION lifeos_blob.store_bytes(p_tenant_id uuid, p_payload bytea, p_media_type text, p_provenance jsonb, p_call_kind text, p_created_by_execution uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_security'
AS $function$
DECLARE
  payload_sha bytea := extensions.digest(p_payload, 'sha256');
  payload_shake bytea := extensions.ruvector_shake256_256(p_payload);
  stored_object_id uuid;
  provenance_bytes bytea := lifeos_blob.canonical_jsonb_bytes(p_provenance);
BEGIN
  IF p_tenant_id IS DISTINCT FROM lifeos_security.current_tenant() THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_created_by_execution IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM lifeos_runtime.execution execution_row
       WHERE execution_row.execution_id = p_created_by_execution
         AND execution_row.tenant_id = p_tenant_id
     ) THEN
    RAISE EXCEPTION 'creating execution belongs to a different tenant';
  END IF;
  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, created_by_execution, provenance
  ) VALUES (
    p_tenant_id, payload_sha, payload_shake, octet_length(p_payload),
    p_media_type, p_payload, false, p_created_by_execution, p_provenance
  ) ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING
  RETURNING object_id INTO stored_object_id;

  IF stored_object_id IS NULL THEN
    SELECT object_id INTO STRICT stored_object_id
    FROM lifeos_blob.object
    WHERE tenant_id = p_tenant_id
      AND sha256 = payload_sha
      AND shake256 = payload_shake
      AND byte_length = octet_length(p_payload)
      AND NOT chunked
      AND bytes_inline = p_payload;
  END IF;

  INSERT INTO lifeos_blob.object_observation (
    tenant_id, object_id, call_kind, provenance_bytes, provenance_sha256
  ) VALUES (
    p_tenant_id, stored_object_id, p_call_kind, provenance_bytes,
    extensions.digest(provenance_bytes, 'sha256')
  );
  RETURN stored_object_id;
END
$function$

;

-- lifeos_blob.verify_object_internal
CREATE OR REPLACE FUNCTION lifeos_blob.verify_object_internal(p_object_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob'
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
     AND extensions.ruvector_shake256_256(reconstructed) = object_row.shake256;
EXCEPTION WHEN no_data_found THEN
  RETURN false;
END
$function$

;

-- lifeos_runtime.append_branch_overlay
CREATE OR REPLACE FUNCTION lifeos_runtime.append_branch_overlay(target_branch uuid, target_relation regclass, target_key jsonb, target_operation text, target_base_digest bytea, replacement_bytes bytea, replacement_json jsonb, target_execution uuid, overlay_shake256 bytea)
 RETURNS TABLE(overlay_sequence bigint, overlay_generation bigint, replacement_object_id bigint, overlay_witness_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  key_digest BYTEA;
  row_object BIGINT;
  record_object BIGINT;
  record_payload JSONB;
  new_generation BIGINT;
  new_witness UUID;
  existing_overlay lifeos_runtime.branch_overlay%ROWTYPE;
  existing_matches BOOLEAN;
BEGIN
  IF jsonb_typeof(target_key) <> 'object' THEN
    RAISE EXCEPTION 'overlay logical key must be a JSON object';
  END IF;
  IF target_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'unsupported overlay operation %', target_operation;
  END IF;
  IF target_base_digest IS NOT NULL
     AND octet_length(target_base_digest) <> 32 THEN
    RAISE EXCEPTION 'base digest must contain exactly 32 bytes';
  END IF;
  IF target_operation = 'delete' AND
     (replacement_bytes IS NOT NULL OR replacement_json IS NOT NULL) THEN
    RAISE EXCEPTION 'delete overlays cannot contain replacement data';
  END IF;
  IF target_operation <> 'delete' AND replacement_bytes IS NULL THEN
    RAISE EXCEPTION 'insert and update overlays require replacement bytes';
  END IF;
  key_digest := extensions.digest(
    convert_to(target_key::text, 'UTF8'), 'sha256'
  );

  SELECT * INTO existing_overlay
  FROM lifeos_runtime.branch_overlay
  WHERE branch_id = target_branch
    AND execution_id = target_execution;
  IF FOUND THEN
    SELECT
      existing_overlay.relation_name = target_relation
      AND existing_overlay.logical_key = target_key
      AND existing_overlay.logical_key_digest = key_digest
      AND existing_overlay.operation = target_operation
      AND existing_overlay.base_digest IS NOT DISTINCT FROM target_base_digest
      AND existing_overlay.row_json IS NOT DISTINCT FROM replacement_json
      AND (
        (existing_overlay.row_object_id IS NULL AND replacement_bytes IS NULL)
        OR EXISTS (
          SELECT 1
          FROM lifeos_blob.object object
          WHERE object.id = existing_overlay.row_object_id
            AND object.raw_bytes = replacement_bytes
        )
      )
    INTO existing_matches;
    IF NOT coalesce(existing_matches, false) THEN
      RAISE EXCEPTION 'branch-overlay execution idempotency collision';
    END IF;
    RETURN QUERY SELECT
      existing_overlay.sequence,
      existing_overlay.generation,
      existing_overlay.row_object_id,
      existing_overlay.witness_id;
    RETURN;
  END IF;

  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR UPDATE;
  new_generation := branch_row.head_generation + 1;

  IF replacement_bytes IS NOT NULL THEN
    row_object := lifeos_runtime.store_generated_object(
      replacement_bytes, 'cow-overlay-row'
    );
  END IF;
  record_payload := jsonb_build_object(
    'branch_id', target_branch,
    'generation', new_generation,
    'relation_name', target_relation::text,
    'logical_key', target_key,
    'operation', target_operation,
    'base_digest', CASE
      WHEN target_base_digest IS NULL THEN NULL
      ELSE encode(target_base_digest, 'hex')
    END,
    'row_object_id', row_object,
    'execution_id', target_execution
  );
  record_object := lifeos_runtime.store_generated_object(
    convert_to(record_payload::text, 'UTF8'),
    'cow-overlay-record'
  );

  UPDATE lifeos_runtime.branch
  SET head_generation = new_generation
  WHERE branch_id = target_branch;
  new_witness := lifeos_agent.append_branch_witness(
    target_branch, new_generation, 'overlay-append',
    record_object, overlay_shake256
  );

  RETURN QUERY
  INSERT INTO lifeos_runtime.branch_overlay (
    branch_id, generation, relation_name, logical_key,
    logical_key_digest, operation, base_digest, record_object_id,
    row_object_id, row_json, execution_id, witness_id
  ) VALUES (
    target_branch, new_generation, target_relation, target_key,
    key_digest, target_operation, target_base_digest, record_object,
    row_object, replacement_json, target_execution, new_witness
  )
  RETURNING
    sequence, generation, row_object_id, witness_id;
END
$function$

;

-- lifeos_runtime.append_branch_overlay_internal_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.append_branch_overlay_internal_v2(target_branch uuid, target_relation regclass, target_key jsonb, target_operation text, target_base_digest bytea, replacement_bytes bytea, replacement_json jsonb, target_execution uuid, target_effect uuid, target_request uuid, target_request_digest bytea, enforce_base_precondition boolean, target_witness_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  current_state RECORD;
  key_digest BYTEA;
  row_object BIGINT;
  record_object BIGINT;
  record_payload JSONB;
  new_generation BIGINT;
  new_witness UUID;
  new_sequence BIGINT;
  effective_base_digest BYTEA;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR UPDATE;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF jsonb_typeof(target_key) <> 'object'
     OR target_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'invalid overlay operation';
  END IF;
  IF target_base_digest IS NOT NULL
     AND octet_length(target_base_digest) <> 32 THEN
    RAISE EXCEPTION 'base digest must contain exactly 32 bytes';
  END IF;
  IF octet_length(target_request_digest) <> 32 THEN
    RAISE EXCEPTION 'request digest must contain exactly 32 bytes';
  END IF;
  IF target_operation = 'delete'
     AND (replacement_bytes IS NOT NULL OR replacement_json IS NOT NULL) THEN
    RAISE EXCEPTION 'delete overlays cannot contain replacement data';
  END IF;
  IF target_operation <> 'delete' AND replacement_bytes IS NULL THEN
    RAISE EXCEPTION 'insert and update overlays require replacement bytes';
  END IF;

  SELECT * INTO current_state
  FROM lifeos_runtime.resolve_branch_record_v2(
    target_branch,
    branch_row.head_generation,
    target_relation,
    target_key
  );
  IF enforce_base_precondition THEN
    IF target_operation = 'insert' THEN
      IF (FOUND AND current_state.state_exists)
         OR target_base_digest IS NOT NULL THEN
        RAISE EXCEPTION
          'overlay insert requires an absent key and NULL base digest';
      END IF;
    ELSE
      IF NOT FOUND OR NOT current_state.state_exists THEN
        RAISE EXCEPTION
          'overlay % requires an existing key',
          target_operation;
      END IF;
      IF target_base_digest IS NULL
         OR target_base_digest <> current_state.row_digest THEN
        RAISE EXCEPTION
          'overlay % base digest precondition failed',
          target_operation;
      END IF;
    END IF;
    effective_base_digest := target_base_digest;
  ELSE
    effective_base_digest := CASE
      WHEN FOUND AND current_state.state_exists THEN current_state.row_digest
      ELSE NULL
    END;
  END IF;

  key_digest := extensions.digest(
    convert_to(target_key::text, 'UTF8'),
    'sha256'
  );
  IF replacement_bytes IS NOT NULL THEN
    row_object := lifeos_runtime.store_generated_object(
      replacement_bytes,
      'cow-overlay-row-v2'
    );
  END IF;
  new_generation := branch_row.head_generation + 1;
  record_payload := jsonb_build_object(
    'base_digest', CASE WHEN effective_base_digest IS NULL THEN NULL
                        ELSE encode(effective_base_digest, 'hex') END,
    'branch_id', target_branch,
    'effect_id', target_effect,
    'execution_id', target_execution,
    'generation', new_generation,
    'logical_key', target_key,
    'logical_key_digest', encode(key_digest, 'hex'),
    'operation', target_operation,
    'relation_name', target_relation::text,
    'request_id', target_request,
    'row_digest', CASE WHEN replacement_bytes IS NULL THEN NULL
                       ELSE encode(
                         extensions.ruvector_shake256_256(replacement_bytes),
                         'hex'
                       ) END,
    'tenant_id', branch_row.tenant_id
  );
  record_object := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1('overlay-record', record_payload),
    'cow-overlay-record-v2'
  );
  UPDATE lifeos_runtime.branch
  SET head_generation = new_generation
  WHERE branch_id = target_branch;
  new_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    new_generation,
    target_witness_kind,
    record_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'request_id', target_request,
      'request_digest', encode(target_request_digest, 'hex')
    )
  );
  INSERT INTO lifeos_runtime.branch_overlay (
    tenant_id, branch_id, generation, relation_name, logical_key,
    logical_key_digest, operation, base_digest, record_object_id,
    row_object_id, row_json, execution_id, effect_id, request_digest,
    witness_id
  ) VALUES (
    branch_row.tenant_id, target_branch, new_generation, target_relation,
    target_key, key_digest, target_operation, effective_base_digest,
    record_object, row_object, replacement_json, target_execution,
    target_effect, target_request_digest, new_witness
  )
  RETURNING sequence INTO new_sequence;
  PERFORM lifeos_rvf.stable_vector_id_v2(
    branch_row.tenant_id,
    target_relation,
    key_digest
  );
  RETURN jsonb_build_object(
    'generation', new_generation,
    'overlay_sequence', new_sequence,
    'row_object_id', row_object,
    'witness_id', new_witness
  );
END
$function$

;

-- lifeos_runtime.begin_cow_request_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.begin_cow_request_v2(request_tenant uuid, request_operation text, request_idempotency_key text, request_input jsonb, request_execution uuid, request_effect uuid)
 RETURNS TABLE(request_id uuid, request_digest bytea, replayed boolean, prior_result jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime'
AS $function$
DECLARE
  canonical_input BYTEA;
  canonical_object BIGINT;
  canonical_digest BYTEA;
  request_row lifeos_runtime.cow_request%ROWTYPE;
  result_row lifeos_runtime.cow_request_result%ROWTYPE;
BEGIN
  PERFORM lifeos_runtime.require_tenant(request_tenant);
  IF btrim(coalesce(request_operation, '')) = ''
     OR btrim(coalesce(request_idempotency_key, '')) = ''
     OR jsonb_typeof(request_input) <> 'object'
     OR request_execution IS NULL
     OR request_effect IS NULL THEN
    RAISE EXCEPTION 'complete COW request provenance is required';
  END IF;
  canonical_input := lifeos_runtime.cow_preimage_v1(
    'request',
    jsonb_build_object(
      'effect_id', request_effect,
      'execution_id', request_execution,
      'idempotency_key', request_idempotency_key,
      'input', request_input,
      'operation', request_operation,
      'tenant_id', request_tenant
    )
  );
  canonical_digest := extensions.ruvector_shake256_256(canonical_input);
  canonical_object := lifeos_runtime.store_generated_object(
    canonical_input,
    'cow-request-preimage-v1'
  );

  INSERT INTO lifeos_runtime.cow_request (
    tenant_id, operation, idempotency_key, input_object_id, input_digest,
    execution_id, effect_id
  ) VALUES (
    request_tenant, request_operation, request_idempotency_key,
    canonical_object, canonical_digest, request_execution, request_effect
  )
  ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING;

  SELECT * INTO STRICT request_row
  FROM lifeos_runtime.cow_request request
  WHERE request.tenant_id = request_tenant
    AND request.operation = request_operation
    AND request.idempotency_key = request_idempotency_key
  FOR UPDATE;

  IF request_row.input_digest <> canonical_digest
     OR request_row.execution_id <> request_execution
     OR request_row.effect_id <> request_effect
     OR NOT EXISTS (
       SELECT 1
       FROM lifeos_blob.object object
       WHERE object.id = request_row.input_object_id
         AND object.raw_bytes = canonical_input
     ) THEN
    RAISE EXCEPTION
      'full-input idempotency collision for operation % and key %',
      request_operation,
      request_idempotency_key;
  END IF;

  SELECT * INTO result_row
  FROM lifeos_runtime.cow_request_result result
  WHERE result.request_id = request_row.request_id;

  RETURN QUERY SELECT
    request_row.request_id,
    canonical_digest,
    FOUND,
    result_row.result;
END
$function$

;

-- lifeos_runtime.compare_promotion_snapshot_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.compare_promotion_snapshot_v2(target_promotion uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime'
AS $function$
DECLARE
  promotion_row lifeos_runtime.promotion%ROWTYPE;
  stored_bytes BYTEA;
  reconstructed_bytes BYTEA;
BEGIN
  SELECT * INTO STRICT promotion_row
  FROM lifeos_runtime.promotion
  WHERE promotion_id = target_promotion;
  PERFORM lifeos_runtime.require_tenant(promotion_row.tenant_id);
  SELECT raw_bytes INTO STRICT stored_bytes
  FROM lifeos_blob.object
  WHERE id = promotion_row.snapshot_object_id;
  reconstructed_bytes := lifeos_runtime.materialize_branch_v2(
    promotion_row.target_branch_id,
    promotion_row.to_generation
  );
  RETURN stored_bytes = reconstructed_bytes
    AND promotion_row.snapshot_digest
      = extensions.ruvector_shake256_256(reconstructed_bytes);
END
$function$

;

-- lifeos_runtime.cow_branch_capability
CREATE OR REPLACE FUNCTION lifeos_runtime.cow_branch_capability()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime'
AS $function$
DECLARE
  self_check JSONB;
  database_receipt lifeos_runtime.cow_acceptance_receipt%ROWTYPE;
  native_receipt lifeos_runtime.cow_acceptance_receipt%ROWTYPE;
  database_receipt_valid BOOLEAN := false;
  native_receipt_content_valid BOOLEAN := false;
  native_evidence_valid BOOLEAN := false;
  runtime_digest_binding BOOLEAN := false;
  native_evidence JSONB;
  native_evidence_bytes BYTEA;
BEGIN
  self_check := lifeos_runtime.cow_semantic_self_check_v2();

  SELECT * INTO database_receipt
  FROM lifeos_runtime.cow_acceptance_receipt receipt
  WHERE receipt.receipt_kind = 'database-semantics'
    AND receipt.suite_version = 'lifeos.cow-db-semantic-suite.v1'
    AND receipt.accepted
  ORDER BY receipt.created_at DESC, receipt.receipt_id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT
      database_receipt.receipt_digest
        = extensions.ruvector_shake256_256(preimage.raw_bytes)
      AND database_receipt.evidence_digest
        = extensions.ruvector_shake256_256(evidence.raw_bytes)
    INTO database_receipt_valid
    FROM lifeos_blob.object preimage
    JOIN lifeos_blob.object evidence
      ON evidence.id = database_receipt.evidence_object_id
    WHERE preimage.id = database_receipt.receipt_preimage_object_id;
  END IF;

  SELECT * INTO native_receipt
  FROM lifeos_runtime.cow_acceptance_receipt receipt
  WHERE receipt.receipt_kind = 'native-rvf-roundtrip'
    AND receipt.suite_version = 'lifeos.native-rvf-postgres-roundtrip.v1'
    AND receipt.accepted
  ORDER BY receipt.created_at DESC, receipt.receipt_id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT
      native_receipt.receipt_digest
        = extensions.ruvector_shake256_256(preimage.raw_bytes)
      AND native_receipt.evidence_digest
        = extensions.ruvector_shake256_256(evidence.raw_bytes),
      evidence.raw_bytes
    INTO native_receipt_content_valid, native_evidence_bytes
    FROM lifeos_blob.object preimage
    JOIN lifeos_blob.object evidence
      ON evidence.id = native_receipt.evidence_object_id
    WHERE preimage.id = native_receipt.receipt_preimage_object_id;
  END IF;

  IF coalesce(native_receipt_content_valid, false)
     AND native_evidence_bytes IS NOT NULL THEN
    BEGIN
      native_evidence := convert_from(native_evidence_bytes, 'UTF8')::jsonb;
      SELECT
        native_evidence->>'schema'
          = 'lifeos.native-rvf-postgres-roundtrip.v1'
        AND native_evidence->>'status' = 'passed'
        AND native_evidence->>'suite_version'
          = 'lifeos.native-rvf-postgres-roundtrip.v1'
        AND native_evidence#>>'{database_semantics,suite_version}'
          = 'lifeos.cow-db-semantic-suite.v1'
        AND native_evidence#>>'{database_semantics,receipt_digest}'
          = encode(database_receipt.receipt_digest, 'hex')
        AND native_evidence#>>'{database_semantics,artifact_sha256}'
          ~ '^[0-9a-f]{64}$'
        AND native_evidence#>>'{native_binary,sha256}'
          ~ '^[0-9a-f]{64}$'
        AND native_evidence#>>'{native_binary,rvf_runtime_source_sha256}'
          ~ '^[0-9a-f]{64}$'
        AND native_evidence#>>'{native_binary,ruvector_postgres_source_sha256}'
          ~ '^[0-9a-f]{64}$'
        AND native_evidence#>>'{installed_extension,version}'
          ~ '^[0-9]+[.][0-9]+[.][0-9]+$'
        AND native_evidence#>>'{installed_extension,catalog_version}'
          = (
            SELECT extension.extversion
            FROM pg_extension extension
            WHERE extension.extname = 'ruvector'
          )
        AND native_evidence#>>'{verification,adversarial_suite}'
          = 'passed'
        AND native_evidence#>>'{verification,native_close_reopen}'
          = 'passed'
        AND native_evidence#>>'{verification,postgres_roundtrip}'
          = 'passed'
        AND native_evidence#>>'{verification,fresh_bootstrap}'
          = 'passed'
        AND native_evidence#>>'{verification,upgrade_migration}'
          = 'passed'
        AND native_evidence#>>'{verification,least_privilege_rls}'
          = 'passed'
        AND native_evidence#>>'{verification,witness_chain}'
          = 'passed'
      INTO native_evidence_valid;

      SELECT
        jsonb_typeof(native_evidence->'installed_libraries') = 'array'
        AND jsonb_array_length(native_evidence->'installed_libraries') > 0
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            native_evidence->'installed_libraries'
          ) library
          WHERE coalesce(library->>'catalog_binding', '') = ''
             OR coalesce(library->>'path', '') = ''
             OR coalesce(library->>'sha256', '')
                  !~ '^[0-9a-f]{64}$'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM (
            SELECT DISTINCT procedure.probin AS catalog_binding
            FROM pg_proc procedure
            JOIN pg_language language
              ON language.oid = procedure.prolang
            JOIN pg_depend dependency
              ON dependency.classid = 'pg_proc'::regclass
             AND dependency.objid = procedure.oid
             AND dependency.refclassid = 'pg_extension'::regclass
             AND dependency.deptype = 'e'
            JOIN pg_extension extension
              ON extension.oid = dependency.refobjid
            WHERE extension.extname = 'ruvector'
              AND language.lanname = 'c'
          ) live_library
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              native_evidence->'installed_libraries'
            ) evidence_library
            WHERE evidence_library->>'catalog_binding'
              = live_library.catalog_binding
          )
        )
      INTO runtime_digest_binding;
    EXCEPTION
      WHEN OTHERS THEN
        native_evidence_valid := false;
        runtime_digest_binding := false;
    END;
  END IF;

  RETURN self_check || jsonb_build_object(
    'acceptance_receipt_schema_version', 1,
    'database_receipt_id', database_receipt.receipt_id,
    'database_semantics_receipt', coalesce(database_receipt_valid, false),
    'implemented',
      (self_check->>'ready')::boolean
      AND coalesce(database_receipt_valid, false)
      AND coalesce(native_receipt_content_valid, false)
      AND coalesce(native_evidence_valid, false)
      AND coalesce(runtime_digest_binding, false),
    'native_evidence_valid', coalesce(native_evidence_valid, false),
    'native_rvf_receipt_id', native_receipt.receipt_id,
    'overlay_resolution', 'overlay-nearest-ancestor-canonical-projection',
    'promotion', 'baseline-gated-database-materialized',
    'rollback', 'active-pointer-recursive-promotion-ancestry',
    'runtime_digest_binding', coalesce(runtime_digest_binding, false),
    'rvf_roundtrip',
      coalesce(native_receipt_content_valid, false)
      AND coalesce(native_evidence_valid, false),
    'schema_version', 2,
    'witness_algorithm', 'SHAKE256-256',
    'witness_preimage_schema', 'lifeos.cow-preimage.v1'
  );
END
$function$

;

-- lifeos_runtime.cow_digest_v1
CREATE OR REPLACE FUNCTION lifeos_runtime.cow_digest_v1(preimage_kind text, payload jsonb)
 RETURNS bytea
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_runtime'
AS $function$
  SELECT extensions.ruvector_shake256_256(
    lifeos_runtime.cow_preimage_v1(preimage_kind, payload)
  )
$function$

;

-- lifeos_runtime.cow_semantic_self_check_v2_base
CREATE OR REPLACE FUNCTION lifeos_runtime.cow_semantic_self_check_v2_base()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime', 'lifeos_agent'
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
$function$

;

-- lifeos_runtime.create_branch
CREATE OR REPLACE FUNCTION lifeos_runtime.create_branch(parent_branch uuid, kind text, branch_purpose text, branch_policy jsonb, adapters jsonb, creator text, creation_shake256 bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  parent_row lifeos_runtime.branch%ROWTYPE;
  branch_payload JSONB;
  branch_object BIGINT;
  branch_creation_key TEXT;
  new_branch UUID;
BEGIN
  SELECT * INTO STRICT parent_row
  FROM lifeos_runtime.branch
  WHERE branch_id = parent_branch
  FOR SHARE;

  branch_payload := jsonb_build_object(
    'tenant_id', parent_row.tenant_id,
    'parent_branch_id', parent_branch,
    'parent_generation', parent_row.head_generation,
    'branch_kind', kind,
    'purpose', branch_purpose,
    'policy', branch_policy,
    'model_adapters', adapters,
    'created_by', creator
  );
  branch_creation_key := encode(
    extensions.digest(convert_to(branch_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  SELECT branch_id INTO new_branch
  FROM lifeos_runtime.branch
  WHERE tenant_id = parent_row.tenant_id
    AND creation_key = branch_creation_key;
  IF new_branch IS NOT NULL THEN
    RETURN new_branch;
  END IF;
  branch_object := lifeos_runtime.store_generated_object(
    convert_to(branch_payload::text, 'UTF8'),
    'cow-branch-child'
  );
  INSERT INTO lifeos_runtime.branch (
    tenant_id, parent_branch_id, parent_generation, base_lsn,
    branch_kind, purpose, policy, model_adapters, creation_key, raw_object_id,
    head_generation, created_by
  ) VALUES (
    parent_row.tenant_id, parent_branch, parent_row.head_generation,
    pg_current_wal_lsn(), kind, branch_purpose, branch_policy, adapters,
    branch_creation_key, branch_object, parent_row.head_generation, creator
  )
  RETURNING branch_id INTO new_branch;

  PERFORM lifeos_agent.append_branch_witness(
    new_branch, parent_row.head_generation, 'branch-create',
    branch_object, creation_shake256
  );
  RETURN new_branch;
END
$function$

;

-- lifeos_runtime.create_root_branch
CREATE OR REPLACE FUNCTION lifeos_runtime.create_root_branch(branch_tenant uuid, kind text, branch_purpose text, branch_policy jsonb, adapters jsonb, creator text, creation_shake256 bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_payload JSONB;
  branch_object BIGINT;
  branch_creation_key TEXT;
  new_branch UUID;
BEGIN
  branch_payload := jsonb_build_object(
    'tenant_id', branch_tenant,
    'parent_branch_id', NULL,
    'branch_kind', kind,
    'purpose', branch_purpose,
    'policy', branch_policy,
    'model_adapters', adapters,
    'created_by', creator
  );
  branch_creation_key := encode(
    extensions.digest(convert_to(branch_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  SELECT branch_id INTO new_branch
  FROM lifeos_runtime.branch
  WHERE tenant_id = branch_tenant
    AND creation_key = branch_creation_key;
  IF new_branch IS NOT NULL THEN
    RETURN new_branch;
  END IF;
  branch_object := lifeos_runtime.store_generated_object(
    convert_to(branch_payload::text, 'UTF8'),
    'cow-branch-root'
  );
  INSERT INTO lifeos_runtime.branch (
    tenant_id, branch_kind, purpose, policy, model_adapters,
    creation_key, raw_object_id, created_by
  ) VALUES (
    branch_tenant, kind, branch_purpose, branch_policy, adapters,
    branch_creation_key, branch_object, creator
  )
  RETURNING branch_id INTO new_branch;

  PERFORM lifeos_agent.append_branch_witness(
    new_branch, 0, 'branch-create', branch_object, creation_shake256
  );
  RETURN new_branch;
END
$function$

;

-- lifeos_runtime.merge_branch
CREATE OR REPLACE FUNCTION lifeos_runtime.merge_branch(source_branch uuid, target_branch uuid, merge_shake256 bytea, target_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'lifeos_blob', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  source_row lifeos_runtime.branch%ROWTYPE;
  target_row lifeos_runtime.branch%ROWTYPE;
  collision_count BIGINT;
  overlay_count BIGINT;
  final_generation BIGINT;
  merge_payload JSONB;
  merge_object BIGINT;
  merge_witness UUID;
  merge_event UUID;
  existing_merge lifeos_runtime.promotion%ROWTYPE;
  existing_payload JSONB;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'branch merge requires a SERIALIZABLE transaction';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    least(source_branch::text, target_branch::text) || ':' ||
    greatest(source_branch::text, target_branch::text),
    0
  ));
  PERFORM 1
  FROM lifeos_runtime.branch
  WHERE branch_id IN (source_branch, target_branch)
  ORDER BY branch_id
  FOR UPDATE;
  SELECT * INTO STRICT source_row
  FROM lifeos_runtime.branch WHERE branch_id = source_branch;
  SELECT * INTO STRICT target_row
  FROM lifeos_runtime.branch WHERE branch_id = target_branch;

  IF source_row.tenant_id <> target_row.tenant_id
     OR source_row.parent_branch_id IS DISTINCT FROM target_branch THEN
    RAISE EXCEPTION 'only a child branch can merge into its same-tenant parent';
  END IF;
  SELECT * INTO existing_merge
  FROM lifeos_runtime.promotion
  WHERE tenant_id = source_row.tenant_id
    AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    IF existing_merge.action <> 'merge'
       OR existing_merge.source_branch_id IS DISTINCT FROM source_branch
       OR existing_merge.target_branch_id IS DISTINCT FROM target_branch THEN
      RAISE EXCEPTION 'branch-merge idempotency collision';
    END IF;
    SELECT convert_from(raw_bytes, 'UTF8')::jsonb INTO STRICT existing_payload
    FROM lifeos_blob.object
    WHERE id = existing_merge.event_object_id;
    RETURN existing_payload || jsonb_build_object(
      'merged', coalesce((existing_payload->>'conflict_count')::bigint, 0) = 0,
      'overlay_count',
        existing_merge.to_generation - coalesce(
          existing_merge.from_generation, existing_merge.to_generation
        ),
      'target_generation', existing_merge.to_generation,
      'merge_event_id', existing_merge.promotion_id
    );
  END IF;
  IF NOT lifeos_runtime.branch_gates_satisfied(source_branch) THEN
    RAISE EXCEPTION 'source branch gates are not satisfied';
  END IF;

  WITH source_local AS (
    SELECT source.*
    FROM lifeos_runtime.branch_overlay source
    WHERE source.branch_id = source_branch
      AND source.generation > source_row.parent_generation
  )
  SELECT count(*) INTO collision_count
  FROM source_local source
  CROSS JOIN LATERAL (
    SELECT target.*
    FROM lifeos_runtime.branch_overlay target
    WHERE target.branch_id = target_branch
      AND target.generation > source_row.parent_generation
      AND target.relation_name = source.relation_name
      AND target.logical_key_digest = source.logical_key_digest
    ORDER BY target.generation DESC, target.sequence DESC
    LIMIT 1
  ) target;

  merge_payload := jsonb_build_object(
    'source_branch_id', source_branch,
    'target_branch_id', target_branch,
    'source_generation', source_row.head_generation,
    'target_generation', target_row.head_generation,
    'conflict_count', collision_count,
    'idempotency_key', target_idempotency_key
  );
  merge_object := lifeos_runtime.store_generated_object(
    convert_to(merge_payload::text, 'UTF8'),
    CASE WHEN collision_count > 0
      THEN 'cow-merge-conflict-record'
      ELSE 'cow-merge-record'
    END
  );

  IF collision_count > 0 THEN
    merge_witness := lifeos_agent.append_branch_witness(
      target_branch, target_row.head_generation, 'merge-conflict',
      merge_object, merge_shake256
    );
    WITH source_local AS (
      SELECT source.*
      FROM lifeos_runtime.branch_overlay source
      WHERE source.branch_id = source_branch
        AND source.generation > source_row.parent_generation
    ),
    collisions AS (
      SELECT source.*, target.sequence AS target_sequence,
             target.generation AS conflicting_generation,
             target.row_object_id AS conflicting_object_id
      FROM source_local source
      CROSS JOIN LATERAL (
        SELECT target.*
        FROM lifeos_runtime.branch_overlay target
        WHERE target.branch_id = target_branch
          AND target.generation > source_row.parent_generation
          AND target.relation_name = source.relation_name
          AND target.logical_key_digest = source.logical_key_digest
        ORDER BY target.generation DESC, target.sequence DESC
        LIMIT 1
      ) target
    )
    INSERT INTO lifeos_runtime.merge_conflict (
      tenant_id, source_branch_id, target_branch_id, source_generation,
      target_generation, relation_name, logical_key, logical_key_digest,
      conflict_kind, base_digest, source_object_id, target_object_id,
      record_object_id, witness_id, idempotency_key
    )
    SELECT
      source_row.tenant_id, source_branch, target_branch,
      collisions.generation, collisions.conflicting_generation,
      collisions.relation_name, collisions.logical_key,
      collisions.logical_key_digest, 'key', collisions.base_digest,
      collisions.row_object_id, collisions.conflicting_object_id,
      merge_object, merge_witness,
      target_idempotency_key || ':' || collisions.sequence::text ||
        ':' || collisions.target_sequence::text
    FROM collisions
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

    INSERT INTO lifeos_runtime.promotion (
      tenant_id, action, source_branch_id, target_branch_id,
      from_generation, to_generation, snapshot_object_id, event_object_id,
      witness_id, idempotency_key
    ) VALUES (
      source_row.tenant_id, 'merge', source_branch, target_branch,
      target_row.head_generation, target_row.head_generation,
      merge_object, merge_object, merge_witness, target_idempotency_key
    )
    RETURNING promotion_id INTO merge_event;
    RETURN merge_payload || jsonb_build_object(
      'merged', false,
      'overlay_count', 0,
      'merge_event_id', merge_event
    );
  END IF;

  SELECT count(*) INTO overlay_count
  FROM lifeos_runtime.branch_overlay
  WHERE branch_id = source_branch
    AND generation > source_row.parent_generation;
  final_generation := target_row.head_generation + overlay_count;
  UPDATE lifeos_runtime.branch
  SET head_generation = final_generation
  WHERE branch_id = target_branch;
  merge_witness := lifeos_agent.append_branch_witness(
    target_branch, final_generation, 'merge-commit',
    merge_object, merge_shake256
  );

  INSERT INTO lifeos_runtime.branch_overlay (
    branch_id, generation, relation_name, logical_key, logical_key_digest,
    operation, base_digest, record_object_id, row_object_id, row_json,
    execution_id, witness_id
  )
  SELECT
    target_branch,
    target_row.head_generation +
      row_number() OVER (ORDER BY source.generation, source.sequence),
    source.relation_name, source.logical_key, source.logical_key_digest,
    source.operation, source.base_digest, source.record_object_id,
    source.row_object_id, source.row_json, source.execution_id, merge_witness
  FROM lifeos_runtime.branch_overlay source
  WHERE source.branch_id = source_branch
    AND source.generation > source_row.parent_generation
  ORDER BY source.generation, source.sequence;

  INSERT INTO lifeos_runtime.promotion (
    tenant_id, action, source_branch_id, target_branch_id,
    from_generation, to_generation, snapshot_object_id, event_object_id,
    witness_id, idempotency_key
  ) VALUES (
    source_row.tenant_id, 'merge', source_branch, target_branch,
    target_row.head_generation, final_generation, merge_object, merge_object,
    merge_witness, target_idempotency_key
  )
  RETURNING promotion_id INTO merge_event;
  RETURN merge_payload || jsonb_build_object(
    'merged', true,
    'overlay_count', overlay_count,
    'target_generation', final_generation,
    'merge_event_id', merge_event
  );
END
$function$

;

-- lifeos_runtime.merge_branch_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.merge_branch_v2(source_branch uuid, target_branch uuid, target_execution uuid, target_effect uuid, target_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  source_row lifeos_runtime.branch%ROWTYPE;
  target_row lifeos_runtime.branch%ROWTYPE;
  request_state RECORD;
  source_overlay lifeos_runtime.branch_overlay%ROWTYPE;
  target_state RECORD;
  declared_classes TEXT[];
  conflict_class TEXT;
  conflict_ordinal SMALLINT;
  conflict_payload JSONB;
  conflict_record BIGINT;
  conflict_witness UUID;
  new_conflict UUID;
  request_conflict_count BIGINT;
  unresolved_count BIGINT;
  resolution_count BIGINT;
  resolution_operation TEXT;
  resolution_digest BYTEA;
  resolution_json JSONB;
  resolution_object BIGINT;
  replacement_bytes BYTEA;
  apply_result JSONB;
  application_witness UUID;
  resolution_row RECORD;
  snapshot_bytes BYTEA;
  snapshot_object BIGINT;
  snapshot_digest BYTEA;
  merge_payload BIGINT;
  merge_witness UUID;
  merge_promotion UUID;
  result JSONB;
BEGIN
  SELECT * INTO STRICT source_row
  FROM lifeos_runtime.branch
  WHERE branch_id = source_branch;
  SELECT * INTO STRICT target_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  PERFORM lifeos_runtime.require_tenant(source_row.tenant_id);
  IF source_row.tenant_id <> target_row.tenant_id THEN
    RAISE EXCEPTION 'cross-tenant branch merge is forbidden';
  END IF;
  IF source_row.parent_branch_id IS DISTINCT FROM target_branch THEN
    RAISE EXCEPTION 'source branch must be a direct child of the merge target';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      source_row.tenant_id::text || ':merge:'
        || least(source_branch::text, target_branch::text) || ':'
        || greatest(source_branch::text, target_branch::text),
      7002
    )
  );
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    source_row.tenant_id,
    'merge-branch',
    target_idempotency_key,
    jsonb_build_object(
      'source_branch_id', source_branch,
      'source_generation', source_row.head_generation,
      'target_branch_id', target_branch,
      'target_generation', target_row.head_generation
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN request_state.prior_result;
  END IF;
  declared_classes := lifeos_runtime.declared_conflict_classes_v2(
    source_row.policy
  );

  FOR source_overlay IN
    SELECT *
    FROM lifeos_runtime.branch_overlay overlay
    WHERE overlay.branch_id = source_branch
      AND overlay.generation <= source_row.head_generation
    ORDER BY overlay.sequence
  LOOP
    SELECT * INTO target_state
    FROM lifeos_runtime.resolve_branch_record_v2(
      target_branch,
      target_row.head_generation,
      source_overlay.relation_name,
      source_overlay.logical_key
    );
    IF (
      source_overlay.operation = 'insert'
      AND FOUND
      AND target_state.state_exists
    ) OR (
      source_overlay.operation IN ('update', 'delete')
      AND (
        NOT FOUND
        OR NOT target_state.state_exists
        OR source_overlay.base_digest IS DISTINCT FROM target_state.row_digest
      )
    ) THEN
      conflict_ordinal := 0;
      FOREACH conflict_class IN ARRAY declared_classes
      LOOP
        conflict_ordinal := conflict_ordinal + 1;
        IF NOT EXISTS (
          SELECT 1
          FROM lifeos_runtime.merge_conflict conflict
          WHERE conflict.tenant_id = source_row.tenant_id
            AND conflict.request_id = request_state.request_id
            AND conflict.source_overlay_sequence = source_overlay.sequence
            AND conflict.conflict_kind = conflict_class
        ) THEN
          conflict_payload := jsonb_build_object(
            'base_digest', CASE WHEN source_overlay.base_digest IS NULL THEN NULL
                                ELSE encode(source_overlay.base_digest, 'hex') END,
            'conflict_kind', conflict_class,
            'effect_id', target_effect,
            'execution_id', target_execution,
            'logical_key', source_overlay.logical_key,
            'relation_name', source_overlay.relation_name::text,
            'request_id', request_state.request_id,
            'source_branch_id', source_branch,
            'source_overlay_sequence', source_overlay.sequence,
            'target_branch_id', target_branch,
            'tenant_id', source_row.tenant_id
          );
          conflict_record := lifeos_runtime.store_generated_object(
            lifeos_runtime.cow_preimage_v1(
              'merge-conflict',
              conflict_payload
            ),
            'cow-merge-conflict-record-v2'
          );
          conflict_witness := lifeos_agent.append_branch_witness_v2(
            target_branch,
            target_row.head_generation,
            'merge-conflict:' || conflict_class,
            conflict_record,
            jsonb_build_object(
              'effect_id', target_effect,
              'execution_id', target_execution,
              'request_id', request_state.request_id,
              'source_overlay_sequence', source_overlay.sequence
            )
          );
          INSERT INTO lifeos_runtime.merge_conflict (
            tenant_id, source_branch_id, target_branch_id, source_generation,
            target_generation, relation_name, logical_key, logical_key_digest,
            conflict_kind, base_digest, source_object_id, target_object_id,
            record_object_id, witness_id, idempotency_key, request_id,
            execution_id, effect_id, conflict_ordinal,
            source_overlay_sequence
          ) VALUES (
            source_row.tenant_id, source_branch, target_branch,
            source_row.head_generation, target_row.head_generation,
            source_overlay.relation_name, source_overlay.logical_key,
            source_overlay.logical_key_digest, conflict_class,
            source_overlay.base_digest,
            coalesce(source_overlay.row_object_id, source_overlay.record_object_id),
            CASE WHEN FOUND THEN target_state.row_object_id ELSE NULL END,
            conflict_record, conflict_witness,
            request_state.request_id::text || ':' || source_overlay.sequence
              || ':' || conflict_class,
            request_state.request_id, target_execution, target_effect,
            conflict_ordinal, source_overlay.sequence
          )
          RETURNING merge_conflict_id INTO new_conflict;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  SELECT count(*) INTO request_conflict_count
  FROM lifeos_runtime.merge_conflict conflict
  WHERE conflict.request_id = request_state.request_id;
  SELECT count(*) INTO unresolved_count
  FROM lifeos_runtime.merge_conflict conflict
  LEFT JOIN lifeos_runtime.merge_conflict_resolution resolution
    ON resolution.merge_conflict_id = conflict.merge_conflict_id
  WHERE conflict.request_id = request_state.request_id
    AND resolution.resolution_id IS NULL;
  IF unresolved_count > 0 THEN
    RETURN jsonb_build_object(
      'conflict_count', request_conflict_count,
      'merged', false,
      'request_id', request_state.request_id,
      'unresolved_count', unresolved_count
    );
  END IF;

  FOR source_overlay IN
    SELECT *
    FROM lifeos_runtime.branch_overlay overlay
    WHERE overlay.branch_id = source_branch
      AND overlay.generation <= source_row.head_generation
    ORDER BY overlay.sequence
  LOOP
    SELECT
      count(*),
      (array_agg(
        resolution.operation ORDER BY conflict.conflict_ordinal
      ))[1],
      (array_agg(
        resolution.row_digest ORDER BY conflict.conflict_ordinal
      ))[1],
      (array_agg(
        resolution.row_json ORDER BY conflict.conflict_ordinal
      ))[1],
      (array_agg(
        resolution.resolution_object_id ORDER BY conflict.conflict_ordinal
      ))[1]
    INTO
      resolution_count,
      resolution_operation,
      resolution_digest,
      resolution_json,
      resolution_object
    FROM lifeos_runtime.merge_conflict conflict
    JOIN lifeos_runtime.merge_conflict_resolution resolution
      ON resolution.merge_conflict_id = conflict.merge_conflict_id
    WHERE conflict.request_id = request_state.request_id
      AND conflict.source_overlay_sequence = source_overlay.sequence;
    IF resolution_count > 0 THEN
      IF EXISTS (
        SELECT 1
        FROM lifeos_runtime.merge_conflict conflict
        JOIN lifeos_runtime.merge_conflict_resolution resolution
          ON resolution.merge_conflict_id = conflict.merge_conflict_id
        WHERE conflict.request_id = request_state.request_id
          AND conflict.source_overlay_sequence = source_overlay.sequence
          AND (
            resolution.operation IS DISTINCT FROM resolution_operation
            OR resolution.row_digest IS DISTINCT FROM resolution_digest
            OR resolution.row_json IS DISTINCT FROM resolution_json
          )
      ) THEN
        RAISE EXCEPTION
          'all declared conflict-class resolutions for a key must agree';
      END IF;
      IF resolution_operation <> 'delete' THEN
        SELECT raw_bytes INTO STRICT replacement_bytes
        FROM lifeos_blob.object
        WHERE id = resolution_object;
      ELSE
        replacement_bytes := NULL;
      END IF;
      apply_result := lifeos_runtime.append_branch_overlay_internal_v2(
        target_branch,
        source_overlay.relation_name,
        source_overlay.logical_key,
        resolution_operation,
        NULL,
        replacement_bytes,
        resolution_json,
        extensions.gen_random_uuid(),
        target_effect,
        request_state.request_id,
        request_state.request_digest,
        false,
        'merge-resolution-apply'
      );
      application_witness := (apply_result->>'witness_id')::uuid;
      FOR resolution_row IN
        SELECT resolution.resolution_id
        FROM lifeos_runtime.merge_conflict conflict
        JOIN lifeos_runtime.merge_conflict_resolution resolution
          ON resolution.merge_conflict_id = conflict.merge_conflict_id
        WHERE conflict.request_id = request_state.request_id
          AND conflict.source_overlay_sequence = source_overlay.sequence
        ORDER BY conflict.conflict_ordinal
      LOOP
        INSERT INTO lifeos_runtime.merge_conflict_application (
          tenant_id, resolution_id, target_branch_id,
          target_overlay_sequence, witness_id, request_id, execution_id,
          effect_id
        ) VALUES (
          source_row.tenant_id, resolution_row.resolution_id, target_branch,
          (apply_result->>'overlay_sequence')::bigint, application_witness,
          request_state.request_id, target_execution, target_effect
        );
      END LOOP;
    ELSE
      IF source_overlay.row_object_id IS NOT NULL THEN
        SELECT raw_bytes INTO STRICT replacement_bytes
        FROM lifeos_blob.object
        WHERE id = source_overlay.row_object_id;
      ELSE
        replacement_bytes := NULL;
      END IF;
      PERFORM lifeos_runtime.append_branch_overlay_internal_v2(
        target_branch,
        source_overlay.relation_name,
        source_overlay.logical_key,
        source_overlay.operation,
        NULL,
        replacement_bytes,
        source_overlay.row_json,
        extensions.gen_random_uuid(),
        target_effect,
        request_state.request_id,
        request_state.request_digest,
        false,
        'merge-overlay-apply'
      );
    END IF;
  END LOOP;

  SELECT * INTO STRICT target_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  snapshot_bytes := lifeos_runtime.materialize_branch_v2(
    target_branch,
    target_row.head_generation
  );
  snapshot_digest := extensions.ruvector_shake256_256(snapshot_bytes);
  snapshot_object := lifeos_runtime.store_generated_object(
    snapshot_bytes,
    'cow-merge-snapshot-v2'
  );
  merge_payload := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1(
      'merge-event',
      jsonb_build_object(
        'effect_id', target_effect,
        'execution_id', target_execution,
        'request_id', request_state.request_id,
        'snapshot_digest', encode(snapshot_digest, 'hex'),
        'source_branch_id', source_branch,
        'source_generation', source_row.head_generation,
        'target_branch_id', target_branch,
        'target_generation', target_row.head_generation,
        'tenant_id', source_row.tenant_id
      )
    ),
    'cow-merge-event-v2'
  );
  merge_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    target_row.head_generation,
    'branch-merge',
    merge_payload,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'request_id', request_state.request_id
    )
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, action, source_branch_id, target_branch_id, from_generation,
    to_generation, snapshot_object_id, event_object_id, witness_id,
    idempotency_key, execution_id, effect_id, request_digest,
    snapshot_digest
  ) VALUES (
    source_row.tenant_id, 'merge', source_branch, target_branch,
    source_row.head_generation, target_row.head_generation, snapshot_object,
    merge_payload, merge_witness, target_idempotency_key, target_execution,
    target_effect, request_state.request_digest, snapshot_digest
  )
  RETURNING promotion_id INTO merge_promotion;
  result := jsonb_build_object(
    'applied_resolution_count', (
      SELECT count(*)
      FROM lifeos_runtime.merge_conflict_application application
      WHERE application.request_id = request_state.request_id
    ),
    'conflict_count', request_conflict_count,
    'merged', true,
    'promotion_id', merge_promotion,
    'request_id', request_state.request_id,
    'target_generation', target_row.head_generation,
    'witness_id', merge_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    source_row.tenant_id,
    result,
    merge_witness
  );
  RETURN result;
END
$function$

;

-- lifeos_runtime.promote_branch
CREATE OR REPLACE FUNCTION lifeos_runtime.promote_branch(branch_tenant uuid, target_pointer_name text, target_branch uuid, projection_snapshot bytea, promotion_shake256 bytea, target_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  pointer_row lifeos_runtime.branch_pointer%ROWTYPE;
  snapshot_object BIGINT;
  event_object BIGINT;
  event_payload JSONB;
  new_witness UUID;
  new_promotion UUID;
  existing_promotion lifeos_runtime.promotion%ROWTYPE;
  existing_matches BOOLEAN;
BEGIN
  SELECT * INTO existing_promotion
  FROM lifeos_runtime.promotion
  WHERE tenant_id = branch_tenant
    AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    SELECT
      existing_promotion.action = 'promote'
      AND existing_promotion.pointer_name = target_pointer_name
      AND existing_promotion.target_branch_id = target_branch
      AND object.raw_bytes = projection_snapshot
    INTO existing_matches
    FROM lifeos_blob.object object
    WHERE object.id = existing_promotion.snapshot_object_id;
    IF NOT coalesce(existing_matches, false) THEN
      RAISE EXCEPTION 'branch-promotion idempotency collision';
    END IF;
    RETURN existing_promotion.promotion_id;
  END IF;

  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
    AND tenant_id = branch_tenant
  FOR SHARE;
  IF NOT lifeos_runtime.branch_gates_satisfied(target_branch) THEN
    RAISE EXCEPTION 'branch promotion gates are not satisfied';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM lifeos_runtime.merge_conflict conflict
    LEFT JOIN lifeos_runtime.merge_conflict_resolution resolution
      ON resolution.merge_conflict_id = conflict.merge_conflict_id
    WHERE conflict.source_branch_id = target_branch
      AND resolution.resolution_id IS NULL
  ) THEN
    RAISE EXCEPTION 'branch has unresolved merge conflicts';
  END IF;

  SELECT * INTO pointer_row
  FROM lifeos_runtime.branch_pointer
  WHERE tenant_id = branch_tenant
    AND pointer_name = target_pointer_name
  FOR UPDATE;
  snapshot_object := lifeos_runtime.store_generated_object(
    projection_snapshot, 'cow-promotion-snapshot'
  );
  event_payload := jsonb_build_object(
    'action', 'promote',
    'tenant_id', branch_tenant,
    'pointer_name', target_pointer_name,
    'branch_id', target_branch,
    'generation', branch_row.head_generation,
    'snapshot_object_id', snapshot_object,
    'idempotency_key', target_idempotency_key
  );
  event_object := lifeos_runtime.store_generated_object(
    convert_to(event_payload::text, 'UTF8'), 'cow-promotion-record'
  );
  new_witness := lifeos_agent.append_branch_witness(
    target_branch, branch_row.head_generation, 'branch-promotion',
    event_object, promotion_shake256
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, pointer_name, action, previous_promotion_id,
    source_branch_id, target_branch_id, from_generation, to_generation,
    snapshot_object_id, event_object_id, witness_id, idempotency_key
  ) VALUES (
    branch_tenant, target_pointer_name, 'promote',
    pointer_row.active_promotion_id, pointer_row.branch_id, target_branch,
    pointer_row.generation, branch_row.head_generation, snapshot_object,
    event_object, new_witness, target_idempotency_key
  )
  RETURNING promotion_id INTO new_promotion;

  INSERT INTO lifeos_runtime.branch_pointer (
    tenant_id, pointer_name, branch_id, generation, snapshot_object_id,
    active_promotion_id, witness_id
  ) VALUES (
    branch_tenant, target_pointer_name, target_branch,
    branch_row.head_generation, snapshot_object, new_promotion, new_witness
  )
  ON CONFLICT (tenant_id, pointer_name) DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    generation = EXCLUDED.generation,
    snapshot_object_id = EXCLUDED.snapshot_object_id,
    active_promotion_id = EXCLUDED.active_promotion_id,
    witness_id = EXCLUDED.witness_id,
    updated_at = clock_timestamp();
  RETURN new_promotion;
END
$function$

;

-- lifeos_runtime.promote_branch_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.promote_branch_v2(branch_tenant uuid, target_pointer_name text, target_branch uuid, target_execution uuid, target_effect uuid, target_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  pointer_row lifeos_runtime.branch_pointer%ROWTYPE;
  request_state RECORD;
  snapshot_bytes BYTEA;
  snapshot_object BIGINT;
  snapshot_digest BYTEA;
  event_payload JSONB;
  event_object BIGINT;
  new_witness UUID;
  new_promotion UUID;
  result JSONB;
BEGIN
  PERFORM lifeos_runtime.require_tenant(branch_tenant);
  IF btrim(coalesce(target_pointer_name, '')) = '' THEN
    RAISE EXCEPTION 'promotion pointer name is required';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      branch_tenant::text || ':pointer:' || target_pointer_name,
      7003
    )
  );
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  IF branch_row.tenant_id <> branch_tenant THEN
    RAISE EXCEPTION 'promotion branch is outside the requested tenant';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    branch_tenant,
    'promote-branch',
    target_idempotency_key,
    jsonb_build_object(
      'branch_id', target_branch,
      'generation', branch_row.head_generation,
      'pointer_name', target_pointer_name
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'promotion_id')::uuid;
  END IF;
  IF NOT lifeos_runtime.branch_gates_satisfied_v2(target_branch) THEN
    RAISE EXCEPTION
      'all baseline and policy gates must pass at the exact branch head';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM lifeos_runtime.merge_conflict conflict
    LEFT JOIN lifeos_runtime.merge_conflict_resolution resolution
      ON resolution.merge_conflict_id = conflict.merge_conflict_id
    LEFT JOIN lifeos_runtime.merge_conflict_application application
      ON application.resolution_id = resolution.resolution_id
    WHERE conflict.tenant_id = branch_tenant
      AND (
        conflict.source_branch_id = target_branch
        OR conflict.target_branch_id = target_branch
      )
      AND application.application_id IS NULL
  ) THEN
    RAISE EXCEPTION 'branch has unresolved or unapplied merge conflicts';
  END IF;
  snapshot_bytes := lifeos_runtime.materialize_branch_v2(
    target_branch,
    branch_row.head_generation
  );
  snapshot_digest := extensions.ruvector_shake256_256(snapshot_bytes);
  snapshot_object := lifeos_runtime.store_generated_object(
    snapshot_bytes,
    'cow-promotion-snapshot-v2'
  );
  SELECT * INTO pointer_row
  FROM lifeos_runtime.branch_pointer pointer
  WHERE pointer.tenant_id = branch_tenant
    AND pointer.pointer_name = target_pointer_name
  FOR UPDATE;
  event_payload := jsonb_build_object(
    'branch_id', target_branch,
    'effect_id', target_effect,
    'execution_id', target_execution,
    'generation', branch_row.head_generation,
    'pointer_name', target_pointer_name,
    'previous_promotion_id', pointer_row.active_promotion_id,
    'request_id', request_state.request_id,
    'snapshot_digest', encode(snapshot_digest, 'hex'),
    'tenant_id', branch_tenant
  );
  event_object := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1('promotion-event', event_payload),
    'cow-promotion-event-v2'
  );
  new_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    branch_row.head_generation,
    'branch-promotion',
    event_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'pointer_name', target_pointer_name,
      'request_id', request_state.request_id,
      'snapshot_digest', encode(snapshot_digest, 'hex')
    )
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, pointer_name, action, previous_promotion_id, source_branch_id,
    target_branch_id, from_generation, to_generation, snapshot_object_id,
    event_object_id, witness_id, idempotency_key, execution_id, effect_id,
    request_digest, snapshot_digest
  ) VALUES (
    branch_tenant, target_pointer_name, 'promote',
    pointer_row.active_promotion_id,
    CASE WHEN pointer_row.branch_id IS NULL THEN NULL ELSE pointer_row.branch_id END,
    target_branch,
    CASE WHEN pointer_row.branch_id IS NULL THEN NULL
         ELSE pointer_row.generation END,
    branch_row.head_generation, snapshot_object, event_object, new_witness,
    target_idempotency_key, target_execution, target_effect,
    request_state.request_digest, snapshot_digest
  )
  RETURNING promotion_id INTO new_promotion;
  INSERT INTO lifeos_runtime.branch_pointer (
    tenant_id, pointer_name, branch_id, generation, snapshot_object_id,
    active_promotion_id, witness_id
  ) VALUES (
    branch_tenant, target_pointer_name, target_branch,
    branch_row.head_generation, snapshot_object, new_promotion, new_witness
  )
  ON CONFLICT (tenant_id, pointer_name) DO UPDATE
  SET branch_id = EXCLUDED.branch_id,
      generation = EXCLUDED.generation,
      snapshot_object_id = EXCLUDED.snapshot_object_id,
      active_promotion_id = EXCLUDED.active_promotion_id,
      witness_id = EXCLUDED.witness_id,
      updated_at = clock_timestamp();
  result := jsonb_build_object(
    'promotion_id', new_promotion,
    'snapshot_digest', encode(snapshot_digest, 'hex'),
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    branch_tenant,
    result,
    new_witness
  );
  RETURN new_promotion;
END
$function$

;

-- lifeos_runtime.put_canonical_projection_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.put_canonical_projection_v2(target_tenant uuid, target_relation regclass, target_key jsonb, target_operation text, target_base_digest bytea, replacement_bytes bytea, replacement_json jsonb, target_execution uuid, target_effect uuid, target_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime'
AS $function$
DECLARE
  request_state RECORD;
  key_digest BYTEA;
  current_row lifeos_runtime.canonical_projection%ROWTYPE;
  current_exists BOOLEAN := false;
  row_object BIGINT;
  row_digest BYTEA;
  record_payload JSONB;
  record_bytes BYTEA;
  record_object BIGINT;
  record_digest BYTEA;
  new_sequence BIGINT;
  result JSONB;
BEGIN
  key_digest := extensions.digest(convert_to(target_key::text, 'UTF8'), 'sha256');
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    target_tenant,
    'put-canonical-projection',
    target_idempotency_key,
    jsonb_build_object(
      'base_digest', CASE WHEN target_base_digest IS NULL THEN NULL
                          ELSE encode(target_base_digest, 'hex') END,
      'logical_key', target_key,
      'operation', target_operation,
      'relation_name', target_relation::text,
      'replacement_bytes', CASE WHEN replacement_bytes IS NULL THEN NULL
                                ELSE encode(replacement_bytes, 'hex') END,
      'replacement_json', replacement_json
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN request_state.prior_result;
  END IF;
  IF jsonb_typeof(target_key) <> 'object'
     OR target_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'invalid canonical projection operation';
  END IF;
  IF target_base_digest IS NOT NULL
     AND octet_length(target_base_digest) <> 32 THEN
    RAISE EXCEPTION 'base digest must contain exactly 32 bytes';
  END IF;
  IF target_operation = 'delete'
     AND (replacement_bytes IS NOT NULL OR replacement_json IS NOT NULL) THEN
    RAISE EXCEPTION 'delete operations cannot contain replacement data';
  END IF;
  IF target_operation <> 'delete' AND replacement_bytes IS NULL THEN
    RAISE EXCEPTION 'insert and update operations require replacement bytes';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      target_tenant::text || ':' || target_relation::text || ':'
        || encode(key_digest, 'hex'),
      7001
    )
  );
  SELECT * INTO current_row
  FROM lifeos_runtime.canonical_projection projection
  WHERE projection.tenant_id = target_tenant
    AND projection.relation_name = target_relation
    AND projection.logical_key_digest = key_digest
  ORDER BY projection.canonical_sequence DESC
  LIMIT 1;
  current_exists := FOUND AND current_row.operation <> 'delete';

  IF target_operation = 'insert' THEN
    IF current_exists OR target_base_digest IS NOT NULL THEN
      RAISE EXCEPTION
        'canonical insert requires an absent key and NULL base digest';
    END IF;
  ELSE
    IF NOT current_exists THEN
      RAISE EXCEPTION
        'canonical % requires an existing key',
        target_operation;
    END IF;
    IF target_base_digest IS NULL
       OR target_base_digest <> current_row.row_digest THEN
      RAISE EXCEPTION
        'canonical % base digest precondition failed',
        target_operation;
    END IF;
  END IF;

  IF replacement_bytes IS NOT NULL THEN
    row_object := lifeos_runtime.store_generated_object(
      replacement_bytes,
      'cow-canonical-row'
    );
    row_digest := extensions.ruvector_shake256_256(replacement_bytes);
  END IF;
  PERFORM lifeos_rvf.stable_vector_id_v2(
    target_tenant,
    target_relation,
    key_digest
  );
  record_payload := jsonb_build_object(
    'base_digest', CASE WHEN target_base_digest IS NULL THEN NULL
                        ELSE encode(target_base_digest, 'hex') END,
    'effect_id', target_effect,
    'execution_id', target_execution,
    'logical_key', target_key,
    'logical_key_digest', encode(key_digest, 'hex'),
    'operation', target_operation,
    'relation_name', target_relation::text,
    'request_id', request_state.request_id,
    'row_digest', CASE WHEN row_digest IS NULL THEN NULL
                       ELSE encode(row_digest, 'hex') END,
    'tenant_id', target_tenant
  );
  record_bytes := lifeos_runtime.cow_preimage_v1(
    'canonical-projection-record',
    record_payload
  );
  record_object := lifeos_runtime.store_generated_object(
    record_bytes,
    'cow-canonical-record-v1'
  );
  record_digest := extensions.ruvector_shake256_256(record_bytes);
  INSERT INTO lifeos_runtime.canonical_projection (
    tenant_id, relation_name, logical_key, logical_key_digest, operation,
    base_digest, row_object_id, row_json, row_digest, record_object_id,
    record_digest, request_id, execution_id, effect_id
  ) VALUES (
    target_tenant, target_relation, target_key, key_digest, target_operation,
    target_base_digest, row_object, replacement_json, row_digest, record_object,
    record_digest, request_state.request_id, target_execution, target_effect
  )
  RETURNING canonical_sequence INTO new_sequence;
  result := jsonb_build_object(
    'canonical_sequence', new_sequence,
    'record_digest', encode(record_digest, 'hex'),
    'row_digest', CASE WHEN row_digest IS NULL THEN NULL
                       ELSE encode(row_digest, 'hex') END
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    target_tenant,
    result
  );
  RETURN result;
END
$function$

;

-- lifeos_runtime.record_cow_acceptance_receipt_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.record_cow_acceptance_receipt_v2(target_receipt_kind text, target_suite_version text, target_accepted boolean, evidence_bytes bytea, target_execution uuid, target_effect uuid, target_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime'
AS $function$
DECLARE
  expected_suite TEXT;
  evidence_object BIGINT;
  evidence_digest BYTEA;
  receipt_payload JSONB;
  receipt_preimage BYTEA;
  receipt_preimage_object BIGINT;
  receipt_digest BYTEA;
  receipt_row lifeos_runtime.cow_acceptance_receipt%ROWTYPE;
  new_receipt UUID;
BEGIN
  expected_suite := CASE target_receipt_kind
    WHEN 'database-semantics' THEN 'lifeos.cow-db-semantic-suite.v1'
    WHEN 'native-rvf-roundtrip' THEN
      'lifeos.native-rvf-postgres-roundtrip.v1'
    ELSE NULL
  END;
  IF expected_suite IS NULL OR target_suite_version <> expected_suite THEN
    RAISE EXCEPTION 'unsupported COW acceptance receipt contract';
  END IF;
  IF evidence_bytes IS NULL
     OR target_execution IS NULL
     OR target_effect IS NULL
     OR btrim(coalesce(target_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'complete acceptance receipt evidence is required';
  END IF;
  evidence_object := lifeos_runtime.store_generated_object(
    evidence_bytes,
    'cow-acceptance-evidence-v1'
  );
  evidence_digest := extensions.ruvector_shake256_256(evidence_bytes);
  receipt_payload := jsonb_build_object(
    'accepted', target_accepted,
    'effect_id', target_effect,
    'evidence_digest', encode(evidence_digest, 'hex'),
    'execution_id', target_execution,
    'idempotency_key', target_idempotency_key,
    'receipt_kind', target_receipt_kind,
    'receipt_schema_version', 1,
    'suite_version', target_suite_version
  );
  receipt_preimage := lifeos_runtime.cow_preimage_v1(
    'acceptance-receipt',
    receipt_payload
  );
  receipt_preimage_object := lifeos_runtime.store_generated_object(
    receipt_preimage,
    'cow-acceptance-receipt-preimage-v1'
  );
  receipt_digest := extensions.ruvector_shake256_256(receipt_preimage);
  SELECT * INTO receipt_row
  FROM lifeos_runtime.cow_acceptance_receipt receipt
  WHERE receipt.receipt_kind = target_receipt_kind
    AND receipt.suite_version = target_suite_version
    AND receipt.idempotency_key = target_idempotency_key;
  IF FOUND THEN
    IF receipt_row.accepted IS DISTINCT FROM target_accepted
       OR receipt_row.evidence_digest <> evidence_digest
       OR receipt_row.receipt_digest <> receipt_digest
       OR receipt_row.execution_id <> target_execution
       OR receipt_row.effect_id <> target_effect
       OR NOT EXISTS (
         SELECT 1 FROM lifeos_blob.object object
         WHERE object.id = receipt_row.evidence_object_id
           AND object.raw_bytes = evidence_bytes
       )
       OR NOT EXISTS (
         SELECT 1 FROM lifeos_blob.object object
         WHERE object.id = receipt_row.receipt_preimage_object_id
           AND object.raw_bytes = receipt_preimage
       ) THEN
      RAISE EXCEPTION 'acceptance receipt full-input idempotency collision';
    END IF;
    RETURN receipt_row.receipt_id;
  END IF;
  INSERT INTO lifeos_runtime.cow_acceptance_receipt (
    receipt_schema_version, receipt_kind, suite_version, accepted,
    evidence_object_id, evidence_digest, receipt_preimage_object_id,
    receipt_digest, execution_id, effect_id, idempotency_key
  ) VALUES (
    1, target_receipt_kind, target_suite_version, target_accepted,
    evidence_object, evidence_digest, receipt_preimage_object, receipt_digest,
    target_execution, target_effect, target_idempotency_key
  )
  RETURNING receipt_id INTO new_receipt;
  RETURN new_receipt;
END
$function$

;

-- lifeos_runtime.record_merge_gate
CREATE OR REPLACE FUNCTION lifeos_runtime.record_merge_gate(target_branch uuid, target_gate_kind text, target_passed boolean, evidence_bytes bytea, gate_shake256 bytea, target_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_head BIGINT;
  evidence_object BIGINT;
  evidence_sha256 BYTEA;
  new_witness UUID;
  new_gate UUID;
  existing_gate lifeos_runtime.merge_gate%ROWTYPE;
  existing_matches BOOLEAN;
BEGIN
  SELECT * INTO existing_gate
  FROM lifeos_runtime.merge_gate
  WHERE branch_id = target_branch
    AND gate_kind = target_gate_kind
    AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    SELECT raw_bytes = evidence_bytes
      AND existing_gate.passed = target_passed
    INTO existing_matches
    FROM lifeos_blob.object
    WHERE id = existing_gate.evidence_object_id;
    IF NOT coalesce(existing_matches, false) THEN
      RAISE EXCEPTION 'merge-gate idempotency collision';
    END IF;
    RETURN existing_gate.merge_gate_id;
  END IF;

  SELECT head_generation INTO STRICT branch_head
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  evidence_object := lifeos_runtime.store_generated_object(
    evidence_bytes, 'cow-merge-gate-evidence'
  );
  evidence_sha256 := extensions.digest(evidence_bytes, 'sha256');
  new_witness := lifeos_agent.append_branch_witness(
    target_branch, branch_head, 'merge-gate:' || target_gate_kind,
    evidence_object, gate_shake256
  );
  INSERT INTO lifeos_runtime.merge_gate (
    branch_id, generation, gate_kind, passed, evidence_object_id,
    evidence_digest, witness_id, idempotency_key
  ) VALUES (
    target_branch, branch_head, target_gate_kind, target_passed,
    evidence_object, evidence_sha256, new_witness, target_idempotency_key
  )
  RETURNING merge_gate_id INTO new_gate;
  RETURN new_gate;
END
$function$

;

-- lifeos_runtime.record_merge_gate_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.record_merge_gate_v2(target_branch uuid, target_gate_kind text, target_passed boolean, evidence_bytes bytea, target_execution uuid, target_effect uuid, target_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  request_state RECORD;
  evidence_object BIGINT;
  evidence_digest BYTEA;
  new_witness UUID;
  new_gate UUID;
  result JSONB;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF btrim(coalesce(target_gate_kind, '')) = '' OR evidence_bytes IS NULL THEN
    RAISE EXCEPTION 'gate kind and evidence bytes are required';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    branch_row.tenant_id,
    'record-merge-gate',
    target_idempotency_key,
    jsonb_build_object(
      'branch_id', target_branch,
      'evidence_bytes', encode(evidence_bytes, 'hex'),
      'gate_kind', target_gate_kind,
      'generation', branch_row.head_generation,
      'passed', target_passed
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'merge_gate_id')::uuid;
  END IF;
  evidence_object := lifeos_runtime.store_generated_object(
    evidence_bytes,
    'cow-merge-gate-evidence-v2'
  );
  evidence_digest := extensions.ruvector_shake256_256(evidence_bytes);
  new_witness := lifeos_agent.append_branch_witness_v2(
    target_branch,
    branch_row.head_generation,
    'merge-gate:' || target_gate_kind,
    evidence_object,
    jsonb_build_object(
      'effect_id', target_effect,
      'evidence_digest', encode(evidence_digest, 'hex'),
      'execution_id', target_execution,
      'passed', target_passed,
      'request_id', request_state.request_id
    )
  );
  INSERT INTO lifeos_runtime.merge_gate (
    tenant_id, branch_id, generation, gate_kind, passed, evidence_object_id,
    evidence_digest, witness_id, idempotency_key, execution_id, effect_id,
    request_digest
  ) VALUES (
    branch_row.tenant_id, target_branch, branch_row.head_generation,
    target_gate_kind, target_passed, evidence_object, evidence_digest,
    new_witness, target_idempotency_key, target_execution, target_effect,
    request_state.request_digest
  )
  RETURNING merge_gate_id INTO new_gate;
  result := jsonb_build_object(
    'merge_gate_id', new_gate,
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    branch_row.tenant_id,
    result,
    new_witness
  );
  RETURN new_gate;
END
$function$

;

-- lifeos_runtime.resolve_branch_record_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_branch_record_v2(target_branch uuid, target_generation bigint, target_relation regclass, target_key jsonb)
 RETURNS TABLE(state_exists boolean, source_kind text, source_branch_id uuid, source_depth integer, operation text, row_object_id bigint, row_json jsonb, row_digest bytea, logical_key_digest bytea)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime'
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch;
  PERFORM lifeos_runtime.require_tenant(branch_row.tenant_id);
  IF target_generation < 0 OR target_generation > branch_row.head_generation THEN
    RAISE EXCEPTION
      'requested generation % is outside branch head %',
      target_generation,
      branch_row.head_generation;
  END IF;
  RETURN QUERY
  WITH RECURSIVE ancestry AS (
    SELECT
      branch.branch_id,
      0 AS depth,
      target_generation AS generation_ceiling,
      branch.parent_branch_id,
      branch.parent_generation
    FROM lifeos_runtime.branch branch
    WHERE branch.branch_id = target_branch
    UNION ALL
    SELECT
      parent.branch_id,
      ancestry.depth + 1,
      least(ancestry.parent_generation, parent.head_generation),
      parent.parent_branch_id,
      parent.parent_generation
    FROM ancestry
    JOIN lifeos_runtime.branch parent
      ON parent.branch_id = ancestry.parent_branch_id
  ),
  selected_overlay AS (
    SELECT
      overlay.operation,
      overlay.row_object_id,
      overlay.row_json,
      overlay.logical_key_digest,
      overlay.branch_id,
      ancestry.depth
    FROM ancestry
    JOIN lifeos_runtime.branch_overlay overlay
      ON overlay.branch_id = ancestry.branch_id
     AND overlay.generation <= ancestry.generation_ceiling
    WHERE overlay.relation_name = target_relation
      AND overlay.logical_key_digest = extensions.digest(
        convert_to(target_key::text, 'UTF8'),
        'sha256'
      )
      AND overlay.logical_key = target_key
    ORDER BY ancestry.depth, overlay.generation DESC, overlay.sequence DESC
    LIMIT 1
  ),
  selected_canonical AS (
    SELECT
      projection.operation,
      projection.row_object_id,
      projection.row_json,
      projection.row_digest,
      projection.logical_key_digest
    FROM lifeos_runtime.canonical_projection projection
    WHERE projection.tenant_id = branch_row.tenant_id
      AND projection.relation_name = target_relation
      AND projection.logical_key_digest = extensions.digest(
        convert_to(target_key::text, 'UTF8'),
        'sha256'
      )
      AND projection.logical_key = target_key
      AND projection.canonical_sequence <= branch_row.canonical_ceiling
    ORDER BY projection.canonical_sequence DESC
    LIMIT 1
  )
  SELECT
    overlay.operation <> 'delete',
    'overlay'::text,
    overlay.branch_id,
    overlay.depth,
    overlay.operation,
    overlay.row_object_id,
    overlay.row_json,
    CASE
      WHEN overlay.operation = 'delete' THEN NULL
      ELSE extensions.ruvector_shake256_256(object.raw_bytes)
    END,
    overlay.logical_key_digest
  FROM selected_overlay overlay
  LEFT JOIN lifeos_blob.object object ON object.id = overlay.row_object_id
  UNION ALL
  SELECT
    canonical.operation <> 'delete',
    'canonical'::text,
    NULL::uuid,
    NULL::integer,
    canonical.operation,
    canonical.row_object_id,
    canonical.row_json,
    canonical.row_digest,
    canonical.logical_key_digest
  FROM selected_canonical canonical
  WHERE NOT EXISTS (SELECT 1 FROM selected_overlay);
END
$function$

;

-- lifeos_runtime.resolve_merge_conflict
CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_merge_conflict(target_conflict uuid, resolution_bytes bytea, resolution_shake256 bytea, target_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  conflict_row lifeos_runtime.merge_conflict%ROWTYPE;
  resolution_object BIGINT;
  new_witness UUID;
  new_resolution UUID;
  existing_resolution lifeos_runtime.merge_conflict_resolution%ROWTYPE;
  existing_matches BOOLEAN;
BEGIN
  SELECT * INTO STRICT conflict_row
  FROM lifeos_runtime.merge_conflict
  WHERE merge_conflict_id = target_conflict
  FOR SHARE;

  SELECT * INTO existing_resolution
  FROM lifeos_runtime.merge_conflict_resolution
  WHERE merge_conflict_id = target_conflict;
  IF FOUND THEN
    SELECT object.raw_bytes = resolution_bytes
      AND existing_resolution.idempotency_key = target_idempotency_key
    INTO existing_matches
    FROM lifeos_blob.object object
    WHERE object.id = existing_resolution.resolution_object_id;
    IF NOT coalesce(existing_matches, false) THEN
      RAISE EXCEPTION 'merge-conflict resolution idempotency collision';
    END IF;
    RETURN existing_resolution.resolution_id;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM lifeos_runtime.merge_conflict_resolution
    WHERE idempotency_key = target_idempotency_key
  ) THEN
    RAISE EXCEPTION 'merge-conflict resolution idempotency collision';
  END IF;

  resolution_object := lifeos_runtime.store_generated_object(
    resolution_bytes, 'cow-merge-conflict-resolution'
  );
  new_witness := lifeos_agent.append_branch_witness(
    conflict_row.target_branch_id,
    conflict_row.target_generation,
    'merge-conflict-resolution',
    resolution_object,
    resolution_shake256
  );
  INSERT INTO lifeos_runtime.merge_conflict_resolution (
    merge_conflict_id, resolution_object_id, witness_id, idempotency_key
  ) VALUES (
    target_conflict, resolution_object, new_witness, target_idempotency_key
  )
  RETURNING resolution_id INTO new_resolution;
  RETURN new_resolution;
END
$function$

;

-- lifeos_runtime.resolve_merge_conflict_v2
CREATE OR REPLACE FUNCTION lifeos_runtime.resolve_merge_conflict_v2(target_conflict uuid, target_operation text, resolution_bytes bytea, resolution_json jsonb, target_execution uuid, target_effect uuid, target_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  conflict_row lifeos_runtime.merge_conflict%ROWTYPE;
  target_head BIGINT;
  request_state RECORD;
  resolution_object BIGINT;
  resolution_record BIGINT;
  resolution_digest BYTEA;
  resolution_payload JSONB;
  new_witness UUID;
  new_resolution UUID;
  result JSONB;
BEGIN
  SELECT * INTO STRICT conflict_row
  FROM lifeos_runtime.merge_conflict
  WHERE merge_conflict_id = target_conflict
  FOR SHARE;
  PERFORM lifeos_runtime.require_tenant(conflict_row.tenant_id);
  IF target_operation NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'invalid merge-conflict resolution operation';
  END IF;
  IF target_operation = 'delete'
     AND (resolution_bytes IS NOT NULL OR resolution_json IS NOT NULL) THEN
    RAISE EXCEPTION 'delete resolutions cannot contain replacement data';
  END IF;
  IF target_operation <> 'delete' AND resolution_bytes IS NULL THEN
    RAISE EXCEPTION 'insert and update resolutions require bytes';
  END IF;
  SELECT * INTO request_state
  FROM lifeos_runtime.begin_cow_request_v2(
    conflict_row.tenant_id,
    'resolve-merge-conflict',
    target_idempotency_key,
    jsonb_build_object(
      'conflict_id', target_conflict,
      'operation', target_operation,
      'resolution_bytes', CASE WHEN resolution_bytes IS NULL THEN NULL
                               ELSE encode(resolution_bytes, 'hex') END,
      'resolution_json', resolution_json
    ),
    target_execution,
    target_effect
  );
  IF request_state.replayed THEN
    RETURN (request_state.prior_result->>'resolution_id')::uuid;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM lifeos_runtime.merge_conflict_resolution resolution
    WHERE resolution.merge_conflict_id = target_conflict
  ) THEN
    RAISE EXCEPTION 'merge conflict already has a different resolution request';
  END IF;
  IF resolution_bytes IS NOT NULL THEN
    resolution_object := lifeos_runtime.store_generated_object(
      resolution_bytes,
      'cow-conflict-resolution-row-v2'
    );
    resolution_digest := extensions.ruvector_shake256_256(resolution_bytes);
  END IF;
  resolution_payload := jsonb_build_object(
    'conflict_id', target_conflict,
    'conflict_kind', conflict_row.conflict_kind,
    'effect_id', target_effect,
    'execution_id', target_execution,
    'operation', target_operation,
    'request_id', request_state.request_id,
    'row_digest', CASE WHEN resolution_digest IS NULL THEN NULL
                       ELSE encode(resolution_digest, 'hex') END,
    'tenant_id', conflict_row.tenant_id
  );
  resolution_record := lifeos_runtime.store_generated_object(
    lifeos_runtime.cow_preimage_v1(
      'merge-conflict-resolution',
      resolution_payload
    ),
    'cow-conflict-resolution-record-v2'
  );
  SELECT head_generation INTO STRICT target_head
  FROM lifeos_runtime.branch
  WHERE branch_id = conflict_row.target_branch_id;
  new_witness := lifeos_agent.append_branch_witness_v2(
    conflict_row.target_branch_id,
    target_head,
    'merge-conflict-resolution:' || conflict_row.conflict_kind,
    resolution_record,
    jsonb_build_object(
      'effect_id', target_effect,
      'execution_id', target_execution,
      'request_id', request_state.request_id
    )
  );
  INSERT INTO lifeos_runtime.merge_conflict_resolution (
    tenant_id, merge_conflict_id, resolution_object_id, witness_id,
    idempotency_key, operation, row_json, row_digest, execution_id,
    effect_id, request_digest
  ) VALUES (
    conflict_row.tenant_id, target_conflict,
    coalesce(resolution_object, resolution_record), new_witness,
    target_idempotency_key, target_operation, resolution_json,
    resolution_digest, target_execution, target_effect,
    request_state.request_digest
  )
  RETURNING resolution_id INTO new_resolution;
  result := jsonb_build_object(
    'resolution_id', new_resolution,
    'witness_id', new_witness
  );
  PERFORM lifeos_runtime.complete_cow_request_v2(
    request_state.request_id,
    conflict_row.tenant_id,
    result,
    new_witness
  );
  RETURN new_resolution;
END
$function$

;

-- lifeos_runtime.rollback_branch
CREATE OR REPLACE FUNCTION lifeos_runtime.rollback_branch(branch_tenant uuid, target_pointer_name text, target_promotion uuid, rollback_shake256 bytea, target_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'lifeos_runtime', 'lifeos_agent'
AS $function$
DECLARE
  pointer_row lifeos_runtime.branch_pointer%ROWTYPE;
  target_row lifeos_runtime.promotion%ROWTYPE;
  event_payload JSONB;
  event_object BIGINT;
  new_witness UUID;
  new_promotion UUID;
  existing_promotion lifeos_runtime.promotion%ROWTYPE;
  existing_target lifeos_runtime.promotion%ROWTYPE;
BEGIN
  SELECT * INTO existing_promotion
  FROM lifeos_runtime.promotion
  WHERE tenant_id = branch_tenant
    AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    SELECT * INTO existing_target
    FROM lifeos_runtime.promotion
    WHERE promotion_id = target_promotion
      AND tenant_id = branch_tenant
      AND pointer_name = target_pointer_name
      AND action IN ('promote', 'rollback');
    IF existing_target.promotion_id IS NULL
       OR existing_promotion.action <> 'rollback'
       OR existing_promotion.pointer_name <> target_pointer_name
       OR existing_promotion.target_branch_id
          IS DISTINCT FROM existing_target.target_branch_id
       OR existing_promotion.to_generation
          IS DISTINCT FROM existing_target.to_generation
       OR existing_promotion.snapshot_object_id
          IS DISTINCT FROM existing_target.snapshot_object_id THEN
      RAISE EXCEPTION 'branch-rollback idempotency collision';
    END IF;
    RETURN existing_promotion.promotion_id;
  END IF;

  SELECT * INTO STRICT pointer_row
  FROM lifeos_runtime.branch_pointer
  WHERE tenant_id = branch_tenant
    AND pointer_name = target_pointer_name
  FOR UPDATE;
  SELECT * INTO STRICT target_row
  FROM lifeos_runtime.promotion
  WHERE promotion_id = target_promotion
    AND tenant_id = branch_tenant
    AND pointer_name = target_pointer_name
    AND action IN ('promote', 'rollback');

  event_payload := jsonb_build_object(
    'action', 'rollback',
    'tenant_id', branch_tenant,
    'pointer_name', target_pointer_name,
    'target_promotion_id', target_promotion,
    'branch_id', target_row.target_branch_id,
    'generation', target_row.to_generation,
    'snapshot_object_id', target_row.snapshot_object_id,
    'idempotency_key', target_idempotency_key
  );
  event_object := lifeos_runtime.store_generated_object(
    convert_to(event_payload::text, 'UTF8'), 'cow-rollback-record'
  );
  new_witness := lifeos_agent.append_branch_witness(
    target_row.target_branch_id, target_row.to_generation,
    'branch-rollback', event_object, rollback_shake256
  );
  INSERT INTO lifeos_runtime.promotion (
    tenant_id, pointer_name, action, previous_promotion_id,
    source_branch_id, target_branch_id, from_generation, to_generation,
    snapshot_object_id, event_object_id, witness_id, idempotency_key
  ) VALUES (
    branch_tenant, target_pointer_name, 'rollback',
    pointer_row.active_promotion_id, pointer_row.branch_id,
    target_row.target_branch_id, pointer_row.generation,
    target_row.to_generation, target_row.snapshot_object_id,
    event_object, new_witness, target_idempotency_key
  )
  RETURNING promotion_id INTO new_promotion;

  UPDATE lifeos_runtime.branch_pointer
  SET branch_id = target_row.target_branch_id,
      generation = target_row.to_generation,
      snapshot_object_id = target_row.snapshot_object_id,
      active_promotion_id = new_promotion,
      witness_id = new_witness,
      updated_at = clock_timestamp()
  WHERE tenant_id = branch_tenant
    AND pointer_name = target_pointer_name;
  RETURN new_promotion;
END
$function$

;

-- lifeos_rvf.assert_container
CREATE OR REPLACE FUNCTION lifeos_rvf.assert_container(p_container_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_rvf', 'lifeos_security'
AS $function$
DECLARE
  container_row lifeos_rvf.container%ROWTYPE;
  container_bytes bytea;
  manifest_count bigint;
  expected_segment_count bigint;
  segment_row record;
  previous_end bigint := 0;
  segment_bytes bytea;
BEGIN
  SELECT * INTO STRICT container_row FROM lifeos_rvf.container
  WHERE container_id = p_container_id
    AND tenant_id = lifeos_security.current_tenant();
  container_bytes := lifeos_blob.load_object_bytes(container_row.object_id);
  IF octet_length(container_bytes)::bigint <> container_row.file_length
     OR extensions.digest(container_bytes,'sha256') <> container_row.sha256
     OR extensions.ruvector_shake256_256(container_bytes) <> container_row.shake256 THEN
    RAISE EXCEPTION 'RVF container bytes do not match its canonical identity';
  END IF;
  SELECT count(*), coalesce(max(manifest_row.segment_count),0)
    INTO manifest_count, expected_segment_count
  FROM lifeos_rvf.manifest manifest_row
  WHERE manifest_row.container_id = p_container_id;
  IF manifest_count <> 1 THEN
    RAISE EXCEPTION 'RVF container requires exactly one active manifest';
  END IF;
  IF expected_segment_count <> (SELECT count(*) FROM lifeos_rvf.segment
                        WHERE container_id = p_container_id) THEN
    RAISE EXCEPTION 'RVF manifest segment count differs from the directory';
  END IF;
  IF (SELECT count(*) FROM lifeos_rvf.segment_directory
      WHERE container_id = p_container_id) <> expected_segment_count
     OR EXISTS (
       SELECT 1 FROM lifeos_rvf.segment segment_row
       WHERE segment_row.container_id = p_container_id
         AND NOT EXISTS (SELECT 1 FROM lifeos_rvf.segment_directory directory_row
                         WHERE directory_row.container_id = p_container_id
                           AND directory_row.segment_id = segment_row.segment_id)
     ) THEN
    RAISE EXCEPTION 'RVF segment directory does not cover every segment exactly once';
  END IF;
  FOR segment_row IN SELECT * FROM lifeos_rvf.segment
    WHERE container_id = p_container_id ORDER BY byte_offset, segment_no
  LOOP
    IF segment_row.byte_offset < previous_end
       OR segment_row.byte_offset + segment_row.byte_length > container_row.file_length THEN
      RAISE EXCEPTION 'RVF segment ranges overlap or exceed the container';
    END IF;
    segment_bytes := lifeos_blob.load_object_bytes(segment_row.raw_object_id);
    IF octet_length(segment_bytes)::bigint <> segment_row.byte_length
       OR extensions.digest(segment_bytes,'sha256') <> segment_row.sha256
       OR extensions.ruvector_shake256_256(segment_bytes) <> segment_row.shake256
       OR substring(container_bytes FROM (segment_row.byte_offset + 1)::integer
                    FOR segment_row.byte_length::integer) <> segment_bytes THEN
      RAISE EXCEPTION 'RVF segment bytes differ from the container slice';
    END IF;
    previous_end := segment_row.byte_offset + segment_row.byte_length;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM lifeos_rvf.import_receipt receipt
    WHERE receipt.container_id = p_container_id
      AND (lifeos_blob.load_object_bytes(receipt.reconstructed_object_id) <>
           container_bytes OR lifeos_blob.load_object_bytes(receipt.source_object_id) <>
           container_bytes OR NOT receipt.exact_match)
  ) OR EXISTS (
    SELECT 1 FROM lifeos_rvf.export_receipt receipt
    WHERE receipt.container_id = p_container_id
      AND (extensions.digest(lifeos_blob.load_object_bytes(receipt.exported_object_id),'sha256') <>
             receipt.expected_sha256 OR
           extensions.ruvector_shake256_256(lifeos_blob.load_object_bytes(receipt.exported_object_id)) <>
             receipt.expected_shake256 OR
           lifeos_blob.load_object_bytes(receipt.exported_object_id) <> container_bytes)
  ) THEN
    RAISE EXCEPTION 'RVF import or export reconstruction differs byte-for-byte';
  END IF;
END
$function$

;

-- lifeos_rvf.mirror_branch_membership
CREATE OR REPLACE FUNCTION lifeos_rvf.mirror_branch_membership(target_branch uuid, parent_container uuid, container_bytes bytea, range_map_bytes bytea, mirror_shake256 bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_runtime', 'lifeos_agent', 'lifeos_rvf'
AS $function$
DECLARE
  branch_row lifeos_runtime.branch%ROWTYPE;
  existing_container lifeos_rvf.container%ROWTYPE;
  container_object BIGINT;
  range_map_object BIGINT;
  membership_payload JSONB;
  membership_sha256 BYTEA;
  new_witness UUID;
  new_container UUID;
  expected_count BIGINT;
  actual_count BIGINT;
BEGIN
  SELECT * INTO STRICT branch_row
  FROM lifeos_runtime.branch
  WHERE branch_id = target_branch
  FOR SHARE;
  SELECT * INTO existing_container
  FROM lifeos_rvf.container
  WHERE branch_id = target_branch
    AND generation = branch_row.head_generation;
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM lifeos_blob.object
      WHERE id = existing_container.raw_object_id
        AND raw_bytes = container_bytes
    ) THEN
      RAISE EXCEPTION 'RVF mirror idempotency collision';
    END IF;
    RETURN existing_container.container_id;
  END IF;
  IF parent_container IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lifeos_rvf.container
    WHERE container_id = parent_container
      AND tenant_id = branch_row.tenant_id
  ) THEN
    RAISE EXCEPTION 'RVF parent container is outside the branch tenant';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'relation_name', resolved.relation_name::text,
        'logical_key', resolved.logical_key,
        'generation', resolved.generation,
        'operation', resolved.operation,
        'member_object_id',
          coalesce(resolved.row_object_id, resolved.record_object_id)
      )
      ORDER BY resolved.relation_name::text, resolved.logical_key::text
    ),
    '[]'::jsonb
  ) INTO membership_payload
  FROM lifeos_runtime.resolve_branch_membership(target_branch) resolved;
  membership_sha256 := extensions.digest(
    convert_to(membership_payload::text, 'UTF8'), 'sha256'
  );
  container_object := lifeos_runtime.store_generated_object(
    container_bytes, 'rvf-cow-container'
  );
  range_map_object := lifeos_runtime.store_generated_object(
    range_map_bytes, 'rvf-cow-range-map'
  );
  new_witness := lifeos_agent.append_branch_witness(
    target_branch, branch_row.head_generation, 'rvf-cow-membership',
    container_object, mirror_shake256
  );
  INSERT INTO lifeos_rvf.container (
    tenant_id, branch_id, generation, parent_container_id,
    raw_object_id, witness_id
  ) VALUES (
    branch_row.tenant_id, target_branch, branch_row.head_generation,
    parent_container, container_object, new_witness
  )
  RETURNING container_id INTO new_container;

  INSERT INTO lifeos_rvf.membership (
    tenant_id, container_id, branch_id, relation_name, member_key,
    member_key_digest, member_object_id, generation, tombstone, witness_id
  )
  SELECT
    branch_row.tenant_id, new_container, target_branch,
    resolved.relation_name, resolved.logical_key,
    resolved.logical_key_digest,
    coalesce(resolved.row_object_id, resolved.record_object_id),
    branch_row.head_generation, resolved.operation = 'delete', new_witness
  FROM lifeos_runtime.resolve_branch_membership(target_branch) resolved;

  IF parent_container IS NOT NULL THEN
    INSERT INTO lifeos_rvf.cow_map (
      tenant_id, child_container_id, parent_container_id, generation,
      range_map_object_id, membership_digest, witness_id
    ) VALUES (
      branch_row.tenant_id, new_container, parent_container,
      branch_row.head_generation, range_map_object, membership_sha256,
      new_witness
    );
  END IF;

  SELECT count(*) INTO expected_count
  FROM lifeos_runtime.resolve_branch_membership(target_branch);
  SELECT count(*) INTO actual_count
  FROM lifeos_rvf.membership
  WHERE container_id = new_container;
  IF expected_count <> actual_count THEN
    RAISE EXCEPTION
      'RVF branch round trip mismatch: overlays %, memberships %',
      expected_count, actual_count;
  END IF;
  INSERT INTO lifeos_rvf.branch_roundtrip_receipt (
    tenant_id, branch_id, container_id, generation, overlay_count,
    membership_count, membership_digest, verified, witness_id
  ) VALUES (
    branch_row.tenant_id, target_branch, new_container,
    branch_row.head_generation, expected_count, actual_count,
    membership_sha256, true, new_witness
  );
  RETURN new_container;
END
$function$

;

-- lifeos_security.bootstrap_envctl_context
CREATE OR REPLACE FUNCTION lifeos_security.bootstrap_envctl_context(p_tenant_id uuid, p_identity_id uuid, p_grant_id uuid, p_binding_bytes bytea)
 RETURNS TABLE(binding_id uuid, session_nonce uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions', 'lifeos_blob', 'lifeos_security'
AS $function$
DECLARE
  binding_payload jsonb;
  binding_object_id uuid;
  binding_expiry timestamptz;
  payload_sha bytea := extensions.digest(p_binding_bytes, 'sha256');
  payload_shake bytea := extensions.ruvector_shake256_256(p_binding_bytes);
BEGIN
  binding_payload := convert_from(p_binding_bytes, 'UTF8')::jsonb;
  IF binding_payload->>'tenant_id' <> p_tenant_id::text
     OR binding_payload->>'identity_id' <> p_identity_id::text
     OR binding_payload->>'grant_id' <> p_grant_id::text
     OR binding_payload->>'purpose' <> 'envctl-session-binding' THEN
    RAISE EXCEPTION 'binding bytes do not encode the requested authority';
  END IF;

  SELECT grant_row.expires_at INTO STRICT binding_expiry
  FROM lifeos_security."grant" grant_row
  JOIN lifeos_security.identity identity_row
    ON identity_row.identity_id = p_identity_id
   AND identity_row.tenant_id = p_tenant_id
   AND identity_row.subject_key = session_user
  WHERE grant_row.grant_id = p_grant_id
    AND grant_row.tenant_id = p_tenant_id
    AND grant_row.identity_id = p_identity_id
    AND grant_row.task_id IS NULL
    AND grant_row.lease_id IS NULL
    AND 'bind-session' = ANY (grant_row.action_scope)
    AND grant_row.revoked_at IS NULL
    AND grant_row.expires_at > statement_timestamp();

  INSERT INTO lifeos_blob.object (
    tenant_id, sha256, shake256, byte_length, media_type, bytes_inline,
    chunked, provenance
  ) VALUES (
    p_tenant_id, payload_sha, payload_shake, octet_length(p_binding_bytes),
    'application/json', p_binding_bytes, false,
    jsonb_build_object('producer','envctl-bootstrap')
  ) ON CONFLICT (tenant_id, sha256, byte_length) DO NOTHING
  RETURNING object_id INTO binding_object_id;
  IF binding_object_id IS NULL THEN
    SELECT object_id INTO STRICT binding_object_id
    FROM lifeos_blob.object
    WHERE tenant_id = p_tenant_id AND sha256 = payload_sha
      AND shake256 = payload_shake
      AND byte_length = octet_length(p_binding_bytes)
      AND bytes_inline = p_binding_bytes;
  END IF;
  INSERT INTO lifeos_blob.object_observation (
    tenant_id, object_id, call_kind, provenance_bytes, provenance_sha256
  ) VALUES (
    p_tenant_id, binding_object_id, 'envctl-bootstrap',
    convert_to(jsonb_build_object('grant_id',p_grant_id,
                                  'identity_id',p_identity_id)::text,'UTF8'),
    extensions.digest(convert_to(jsonb_build_object('grant_id',p_grant_id,
                                  'identity_id',p_identity_id)::text,'UTF8'),'sha256')
  );

  session_nonce := gen_random_uuid();
  INSERT INTO lifeos_security.backend_binding (
    backend_pid, backend_start, database_oid, database_user, session_nonce,
    binding_kind, tenant_id, identity_id, grant_id, raw_object_id, expires_at
  ) VALUES (
    pg_backend_pid(), (SELECT backend_start FROM pg_stat_activity
                       WHERE pid = pg_backend_pid()),
    (SELECT oid FROM pg_database WHERE datname = current_database()),
    session_user, session_nonce, 'session', p_tenant_id, p_identity_id,
    p_grant_id, binding_object_id, binding_expiry
  ) RETURNING lifeos_security.backend_binding.binding_id
    INTO binding_id;
  RETURN NEXT;
END
$function$

;

-- end 0017
