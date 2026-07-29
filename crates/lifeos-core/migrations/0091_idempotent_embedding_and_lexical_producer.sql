-- LifeOS migration 0091 — make embedding production idempotent, and give the
-- lexical half of hybrid retrieval a producer.
--
-- Two defects observed on live data after the first substrate runs:
--
--  1. `append_document_embedding` treated a repeat embedding of an unchanged
--     chunk by the same model as a NEW generation. Re-running the producer
--     therefore duplicated the whole corpus: `search_embedding` returned the
--     same byte range twice (generation 1 and generation 0) at identical
--     distance, halving the effective top-K. Generations exist to version a
--     re-embedding under a CHANGED model, which the unique key already
--     distinguishes by `model_digest` — not to accumulate identical copies.
--     The producer now returns the existing embedding instead.
--
--  2. `hybrid_search` ran dense-only, because nothing ever wrote
--     `lifeos_semantic.lexical_document`. `search_lexical` (migration 0078)
--     was correct and simply had an empty table under it. The lexical
--     producer below fills it from the same captured bytes and byte ranges
--     the embeddings use, so both halves of the fusion cover the same corpus.

CREATE OR REPLACE FUNCTION lifeos_semantic.append_document_embedding(
  p_source_object_id uuid,
  p_byte_start bigint,
  p_byte_end bigint,
  p_dimension integer,
  p_vector_bytes bytea,
  p_embedding text,
  p_model_digest bytea,
  p_corpus text,
  p_chunk_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_agent, lifeos_blob,
                  lifeos_security, lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  source_row lifeos_blob.object%ROWTYPE;
  v_transform_id uuid := gen_random_uuid();
  transform_key text;
  transform_payload jsonb;
  transform_object uuid;
  v_generation bigint;
  witness uuid;
  v_embedding_id uuid := gen_random_uuid();
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_dimension <= 0 OR octet_length(p_vector_bytes) <> p_dimension * 4 THEN
    RAISE EXCEPTION 'vector bytes (%) do not match dimension %',
      octet_length(p_vector_bytes), p_dimension;
  END IF;
  IF p_embedding IS NULL OR btrim(p_embedding) = '' THEN
    RAISE EXCEPTION 'finite ruvector literal is required';
  END IF;
  IF p_chunk_key IS NULL OR btrim(p_chunk_key) = ''
     OR p_corpus IS NULL OR btrim(p_corpus) = '' THEN
    RAISE EXCEPTION 'corpus and chunk key are required';
  END IF;
  IF octet_length(p_model_digest) <> 32 THEN
    RAISE EXCEPTION 'model digest must be 32 bytes';
  END IF;

  branch := lifeos_semantic.substrate_branch(tenant);
  IF branch IS NULL THEN
    RAISE EXCEPTION 'no runtime branch exists for tenant %', tenant;
  END IF;

  -- Idempotence: this exact chunk, embedded by this exact model at this exact
  -- width, already exists. Re-embedding it would only duplicate the index.
  SELECT e.embedding_id INTO v_embedding_id
    FROM lifeos_semantic.embedding e
   WHERE e.branch_id = branch
     AND e.source_object_id = p_source_object_id
     AND e.byte_start = p_byte_start AND e.byte_end = p_byte_end
     AND e.model_digest = p_model_digest AND e.dimension = p_dimension
   ORDER BY e.generation DESC
   LIMIT 1;
  IF v_embedding_id IS NOT NULL THEN
    RETURN v_embedding_id;
  END IF;
  v_embedding_id := gen_random_uuid();

  -- The embedded range must actually exist inside the captured document.
  SELECT * INTO STRICT source_row FROM lifeos_blob.object
   WHERE object_id = p_source_object_id AND tenant_id = tenant;
  IF p_byte_start < 0 OR p_byte_end < p_byte_start
     OR p_byte_end > source_row.byte_length THEN
    RAISE EXCEPTION 'byte range [%,%] is outside object % of % bytes',
      p_byte_start, p_byte_end, p_source_object_id, source_row.byte_length;
  END IF;

  SELECT coalesce(max(e.generation) + 1, 0) INTO v_generation
    FROM lifeos_semantic.embedding e
   WHERE e.branch_id = branch
     AND e.source_object_id = p_source_object_id
     AND e.byte_start = p_byte_start AND e.byte_end = p_byte_end
     AND e.dimension = p_dimension;

  transform_key := 'document-embedding:' || p_chunk_key || ':' ||
                   encode(p_model_digest, 'hex') || ':' || v_generation;
  transform_payload := jsonb_build_object(
    'branch_id', branch, 'transform', 'chunk-embed',
    'corpus', p_corpus, 'chunk_key', p_chunk_key,
    'source_object_id', p_source_object_id,
    'byte_start', p_byte_start, 'byte_end', p_byte_end,
    'dimension', p_dimension, 'generation', v_generation,
    'model_digest', encode(p_model_digest, 'hex'));
  transform_object := lifeos_blob.store_bytes(
    tenant, convert_to(transform_payload::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer', 'lifeos-document-embedding-transform',
                       'chunk_key', p_chunk_key),
    'document-embedding-transform');
  INSERT INTO lifeos_semantic.transform (
    transform_id, tenant_id, branch_id, record_kind, raw_object_id,
    typed_payload, record_digest, idempotency_key
  ) VALUES (
    v_transform_id, tenant, branch, 'document-embedding-transform',
    transform_object, transform_payload,
    extensions.ruvector_shake256_256(convert_to(transform_payload::text, 'UTF8')),
    transform_key
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    SELECT t.transform_id INTO STRICT v_transform_id
      FROM lifeos_semantic.transform t
     WHERE t.tenant_id = tenant AND t.idempotency_key = transform_key;
  END IF;

  witness := lifeos_semantic.witness_substrate(
    tenant, branch, 'document-embedding', transform_object,
    'document-embedding',
    jsonb_build_object('source_object_id', p_source_object_id,
                       'chunk_key', p_chunk_key,
                       'generation', v_generation));

  INSERT INTO lifeos_semantic.embedding (
    embedding_id, tenant_id, branch_id, source_object_id, byte_start, byte_end,
    record_kind, metadata, model_digest, transform_id, generation, dimension,
    embedding, witness_id
  ) VALUES (
    v_embedding_id, tenant, branch, p_source_object_id, p_byte_start, p_byte_end,
    'embedding',
    jsonb_build_object('corpus', p_corpus, 'chunk_key', p_chunk_key,
                       'dimension', p_dimension, 'retired', false,
                       'user_metadata', coalesce(p_metadata, '{}'::jsonb)),
    p_model_digest, v_transform_id, v_generation, p_dimension,
    p_embedding::extensions.ruvector, witness);

  RETURN v_embedding_id;
END
$function$;

ALTER FUNCTION lifeos_semantic.append_document_embedding(
  uuid, bigint, bigint, integer, bytea, text, bytea, text, text, jsonb)
  OWNER TO lifeos_migrator;

-- ---------------------------------------------------------------------------
-- Lexical half of hybrid retrieval.
--
-- Same captured object and same byte range as the dense side, so a fused
-- result set is comparing two views of one chunk rather than two corpora.
-- Idempotent for the same reason the embedding producer is.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lifeos_semantic.append_lexical_document(
  p_source_object_id uuid,
  p_byte_start bigint,
  p_byte_end bigint,
  p_text text,
  p_corpus text,
  p_chunk_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security,
                  lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  source_row lifeos_blob.object%ROWTYPE;
  v_lexical_id uuid;
  v_generation bigint;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RAISE EXCEPTION 'lexical document text must not be empty';
  END IF;
  branch := lifeos_semantic.substrate_branch(tenant);

  SELECT * INTO STRICT source_row FROM lifeos_blob.object
   WHERE object_id = p_source_object_id AND tenant_id = tenant;
  IF p_byte_start < 0 OR p_byte_end < p_byte_start
     OR p_byte_end > source_row.byte_length THEN
    RAISE EXCEPTION 'byte range [%,%] is outside object % of % bytes',
      p_byte_start, p_byte_end, p_source_object_id, source_row.byte_length;
  END IF;

  SELECT d.lexical_id INTO v_lexical_id
    FROM lifeos_semantic.lexical_document d
   WHERE d.branch_id = branch
     AND d.source_object_id = p_source_object_id
     AND d.byte_start = p_byte_start AND d.byte_end = p_byte_end
   ORDER BY d.generation DESC
   LIMIT 1;
  IF v_lexical_id IS NOT NULL THEN
    RETURN v_lexical_id;
  END IF;

  SELECT coalesce(max(d.generation) + 1, 0) INTO v_generation
    FROM lifeos_semantic.lexical_document d
   WHERE d.branch_id = branch AND d.source_object_id = p_source_object_id;

  v_lexical_id := gen_random_uuid();
  INSERT INTO lifeos_semantic.lexical_document (
    lexical_id, tenant_id, branch_id, source_object_id, byte_start, byte_end,
    fields, terms, analyzer, generation
  ) VALUES (
    v_lexical_id, tenant, branch, p_source_object_id, p_byte_start, p_byte_end,
    jsonb_build_object('corpus', p_corpus, 'chunk_key', p_chunk_key,
                       'byte_length', p_byte_end - p_byte_start),
    to_tsvector('simple', p_text),
    jsonb_build_object('configuration', 'simple',
                       'function', 'to_tsvector',
                       'source', 'lifeos-substrate-corpus'),
    v_generation);
  RETURN v_lexical_id;
END
$function$;

ALTER FUNCTION lifeos_semantic.append_lexical_document(uuid, bigint, bigint, text, text, text)
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_semantic.append_lexical_document(uuid, bigint, bigint, text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_semantic.append_lexical_document(uuid, bigint, bigint, text, text, text)
  TO lifeos_envctl;

-- ---------------------------------------------------------------------------
-- Collapse superseded generations at read time.
--
-- The duplicates the pre-idempotence producer already created cannot be
-- removed: canonical envelope rows are append-only by trigger
-- (`prevent_canonical_link_rewrite` refuses both UPDATE and DELETE), and
-- retirement is itself an append. That is the correct design, so the fix
-- belongs in the query rather than the data.
--
-- One chunk should occupy one result slot. `search_embedding` now returns the
-- best row per (source object, byte range), preferring the newest generation
-- on a tie — which is also the right behaviour when a genuinely new model
-- re-embeds an existing chunk, not just for these duplicates.
--
-- The ANN index still does the ordering: the inner query is the unchanged
-- index-backed nearest-neighbour scan, over-fetched fourfold so that
-- collapsing duplicates cannot starve the requested limit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lifeos_semantic.search_embedding(
  p_query extensions.ruvector,
  p_branch_id uuid,
  p_limit integer DEFAULT 20
) RETURNS TABLE (
  embedding_id uuid,
  source_object_id uuid,
  byte_start bigint,
  byte_end bigint,
  generation bigint,
  distance real,
  rank real
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_semantic,
                  lifeos_security
AS $function$
DECLARE
  dimension integer := extensions.ruvector_dims(p_query);
  table_name text;
BEGIN
  IF p_query IS NULL THEN
    RAISE EXCEPTION 'embedding query must not be null';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'embedding branch is required';
  END IF;
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'embedding result limit must be between 1 and 1000';
  END IF;
  IF dimension NOT IN (384, 768, 1024, 1536, 3072) THEN
    RAISE EXCEPTION 'unsupported embedding search dimension %', dimension;
  END IF;

  table_name := 'embedding_index_' || dimension::text;
  RETURN QUERY EXECUTE format($sql$
    WITH nearest AS (
      SELECT projection.embedding_id,
             projection.source_object_id,
             source_embedding.byte_start,
             source_embedding.byte_end,
             projection.generation,
             (projection.embedding <=> $1)::real AS distance
        FROM lifeos_semantic.%I AS projection
        JOIN lifeos_semantic.embedding AS source_embedding
          ON source_embedding.embedding_id = projection.embedding_id
        JOIN lifeos_blob.object AS source_object
          ON source_object.object_id = projection.source_object_id
       WHERE projection.tenant_id = lifeos_security.current_tenant()
         AND projection.branch_id = $2
         AND source_object.tenant_id = lifeos_security.current_tenant()
       ORDER BY projection.embedding <=> $1
       LIMIT $3 * 4
    ), collapsed AS (
      SELECT DISTINCT ON (source_object_id, byte_start, byte_end)
             embedding_id, source_object_id, byte_start, byte_end,
             generation, distance
        FROM nearest
       ORDER BY source_object_id, byte_start, byte_end,
                distance, generation DESC, embedding_id
    )
    SELECT embedding_id, source_object_id, byte_start, byte_end, generation,
           distance, (1 - distance)::real AS rank
      FROM collapsed
     ORDER BY distance, generation DESC, embedding_id
     LIMIT $3
  $sql$, table_name) USING p_query, p_branch_id, p_limit;
END
$function$;

ALTER FUNCTION lifeos_semantic.search_embedding(extensions.ruvector, uuid, integer)
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_semantic.search_embedding(extensions.ruvector, uuid, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_semantic.search_embedding(extensions.ruvector, uuid, integer)
  TO lifeos_runtime, lifeos_reader, lifeos_worker, lifeos_envctl;
