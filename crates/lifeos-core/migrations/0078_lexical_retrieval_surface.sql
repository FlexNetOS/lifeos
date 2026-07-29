-- LifeOS migration 0078 — activate the byte-linked lexical retrieval surface.
--
-- lexical_document already carries the exact source object and byte range and
-- has a GIN tsvector index. This function is the executable database-local
-- path: tenant scope is derived from the bound security context, branch scope
-- is explicit, and ranking is deterministic so a result can be reconstructed
-- from the stored row and query text.

CREATE INDEX IF NOT EXISTS lexical_document_branch_generation_idx
  ON lifeos_semantic.lexical_document (branch_id, generation, source_object_id);

CREATE OR REPLACE FUNCTION lifeos_semantic.search_lexical(
  p_query text,
  p_branch_id uuid,
  p_limit integer DEFAULT 20
) RETURNS TABLE (
  lexical_id uuid,
  source_object_id uuid,
  byte_start bigint,
  byte_end bigint,
  generation bigint,
  fields jsonb,
  rank real
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, lifeos_blob, lifeos_semantic, lifeos_security
AS $function$
DECLARE
  query_text text := btrim(coalesce(p_query, ''));
  query_terms tsquery;
BEGIN
  IF query_text = '' THEN
    RAISE EXCEPTION 'lexical query must not be empty';
  END IF;
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'lexical branch is required';
  END IF;
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'lexical result limit must be between 1 and 1000';
  END IF;

  query_terms := plainto_tsquery('simple', query_text);
  IF query_terms = ''::tsquery THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT document.lexical_id,
         document.source_object_id,
         document.byte_start,
         document.byte_end,
         document.generation,
         document.fields,
         ts_rank_cd(document.terms, query_terms)::real AS rank
    FROM lifeos_semantic.lexical_document AS document
    JOIN lifeos_blob.object AS source
      ON source.object_id = document.source_object_id
   WHERE document.branch_id = p_branch_id
     AND source.tenant_id = lifeos_security.current_tenant()
     AND document.terms @@ query_terms
   ORDER BY ts_rank_cd(document.terms, query_terms) DESC,
            document.generation DESC,
            document.lexical_id
   LIMIT p_limit;
  RETURN;
END
$function$;

ALTER FUNCTION lifeos_semantic.search_lexical(text, uuid, integer)
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_semantic.search_lexical(text, uuid, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_semantic.search_lexical(text, uuid, integer)
  TO lifeos_runtime, lifeos_reader, lifeos_worker, lifeos_envctl;
