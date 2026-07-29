-- LifeOS migration 0069 — close AgentDB clear and embedding transform paths.

ALTER FUNCTION lifeos_agentdb.clear_projection_kind(text)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_agentdb.clear_projection_kind(regclass,text)
  OWNER TO lifeos_migrator;

CREATE OR REPLACE FUNCTION lifeos_agentdb.clear_projection_kind(
  p_target regclass, p_record_kind text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, lifeos_agentdb, lifeos_security
AS $function$
DECLARE
  row_value record;
  cleared bigint := 0;
  tombstone jsonb;
  target_name text;
BEGIN
  SELECT format('%I.%I', n.nspname, c.relname) INTO target_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.oid = p_target;
  IF target_name NOT IN ('lifeos_agentdb.exp_nodes', 'lifeos_agentdb.exp_edges') THEN
    RAISE EXCEPTION 'unsupported AgentDB projection target %', target_name;
  END IF;
  FOR row_value IN EXECUTE format(
    'SELECT DISTINCT ON (typed_payload->>''logical_key'')
       record_kind, typed_payload->>''logical_key'' AS logical_key
     FROM %s
     WHERE tenant_id = lifeos_security.current_tenant()
       AND record_kind = $1
       AND coalesce((typed_payload->>''tombstone'')::boolean, false) = false
     ORDER BY typed_payload->>''logical_key'', sequence DESC', target_name
  ) USING p_record_kind LOOP
    tombstone := jsonb_build_object(
      'logical_key', row_value.logical_key, 'tombstone', true,
      'payload', '{}'::jsonb);
    PERFORM lifeos_agentdb.append_projection_record(
      p_target, p_record_kind, row_value.logical_key,
      tombstone, convert_to(tombstone::text, 'UTF8'));
    cleared := cleared + 1;
  END LOOP;
  RETURN cleared;
END
$function$;

ALTER FUNCTION lifeos_semantic.append_embedding_projection(
  text,text,integer,bytea,text,jsonb,bigint,boolean
) OWNER TO lifeos_migrator;

CREATE OR REPLACE FUNCTION lifeos_semantic.append_embedding_projection(
  p_logical_id text, p_collection text, p_dimension integer,
  p_vector_bytes bytea, p_embedding text, p_metadata jsonb,
  p_last_synced_at bigint, p_retired boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
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
  transform_object uuid;
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
  transform_payload jsonb;
  transform_key text;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_logical_id IS NULL OR btrim(p_logical_id) = ''
     OR p_collection IS NULL OR btrim(p_collection) = ''
     OR p_dimension <= 0 OR octet_length(p_vector_bytes) <> p_dimension * 4 THEN
    RAISE EXCEPTION 'invalid RuVector projection input';
  END IF;
  IF p_embedding IS NULL OR btrim(p_embedding) = '' THEN
    RAISE EXCEPTION 'finite RuVector literal is required for canonical projection';
  END IF;

  SELECT * INTO STRICT binding FROM lifeos_security.current_binding();
  SELECT branch_id INTO branch FROM lifeos_runtime.branch
   WHERE tenant_id = tenant ORDER BY created_at, branch_id LIMIT 1;
  IF branch IS NULL THEN
    RAISE EXCEPTION 'no runtime branch exists for tenant %', tenant;
  END IF;
  source_object := lifeos_blob.store_bytes(
    tenant, p_vector_bytes, 'application/octet-stream',
    jsonb_build_object('producer','lifeos-ruvector-projection',
      'logical_id',p_logical_id,'collection',p_collection,
      'dimension',p_dimension), 'ruvector-embedding');
  model_digest := extensions.digest(convert_to(p_collection, 'UTF8'), 'sha256');
  SELECT coalesce(max(e.generation) + 1, 0) INTO generation
    FROM lifeos_semantic.embedding e
   WHERE e.tenant_id = tenant AND e.branch_id = branch
     AND e.metadata->>'logical_id' = p_logical_id;

  transform_key := 'embedding-transform:' || p_logical_id || ':' || generation;
  transform_payload := jsonb_build_object(
    'branch_id', branch, 'logical_id', p_logical_id,
    'collection', p_collection, 'dimension', p_dimension,
    'generation', generation, 'transform', 'identity');
  transform_object := lifeos_blob.store_bytes(
    tenant, convert_to(transform_payload::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer','lifeos-ruvector-transform',
      'logical_id',p_logical_id), 'ruvector-transform');
  INSERT INTO lifeos_semantic.transform (
    transform_id, tenant_id, branch_id, record_kind, raw_object_id,
    typed_payload, record_digest, idempotency_key
  ) VALUES (
    transform, tenant, branch, 'embedding-transform', transform_object,
    transform_payload,
    extensions.ruvector_shake256_256(convert_to(transform_payload::text, 'UTF8')),
    transform_key
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    SELECT transform_id INTO STRICT transform
      FROM lifeos_semantic.transform
     WHERE tenant_id = tenant AND idempotency_key = transform_key;
  END IF;

  SELECT chain_id INTO chain FROM lifeos_agent.witness_chain
   WHERE tenant_id = tenant AND branch_id = branch
     AND domain = 'ruvector-embedding' FOR UPDATE;
  IF chain IS NULL THEN
    chain := gen_random_uuid();
    INSERT INTO lifeos_agent.witness_chain
      (chain_id, tenant_id, branch_id, domain, head_sequence, head_shake256)
    VALUES (chain, tenant, branch, 'ruvector-embedding', 0,
      extensions.ruvector_shake256_256(convert_to('genesis','UTF8')));
  END IF;
  SELECT * INTO STRICT chain_row FROM lifeos_agent.witness_chain
   WHERE chain_id = chain FOR UPDATE;
  row_metadata := jsonb_build_object(
    'logical_id', p_logical_id, 'collection', p_collection,
    'dimension', p_dimension, 'last_synced_at', p_last_synced_at,
    'retired', p_retired, 'user_metadata', coalesce(p_metadata, '{}'::jsonb));
  canonical := jsonb_build_object(
    'branch_id', branch, 'canonical_object_id', source_object,
    'source_object_id', source_object, 'byte_start', 0,
    'byte_end', octet_length(p_vector_bytes), 'signer_identity', binding.identity_id,
    'record_kind', CASE WHEN p_retired THEN 'embedding-retired' ELSE 'embedding' END,
    'logical_id', p_logical_id, 'generation', generation);
  next_digest := extensions.ruvector_shake256_256(
    convert_to('lifeos-witness-v1', 'UTF8') || chain_row.head_shake256 ||
    (SELECT shake256 FROM lifeos_blob.object WHERE object_id = source_object) ||
    lifeos_blob.canonical_jsonb_bytes(canonical));
  signature := extensions.digest(next_digest, 'sha256');
  proof := jsonb_build_object(
    'verified', true, 'signer_identity', binding.identity_id,
    'signature_sha256', encode(extensions.digest(signature, 'sha256'), 'hex'),
    'signed_digest', encode(next_digest, 'hex'));
  verification_object := lifeos_blob.store_bytes(
    tenant, convert_to(proof::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer','lifeos-ruvector-witness-verifier',
      'logical_id',p_logical_id), 'ruvector-witness-verification');
  canonical := canonical || jsonb_build_object(
    'signature_verification_object_id', verification_object);
  witness := lifeos_agent.append_witness(chain, canonical, signature);
  INSERT INTO lifeos_semantic.embedding (
    embedding_id, tenant_id, branch_id, source_object_id, byte_start, byte_end,
    record_kind, metadata, model_digest, transform_id, generation, dimension,
    embedding, witness_id
  ) VALUES (
    embedding_id, tenant, branch, source_object, 0,
    octet_length(p_vector_bytes),
    CASE WHEN p_retired THEN 'embedding-retired' ELSE 'embedding' END,
    row_metadata, model_digest, transform, generation, p_dimension,
    p_embedding::extensions.ruvector, witness);
  RETURN embedding_id;
END
$function$;
