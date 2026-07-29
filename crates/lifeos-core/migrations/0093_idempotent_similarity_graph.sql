-- LifeOS migration 0093 — rebuilding an unchanged graph is a no-op.
--
-- `build_similarity_graph` always took `max(generation) + 1`, so every run
-- appended a complete duplicate generation of nodes and edges even when not a
-- single embedding had changed. Observed live: a second pass over an unchanged
-- corpus created 283 nodes and 420 edges that were identical to generation 0.
--
-- The embedding producer was made idempotent in migration 0091 for the same
-- reason; this brings the graph in line. A new generation is built only when
-- the corpus it would describe actually differs from the newest one already
-- built. That still versions a genuine rebuild — new chunks, or a re-embedding
-- under a different model — while making a redundant rebuild free.

CREATE OR REPLACE FUNCTION lifeos_semantic.build_similarity_graph(
  p_corpus text,
  p_neighbors integer DEFAULT 4,
  p_max_distance double precision DEFAULT 0.9
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_agent, lifeos_blob,
                  lifeos_security, lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  v_generation bigint;
  latest_generation bigint;
  corpus_embeddings bigint;
  covered_embeddings bigint;
  node_row record;
  edge_row record;
  raw_object uuid;
  payload jsonb;
  witness uuid;
  nodes_created bigint := 0;
  edges_created bigint := 0;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_neighbors < 1 OR p_neighbors > 64 THEN
    RAISE EXCEPTION 'neighbour count must be between 1 and 64';
  END IF;
  branch := lifeos_semantic.substrate_branch(tenant);

  SELECT count(*) INTO corpus_embeddings
    FROM lifeos_semantic.embedding e
   WHERE e.tenant_id = tenant AND e.branch_id = branch
     AND e.record_kind = 'embedding'
     AND e.metadata->>'corpus' = p_corpus;

  SELECT max(n.generation) INTO latest_generation
    FROM lifeos_semantic.graph_node n
   WHERE n.tenant_id = tenant AND n.branch_id = branch
     AND n.node_kind = 'document-chunk'
     AND n.properties->>'corpus' = p_corpus;

  -- Already built over exactly this embedding set: nothing to version.
  IF latest_generation IS NOT NULL THEN
    SELECT count(*) INTO covered_embeddings
      FROM lifeos_semantic.graph_node n
      JOIN lifeos_semantic.embedding e ON e.embedding_id = n.embedding_id
     WHERE n.tenant_id = tenant AND n.branch_id = branch
       AND n.node_kind = 'document-chunk'
       AND n.generation = latest_generation
       AND n.properties->>'corpus' = p_corpus
       AND e.record_kind = 'embedding';
    IF covered_embeddings = corpus_embeddings AND corpus_embeddings > 0 THEN
      RETURN jsonb_build_object(
        'corpus', p_corpus, 'generation', latest_generation,
        'nodes_created', 0, 'edges_created', 0,
        'neighbors', p_neighbors, 'max_distance', p_max_distance,
        'unchanged', true);
    END IF;
  END IF;

  v_generation := coalesce(latest_generation + 1, 0);

  FOR node_row IN
    SELECT e.embedding_id, e.source_object_id, e.byte_start, e.byte_end,
           e.metadata->>'chunk_key' AS chunk_key
      FROM lifeos_semantic.embedding e
     WHERE e.tenant_id = tenant AND e.branch_id = branch
       AND e.record_kind = 'embedding'
       AND e.metadata->>'corpus' = p_corpus
     ORDER BY e.metadata->>'chunk_key'
  LOOP
    payload := jsonb_build_object(
      'corpus', p_corpus, 'chunk_key', node_row.chunk_key,
      'embedding_id', node_row.embedding_id,
      'source_object_id', node_row.source_object_id,
      'byte_start', node_row.byte_start, 'byte_end', node_row.byte_end,
      'generation', v_generation);
    raw_object := lifeos_blob.store_bytes(
      tenant, convert_to(payload::text, 'UTF8'), 'application/json',
      jsonb_build_object('producer', 'lifeos-similarity-graph-node',
                         'chunk_key', node_row.chunk_key),
      'graph-node');
    witness := lifeos_semantic.witness_substrate(
      tenant, branch, 'semantic-graph', raw_object, 'graph-node',
      jsonb_build_object('chunk_key', node_row.chunk_key,
                         'generation', v_generation));
    INSERT INTO lifeos_semantic.graph_node (
      tenant_id, branch_id, node_kind, logical_key, source_object_id,
      source_range, properties, embedding_id, generation, witness_id
    ) VALUES (
      tenant, branch, 'document-chunk', node_row.chunk_key,
      node_row.source_object_id,
      int8range(node_row.byte_start, node_row.byte_end, '[)'),
      payload, node_row.embedding_id, v_generation, witness
    ) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      nodes_created := nodes_created + 1;
    END IF;
  END LOOP;

  FOR edge_row IN
    SELECT src.node_id AS from_node, dst.node_id AS to_node,
           src.logical_key AS from_key, dst.logical_key AS to_key,
           neighbour.distance
      FROM lifeos_semantic.graph_node src
      JOIN lifeos_semantic.embedding se ON se.embedding_id = src.embedding_id
      CROSS JOIN LATERAL (
        SELECT de.embedding_id,
               (se.embedding OPERATOR(extensions.<=>) de.embedding)::double precision
                 AS distance
          FROM lifeos_semantic.embedding de
         WHERE de.tenant_id = tenant AND de.branch_id = branch
           AND de.record_kind = 'embedding'
           AND de.metadata->>'corpus' = p_corpus
           AND de.embedding_id <> se.embedding_id
           AND de.dimension = se.dimension
         ORDER BY se.embedding OPERATOR(extensions.<=>) de.embedding
         LIMIT p_neighbors
      ) AS neighbour
      JOIN lifeos_semantic.graph_node dst
        ON dst.embedding_id = neighbour.embedding_id
       AND dst.generation = v_generation
     WHERE src.tenant_id = tenant AND src.branch_id = branch
       AND src.generation = v_generation
       AND src.node_kind = 'document-chunk'
       AND neighbour.distance <= p_max_distance
  LOOP
    payload := jsonb_build_object(
      'corpus', p_corpus, 'from_chunk', edge_row.from_key,
      'to_chunk', edge_row.to_key, 'metric', 'cosine',
      'distance', edge_row.distance,
      'similarity', 1.0 - edge_row.distance,
      'generation', v_generation);
    raw_object := lifeos_blob.store_bytes(
      tenant, convert_to(payload::text, 'UTF8'), 'application/json',
      jsonb_build_object('producer', 'lifeos-similarity-graph-edge',
                         'from_chunk', edge_row.from_key,
                         'to_chunk', edge_row.to_key),
      'graph-edge');
    witness := lifeos_semantic.witness_substrate(
      tenant, branch, 'semantic-graph', raw_object, 'graph-edge',
      jsonb_build_object('from_chunk', edge_row.from_key,
                         'to_chunk', edge_row.to_key,
                         'generation', v_generation));
    INSERT INTO lifeos_semantic.graph_edge (
      tenant_id, branch_id, from_node, to_node, edge_kind, weight,
      causal_direction, properties, source_object_id, generation, witness_id
    ) VALUES (
      tenant, branch, edge_row.from_node, edge_row.to_node,
      'semantic-neighbor', 1.0 - edge_row.distance, 0, payload,
      raw_object, v_generation, witness
    ) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      edges_created := edges_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'corpus', p_corpus, 'generation', v_generation,
    'nodes_created', nodes_created, 'edges_created', edges_created,
    'neighbors', p_neighbors, 'max_distance', p_max_distance,
    'unchanged', false);
END
$function$;

ALTER FUNCTION lifeos_semantic.build_similarity_graph(text, integer, double precision)
  OWNER TO lifeos_migrator;
