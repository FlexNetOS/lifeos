-- LifeOS migration 0081 — persist hybrid retrieval inputs, component scores,
-- discarded candidates, and final ranking so a past query is reconstructable.

CREATE TABLE IF NOT EXISTS lifeos_semantic.retrieval_query (
  query_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES lifeos_runtime.branch,
  query_text text NOT NULL,
  query_vector extensions.ruvector,
  fusion_config jsonb NOT NULL,
  query_digest bytea NOT NULL,
  index_generation bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, query_digest)
);

CREATE TABLE IF NOT EXISTS lifeos_semantic.retrieval_result (
  query_id uuid NOT NULL REFERENCES lifeos_semantic.retrieval_query ON DELETE CASCADE,
  rank_position integer NOT NULL CHECK (rank_position > 0),
  source_object_id uuid NOT NULL REFERENCES lifeos_blob.object,
  byte_start bigint NOT NULL CHECK (byte_start >= 0),
  byte_end bigint NOT NULL CHECK (byte_end >= byte_start),
  lexical_rank real,
  dense_distance real,
  dense_rank real,
  fused_rank real NOT NULL,
  discarded boolean NOT NULL DEFAULT false,
  component_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (query_id, rank_position)
);

CREATE INDEX IF NOT EXISTS retrieval_query_branch_created_idx
  ON lifeos_semantic.retrieval_query (tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS retrieval_result_source_idx
  ON lifeos_semantic.retrieval_result (source_object_id, query_id, rank_position);

ALTER TABLE lifeos_semantic.retrieval_query ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_semantic.retrieval_query FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retrieval_query_tenant_scope
  ON lifeos_semantic.retrieval_query;
CREATE POLICY retrieval_query_tenant_scope
  ON lifeos_semantic.retrieval_query
  USING (tenant_id = lifeos_security.current_tenant())
  WITH CHECK (tenant_id = lifeos_security.current_tenant());

ALTER TABLE lifeos_semantic.retrieval_result ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_semantic.retrieval_result FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retrieval_result_tenant_scope
  ON lifeos_semantic.retrieval_result;
CREATE POLICY retrieval_result_tenant_scope
  ON lifeos_semantic.retrieval_result
  USING (EXISTS (
    SELECT 1 FROM lifeos_semantic.retrieval_query query_row
     WHERE query_row.query_id = retrieval_result.query_id
       AND query_row.tenant_id = lifeos_security.current_tenant()
  ));

CREATE OR REPLACE FUNCTION lifeos_semantic.hybrid_search(
  p_query_text text,
  p_query_vector extensions.ruvector,
  p_branch_id uuid,
  p_limit integer DEFAULT 20,
  p_fusion_config jsonb DEFAULT '{"lexical_weight":0.5,"dense_weight":0.5}'::jsonb
) RETURNS TABLE (
  query_id uuid,
  rank_position integer,
  source_object_id uuid,
  byte_start bigint,
  byte_end bigint,
  lexical_rank real,
  dense_distance real,
  dense_rank real,
  fused_rank real,
  discarded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_semantic,
                  lifeos_runtime, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  query_uuid uuid := gen_random_uuid();
  lexical_weight real := coalesce((p_fusion_config->>'lexical_weight')::real, 0.5);
  dense_weight real := coalesce((p_fusion_config->>'dense_weight')::real, 0.5);
  index_generation_value bigint;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'retrieval tenant context is not bound';
  END IF;
  IF btrim(coalesce(p_query_text, '')) = '' THEN
    RAISE EXCEPTION 'hybrid query text must not be empty';
  END IF;
  IF p_query_vector IS NULL THEN
    RAISE EXCEPTION 'hybrid query vector must not be null';
  END IF;
  IF p_branch_id IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid hybrid branch or result limit';
  END IF;
  IF lexical_weight < 0 OR dense_weight < 0 OR lexical_weight + dense_weight <= 0 THEN
    RAISE EXCEPTION 'fusion weights must be nonnegative and nonzero';
  END IF;

  SELECT coalesce(max(generation), 0) INTO index_generation_value
    FROM lifeos_semantic.embedding
   WHERE tenant_id = tenant AND branch_id = p_branch_id;

  INSERT INTO lifeos_semantic.retrieval_query (
    query_id, tenant_id, branch_id, query_text, query_vector,
    fusion_config, query_digest, index_generation
  ) VALUES (
    query_uuid, tenant, p_branch_id, p_query_text, p_query_vector,
    p_fusion_config,
    extensions.digest(
      convert_to(p_query_text || E'\n' || p_query_vector::text || E'\n' ||
        p_fusion_config::text || E'\n' || p_branch_id::text, 'UTF8'), 'sha256'),
    index_generation_value
  );

  RETURN QUERY
  WITH lexical AS (
    SELECT result.source_object_id, result.byte_start, result.byte_end,
           result.rank AS lexical_rank
      FROM lifeos_semantic.search_lexical(
        p_query_text, p_branch_id, least(p_limit * 4, 1000)
      ) AS result
  ), dense AS (
    SELECT result.source_object_id, result.byte_start, result.byte_end,
           result.distance AS dense_distance, result.rank AS dense_rank
      FROM lifeos_semantic.search_embedding(
        p_query_vector, p_branch_id, least(p_limit * 4, 1000)
      ) AS result
  ), candidates AS (
    SELECT coalesce(lexical.source_object_id, dense.source_object_id) AS source_object_id,
           coalesce(lexical.byte_start, dense.byte_start) AS byte_start,
           coalesce(lexical.byte_end, dense.byte_end) AS byte_end,
           lexical.lexical_rank, dense.dense_distance, dense.dense_rank,
           (coalesce(lexical.lexical_rank, 0) * lexical_weight +
            coalesce(dense.dense_rank, 0) * dense_weight) /
           (lexical_weight + dense_weight) AS fused_rank
      FROM lexical
      FULL OUTER JOIN dense USING (source_object_id, byte_start, byte_end)
  ), ranked AS (
    SELECT candidates.*, row_number() OVER (
      ORDER BY fused_rank DESC, source_object_id, byte_start
    )::integer AS position
    FROM candidates
  ), persisted AS (
    INSERT INTO lifeos_semantic.retrieval_result (
      query_id, rank_position, source_object_id, byte_start, byte_end,
      lexical_rank, dense_distance, dense_rank, fused_rank, discarded,
      component_payload
    )
    SELECT query_uuid, position, source_object_id, byte_start, byte_end,
           lexical_rank, dense_distance, dense_rank, fused_rank,
           position > p_limit,
           jsonb_build_object(
             'query_text', p_query_text,
             'fusion_config', p_fusion_config,
             'index_generation', index_generation_value
           )
      FROM ranked
    RETURNING retrieval_result.*
  )
  SELECT persisted.query_id, persisted.rank_position,
         persisted.source_object_id, persisted.byte_start, persisted.byte_end,
         persisted.lexical_rank, persisted.dense_distance, persisted.dense_rank,
         persisted.fused_rank, persisted.discarded
    FROM persisted
   WHERE NOT persisted.discarded
   ORDER BY persisted.rank_position;
END
$function$;

ALTER FUNCTION lifeos_semantic.hybrid_search(text, extensions.ruvector, uuid, integer, jsonb)
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_semantic.hybrid_search(text, extensions.ruvector, uuid, integer, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_semantic.hybrid_search(text, extensions.ruvector, uuid, integer, jsonb)
  TO lifeos_runtime, lifeos_reader, lifeos_worker, lifeos_envctl;
