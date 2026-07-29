-- LifeOS migration 0079 — materialize and query dense embedding projections.
--
-- The canonical embedding row remains the durable source. Supported model
-- dimensions receive an append-only projection so the dimension-specific HNSW
-- and ruivfflat indexes created by migration 0012 are actually populated.

DO $projection_indexes$
DECLARE
  dimension integer;
  table_name text;
BEGIN
  FOREACH dimension IN ARRAY ARRAY[384, 768, 1024, 1536, 3072]
  LOOP
    table_name := 'embedding_index_' || dimension::text;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON lifeos_semantic.%I (tenant_id, branch_id, generation, source_object_id)',
      left(table_name || '_metadata_idx', 63), table_name
    );
  END LOOP;
END
$projection_indexes$;

CREATE OR REPLACE FUNCTION lifeos_semantic.populate_embedding_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_semantic
AS $function$
DECLARE
  table_name text;
BEGIN
  IF NEW.dimension NOT IN (384, 768, 1024, 1536, 3072) THEN
    RETURN NEW;
  END IF;
  table_name := 'embedding_index_' || NEW.dimension::text;
  EXECUTE format(
    'INSERT INTO lifeos_semantic.%I
       (embedding_id, tenant_id, branch_id, model_digest, generation,
        source_object_id, embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (embedding_id) DO NOTHING',
    table_name
  ) USING NEW.embedding_id, NEW.tenant_id, NEW.branch_id,
          NEW.model_digest, NEW.generation, NEW.source_object_id,
          NEW.embedding;
  RETURN NEW;
END
$function$;

ALTER FUNCTION lifeos_semantic.populate_embedding_index()
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_semantic.populate_embedding_index()
  FROM PUBLIC;

CREATE OR REPLACE TRIGGER embedding_dimension_projection
  AFTER INSERT ON lifeos_semantic.embedding
  FOR EACH ROW EXECUTE FUNCTION lifeos_semantic.populate_embedding_index();

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
    SELECT projection.embedding_id,
           projection.source_object_id,
           source_embedding.byte_start,
           source_embedding.byte_end,
           projection.generation,
           (projection.embedding <=> $1)::real AS distance,
           (1 - (projection.embedding <=> $1))::real AS rank
      FROM lifeos_semantic.%I AS projection
      JOIN lifeos_semantic.embedding AS source_embedding
        ON source_embedding.embedding_id = projection.embedding_id
      JOIN lifeos_blob.object AS source_object
        ON source_object.object_id = projection.source_object_id
     WHERE projection.tenant_id = lifeos_security.current_tenant()
       AND projection.branch_id = $2
       AND source_object.tenant_id = lifeos_security.current_tenant()
     ORDER BY projection.embedding <=> $1,
              projection.generation DESC,
              projection.embedding_id
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
