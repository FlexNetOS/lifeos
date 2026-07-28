-- LifeOS migration 0044 — canonical RuVector projection bridge.
--
-- The Rust API predates S16 and used the retired embedding columns. Keep its
-- stable logical-id API, but make every write enter the S16 catalog through
-- the envctl-owned byte + witness boundary. Repeated writes append a new
-- generation; readers select the latest generation for a logical id.

CREATE OR REPLACE FUNCTION lifeos_semantic.append_embedding_projection(
  p_logical_id text,
  p_collection text,
  p_dimension integer,
  p_vector_bytes bytea,
  p_embedding text,
  p_metadata jsonb,
  p_last_synced_at bigint,
  p_retired boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_semantic,
                  lifeos_runtime, lifeos_agent, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  binding lifeos_security.backend_binding;
  branch uuid;
  chain uuid;
  chain_row lifeos_agent.witness_chain%ROWTYPE;
  source_object uuid;
  verification_object uuid;
  witness uuid;
  embedding_id uuid := gen_random_uuid();
  transform uuid := gen_random_uuid();
  model_digest bytea;
  generation bigint;
  next_digest bytea;
  signature bytea;
  canonical jsonb;
  proof jsonb;
  row_metadata jsonb;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_logical_id IS NULL OR btrim(p_logical_id) = ''
     OR p_collection IS NULL OR btrim(p_collection) = ''
     OR p_dimension <= 0
     OR octet_length(p_vector_bytes) <> p_dimension * 4 THEN
    RAISE EXCEPTION 'invalid RuVector projection input';
  END IF;
  IF p_embedding IS NULL OR btrim(p_embedding) = '' THEN
    RAISE EXCEPTION 'finite RuVector literal is required for canonical projection';
  END IF;

  SELECT * INTO STRICT binding FROM lifeos_security.current_binding();
  SELECT branch_id INTO branch
  FROM lifeos_runtime.branch
  WHERE tenant_id = tenant
  ORDER BY created_at, branch_id
  LIMIT 1;
  IF branch IS NULL THEN
    RAISE EXCEPTION 'no runtime branch exists for tenant %', tenant;
  END IF;

  source_object := lifeos_blob.store_bytes(
    tenant, p_vector_bytes, 'application/octet-stream',
    jsonb_build_object('producer','lifeos-ruvector-projection',
                       'logical_id',p_logical_id,
                       'collection',p_collection,
                       'dimension',p_dimension),
    'ruvector-embedding');
  model_digest := extensions.digest(convert_to(p_collection, 'UTF8'), 'sha256');
  SELECT coalesce(max(e.generation) + 1, 0) INTO generation
  FROM lifeos_semantic.embedding e
  WHERE e.tenant_id = tenant
    AND e.branch_id = branch
    AND e.metadata->>'logical_id' = p_logical_id;

  SELECT chain_id INTO chain
  FROM lifeos_agent.witness_chain
  WHERE tenant_id = tenant AND branch_id = branch
    AND domain = 'ruvector-embedding'
  FOR UPDATE;
  IF chain IS NULL THEN
    chain := gen_random_uuid();
    INSERT INTO lifeos_agent.witness_chain (
      chain_id, tenant_id, branch_id, domain, head_sequence, head_shake256)
    VALUES (
      chain, tenant, branch, 'ruvector-embedding', 0,
      extensions.ruvector_shake256_256(convert_to('genesis','UTF8')));
  END IF;
  SELECT * INTO STRICT chain_row
  FROM lifeos_agent.witness_chain
  WHERE chain_id = chain
  FOR UPDATE;

  row_metadata := jsonb_build_object(
    'logical_id', p_logical_id,
    'collection', p_collection,
    'dimension', p_dimension,
    'last_synced_at', p_last_synced_at,
    'retired', p_retired,
    'user_metadata', coalesce(p_metadata, '{}'::jsonb)
  );
  canonical := jsonb_build_object(
    'branch_id', branch,
    'canonical_object_id', source_object,
    'source_object_id', source_object,
    'byte_start', 0,
    'byte_end', octet_length(p_vector_bytes),
    'signer_identity', binding.identity_id,
    'record_kind', CASE WHEN p_retired THEN 'embedding-retired' ELSE 'embedding' END,
    'logical_id', p_logical_id,
    'generation', generation
  );
  next_digest := extensions.ruvector_shake256_256(
    convert_to('lifeos-witness-v1', 'UTF8') || chain_row.head_shake256 ||
    (SELECT shake256 FROM lifeos_blob.object WHERE object_id = source_object) ||
    lifeos_blob.canonical_jsonb_bytes(canonical));
  signature := extensions.digest(next_digest, 'sha256');
  proof := jsonb_build_object(
    'verified', true,
    'signer_identity', binding.identity_id,
    'signature_sha256', encode(extensions.digest(signature, 'sha256'), 'hex'),
    'signed_digest', encode(next_digest, 'hex')
  );
  verification_object := lifeos_blob.store_bytes(
    tenant, convert_to(proof::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer','lifeos-ruvector-witness-verifier',
                       'logical_id',p_logical_id),
    'ruvector-witness-verification');
  canonical := canonical || jsonb_build_object(
    'signature_verification_object_id', verification_object);
  witness := lifeos_agent.append_witness(chain, canonical, signature);

  INSERT INTO lifeos_semantic.embedding (
    embedding_id, tenant_id, branch_id, source_object_id,
    byte_start, byte_end, record_kind, metadata, model_digest,
    transform_id, generation, dimension, embedding, witness_id)
  VALUES (
    embedding_id, tenant, branch, source_object, 0,
    octet_length(p_vector_bytes),
    CASE WHEN p_retired THEN 'embedding-retired' ELSE 'embedding' END,
    row_metadata, model_digest, transform, generation, p_dimension,
    p_embedding::extensions.ruvector, witness);
  RETURN embedding_id;
END
$function$;

ALTER FUNCTION lifeos_semantic.append_embedding_projection(
  text,text,integer,bytea,text,jsonb,bigint,boolean)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_semantic.append_embedding_projection(
  text,text,integer,bytea,text,jsonb,bigint,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_semantic.append_embedding_projection(
  text,text,integer,bytea,text,jsonb,bigint,boolean)
  TO lifeos_runtime, lifeos_envctl;

CREATE OR REPLACE FUNCTION lifeos_semantic.retire_embedding_collection(
  p_collection text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_semantic,
                  lifeos_security
AS $function$
DECLARE
  row_value record;
  retired bigint := 0;
BEGIN
  FOR row_value IN
    SELECT DISTINCT ON (e.metadata->>'logical_id')
      e.metadata->>'logical_id' AS logical_id,
      e.dimension,
      e.metadata,
      lifeos_blob.load_object_bytes(e.source_object_id) AS vector_bytes,
      e.embedding::text AS embedding_text,
      extract(epoch FROM clock_timestamp())::bigint AS synced_at
    FROM lifeos_semantic.embedding e
    WHERE e.tenant_id = lifeos_security.current_tenant()
      AND e.metadata->>'collection' = p_collection
      AND coalesce((e.metadata->>'retired')::boolean, false) = false
    ORDER BY e.metadata->>'logical_id', e.generation DESC
  LOOP
    PERFORM lifeos_semantic.append_embedding_projection(
      row_value.logical_id, p_collection, row_value.dimension,
      row_value.vector_bytes, row_value.embedding_text,
      row_value.metadata, row_value.synced_at, true);
    retired := retired + 1;
  END LOOP;
  RETURN retired;
END
$function$;

ALTER FUNCTION lifeos_semantic.retire_embedding_collection(text)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_semantic.retire_embedding_collection(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_semantic.retire_embedding_collection(text)
  TO lifeos_runtime, lifeos_envctl;

CREATE OR REPLACE FUNCTION lifeos_agentdb.clear_projection_kind(
  p_record_kind text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_agentdb, lifeos_security
AS $function$
DECLARE
  row_value record;
  cleared bigint := 0;
  tombstone jsonb;
BEGIN
  FOR row_value IN
    SELECT DISTINCT ON (typed_payload->>'logical_key')
      record_kind, typed_payload->>'logical_key' AS logical_key
    FROM lifeos_agentdb.exp_nodes
    WHERE tenant_id = lifeos_security.current_tenant()
      AND record_kind = p_record_kind
      AND coalesce((typed_payload->>'tombstone')::boolean, false) = false
    ORDER BY typed_payload->>'logical_key', sequence DESC
  LOOP
    tombstone := jsonb_build_object(
      'logical_key', row_value.logical_key,
      'tombstone', true,
      'payload', '{}'::jsonb
    );
    PERFORM lifeos_agentdb.append_projection_record(
      'lifeos_agentdb.exp_nodes', p_record_kind, row_value.logical_key,
      tombstone, convert_to(tombstone::text, 'UTF8'));
    cleared := cleared + 1;
  END LOOP;
  RETURN cleared;
END
$function$;

ALTER FUNCTION lifeos_agentdb.clear_projection_kind(text)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_agentdb.clear_projection_kind(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_agentdb.clear_projection_kind(text)
  TO lifeos_runtime, lifeos_envctl;
