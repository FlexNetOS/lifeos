-- LifeOS migration 0089 — correct the substrate producers' conflict targets.
--
-- `lifeos_ops.create_canonical_table` builds the idempotency index as a
-- PARTIAL unique index (`WHERE idempotency_key IS NOT NULL`), so a bare
-- `ON CONFLICT (tenant_id, idempotency_key)` cannot infer it and every insert
-- in migration 0088 failed with "no unique or exclusion constraint matching
-- the ON CONFLICT specification". `lifeos_semantic.transform` is the one
-- exception — it carries an additional non-partial index — which is why the
-- pre-existing `append_embedding_projection` works with the bare form and
-- these producers did not.
--
-- Two fixes, applied to every producer that writes a canonical envelope:
--   * the conflict target repeats the index predicate, and
--   * the returned id is captured into a `v_`-prefixed variable, so the
--     `RETURNING` column reference is unambiguous without schema-qualifying
--     it (which PostgreSQL rejects).

CREATE OR REPLACE FUNCTION lifeos_semantic.record_index_generation(
  p_index_kind text,
  p_corpus text,
  p_dimension integer,
  p_parameters jsonb,
  p_statistics jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_agent, lifeos_blob,
                  lifeos_security, lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  payload jsonb;
  raw_object uuid;
  witness uuid;
  chain uuid;
  seq bigint;
  v_generation_id uuid;
  idem text;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  branch := lifeos_semantic.substrate_branch(tenant);
  IF branch IS NULL THEN
    RAISE EXCEPTION 'no runtime branch exists for tenant %', tenant;
  END IF;

  payload := jsonb_build_object(
    'index_kind', p_index_kind, 'corpus', p_corpus,
    'dimension', p_dimension, 'branch_id', branch,
    'parameters', coalesce(p_parameters, '{}'::jsonb),
    'statistics', coalesce(p_statistics, '{}'::jsonb));
  raw_object := lifeos_blob.store_bytes(
    tenant, convert_to(payload::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer', 'lifeos-index-generation',
                       'index_kind', p_index_kind, 'corpus', p_corpus),
    'index-generation');
  witness := lifeos_semantic.witness_substrate(
    tenant, branch, 'index-generation', raw_object, 'index-generation',
    jsonb_build_object('corpus', p_corpus, 'index_kind', p_index_kind));
  SELECT w.chain_id, w.sequence INTO chain, seq
    FROM lifeos_agent.witness_entry w WHERE w.witness_id = witness;

  idem := 'index-generation:' || p_index_kind || ':' || p_corpus || ':' ||
          encode(extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO lifeos_semantic.index_generation (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, witness_chain_id, witness_sequence
  ) VALUES (
    tenant, branch, 'index-generation', raw_object, payload,
    extensions.digest(lifeos_blob.canonical_jsonb_bytes(payload), 'sha256'),
    idem, chain, seq
  )
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING index_generation_id INTO v_generation_id;

  IF v_generation_id IS NULL THEN
    SELECT g.index_generation_id INTO STRICT v_generation_id
      FROM lifeos_semantic.index_generation g
     WHERE g.tenant_id = tenant AND g.idempotency_key = idem;
  END IF;
  RETURN v_generation_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_agent.register_model(
  p_model_key text,
  p_engine text,
  p_role text,
  p_descriptor_bytes bytea
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_agent, lifeos_blob,
                  lifeos_security, lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  raw_object uuid;
  payload jsonb;
  witness uuid;
  chain uuid;
  seq bigint;
  v_model_id uuid;
  idem text;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_model_key IS NULL OR btrim(p_model_key) = ''
     OR p_engine IS NULL OR btrim(p_engine) = '' THEN
    RAISE EXCEPTION 'model key and engine are required';
  END IF;
  IF p_descriptor_bytes IS NULL OR octet_length(p_descriptor_bytes) = 0 THEN
    RAISE EXCEPTION 'model descriptor bytes are required';
  END IF;
  branch := lifeos_semantic.substrate_branch(tenant);

  raw_object := lifeos_blob.store_bytes(
    tenant, p_descriptor_bytes, 'application/json',
    jsonb_build_object('producer', 'lifeos-model-registry',
                       'model_key', p_model_key, 'engine', p_engine),
    'model-descriptor');
  payload := jsonb_build_object(
    'model_key', p_model_key, 'engine', p_engine, 'role', p_role,
    'branch_id', branch,
    'descriptor_sha256',
      encode(extensions.digest(p_descriptor_bytes, 'sha256'), 'hex'),
    'model_digest',
      encode(extensions.digest(p_descriptor_bytes, 'sha256'), 'hex'));
  witness := lifeos_semantic.witness_substrate(
    tenant, branch, 'model-registry', raw_object, 'model',
    jsonb_build_object('model_key', p_model_key));
  SELECT w.chain_id, w.sequence INTO chain, seq
    FROM lifeos_agent.witness_entry w WHERE w.witness_id = witness;

  idem := 'model:' || p_model_key || ':' ||
          encode(extensions.digest(p_descriptor_bytes, 'sha256'), 'hex');
  INSERT INTO lifeos_agent.model (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, witness_chain_id, witness_sequence
  ) VALUES (
    tenant, branch, 'model', raw_object, payload,
    extensions.digest(lifeos_blob.canonical_jsonb_bytes(payload), 'sha256'),
    idem, chain, seq
  )
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING model_id INTO v_model_id;

  IF v_model_id IS NULL THEN
    SELECT m.model_id INTO STRICT v_model_id FROM lifeos_agent.model m
     WHERE m.tenant_id = tenant AND m.idempotency_key = idem;
  END IF;
  RETURN v_model_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_agent.record_model_invocation(
  p_model_id uuid,
  p_purpose text,
  p_input_bytes bytea,
  p_output_bytes bytea,
  p_statistics jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_agent, lifeos_blob,
                  lifeos_security, lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  model_row lifeos_agent.model%ROWTYPE;
  input_object uuid;
  output_object uuid;
  payload jsonb;
  raw_object uuid;
  witness uuid;
  chain uuid;
  seq bigint;
  v_invocation_id uuid;
  idem text;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  SELECT * INTO STRICT model_row FROM lifeos_agent.model
   WHERE model_id = p_model_id AND tenant_id = tenant;
  IF p_input_bytes IS NULL OR octet_length(p_input_bytes) = 0
     OR p_output_bytes IS NULL OR octet_length(p_output_bytes) = 0 THEN
    RAISE EXCEPTION 'model invocation must carry both input and output bytes';
  END IF;
  branch := lifeos_semantic.substrate_branch(tenant);

  input_object := lifeos_blob.store_bytes(
    tenant, p_input_bytes, 'application/json',
    jsonb_build_object('producer', 'lifeos-model-io', 'direction', 'input',
                       'model_id', p_model_id),
    'model-io-input');
  output_object := lifeos_blob.store_bytes(
    tenant, p_output_bytes, 'application/json',
    jsonb_build_object('producer', 'lifeos-model-io', 'direction', 'output',
                       'model_id', p_model_id),
    'model-io-output');

  payload := jsonb_build_object(
    'model_id', p_model_id, 'branch_id', branch, 'purpose', p_purpose,
    'input_object_id', input_object, 'output_object_id', output_object,
    'input_sha256', encode(extensions.digest(p_input_bytes, 'sha256'), 'hex'),
    'output_sha256', encode(extensions.digest(p_output_bytes, 'sha256'), 'hex'),
    'statistics', coalesce(p_statistics, '{}'::jsonb));
  raw_object := lifeos_blob.store_bytes(
    tenant, convert_to(payload::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer', 'lifeos-model-invocation',
                       'model_id', p_model_id, 'purpose', p_purpose),
    'model-invocation');
  witness := lifeos_semantic.witness_substrate(
    tenant, branch, 'model-invocation', raw_object, 'model-invocation',
    jsonb_build_object('model_id', p_model_id, 'purpose', p_purpose));
  SELECT w.chain_id, w.sequence INTO chain, seq
    FROM lifeos_agent.witness_entry w WHERE w.witness_id = witness;

  idem := 'model-invocation:' || p_model_id::text || ':' ||
          encode(extensions.digest(p_input_bytes || p_output_bytes, 'sha256'), 'hex');
  INSERT INTO lifeos_agent.model_invocation (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, witness_chain_id, witness_sequence
  ) VALUES (
    tenant, branch, 'model-invocation', raw_object, payload,
    extensions.digest(lifeos_blob.canonical_jsonb_bytes(payload), 'sha256'),
    idem, chain, seq
  )
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING model_invocation_id INTO v_invocation_id;

  IF v_invocation_id IS NULL THEN
    SELECT i.model_invocation_id INTO STRICT v_invocation_id
      FROM lifeos_agent.model_invocation i
     WHERE i.tenant_id = tenant AND i.idempotency_key = idem;
    RETURN v_invocation_id;
  END IF;

  INSERT INTO lifeos_agent.model_io (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, witness_chain_id, witness_sequence
  )
  SELECT tenant, branch, 'model-io', io.object_id,
         jsonb_build_object('model_invocation_id', v_invocation_id,
                            'model_id', p_model_id,
                            'direction', io.direction,
                            'byte_length', o.byte_length,
                            'sha256', encode(o.sha256, 'hex')),
         extensions.digest(lifeos_blob.canonical_jsonb_bytes(
           jsonb_build_object('model_invocation_id', v_invocation_id,
                              'model_id', p_model_id,
                              'direction', io.direction,
                              'byte_length', o.byte_length,
                              'sha256', encode(o.sha256, 'hex'))), 'sha256'),
         'model-io:' || v_invocation_id::text || ':' || io.direction,
         chain, seq
    FROM (VALUES (input_object, 'input'), (output_object, 'output'))
           AS io(object_id, direction)
    JOIN lifeos_blob.object o ON o.object_id = io.object_id
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING;

  RETURN v_invocation_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_semantic.record_pipeline_causality(p_corpus text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_agent, lifeos_blob,
                  lifeos_security, lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  link record;
  payload jsonb;
  raw_object uuid;
  witness uuid;
  chain uuid;
  seq bigint;
  idem text;
  created bigint := 0;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  branch := lifeos_semantic.substrate_branch(tenant);

  FOR link IN
    SELECT 'blob-object' AS cause_kind, o.object_id::text AS cause_id,
           'embedding' AS effect_kind, e.embedding_id::text AS effect_id,
           e.metadata->>'chunk_key' AS chunk_key,
           extract(epoch FROM (t.created_at - o.created_at)) * 1000.0 AS lag_ms
      FROM lifeos_semantic.embedding e
      JOIN lifeos_blob.object o ON o.object_id = e.source_object_id
      JOIN lifeos_semantic.transform t ON t.transform_id = e.transform_id
     WHERE e.tenant_id = tenant AND e.branch_id = branch
       AND e.record_kind = 'embedding'
       AND e.metadata->>'corpus' = p_corpus
       AND t.created_at >= o.created_at
  LOOP
    payload := jsonb_build_object(
      'corpus', p_corpus,
      'relation', 'derived-from',
      'cause_kind', link.cause_kind, 'cause_id', link.cause_id,
      'effect_kind', link.effect_kind, 'effect_id', link.effect_id,
      'chunk_key', link.chunk_key,
      'observed_lag_ms', link.lag_ms,
      'evidence', 'embedding.source_object_id references the captured object '
                  'and its transform was recorded after the object was stored');
    raw_object := lifeos_blob.store_bytes(
      tenant, convert_to(payload::text, 'UTF8'), 'application/json',
      jsonb_build_object('producer', 'lifeos-pipeline-causality',
                         'chunk_key', link.chunk_key),
      'causal-edge');
    witness := lifeos_semantic.witness_substrate(
      tenant, branch, 'pipeline-causality', raw_object, 'causal-edge',
      jsonb_build_object('chunk_key', link.chunk_key));
    SELECT w.chain_id, w.sequence INTO chain, seq
      FROM lifeos_agent.witness_entry w WHERE w.witness_id = witness;

    idem := 'causal:' || link.cause_id || ':' || link.effect_id;
    INSERT INTO lifeos_semantic.causal_edge (
      tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
      record_digest, idempotency_key, witness_chain_id, witness_sequence
    ) VALUES (
      tenant, branch, 'pipeline-lineage', raw_object, payload,
      extensions.digest(lifeos_blob.canonical_jsonb_bytes(payload), 'sha256'),
      idem, chain, seq
    )
    ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING;
    IF FOUND THEN
      created := created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('corpus', p_corpus, 'causal_edges_created', created);
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_agent.issue_forecast(
  p_series_key text,
  p_method text,
  p_horizon integer,
  p_history jsonb,
  p_prediction jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_agent, lifeos_blob,
                  lifeos_security, lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  payload jsonb;
  raw_object uuid;
  witness uuid;
  chain uuid;
  seq bigint;
  v_forecast_id uuid;
  idem text;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF p_prediction IS NULL OR NOT (p_prediction ? 'value') THEN
    RAISE EXCEPTION 'forecast prediction must carry a value';
  END IF;
  IF p_history IS NULL
     OR jsonb_array_length(coalesce(p_history->'samples', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'forecast must be derived from a non-empty observed history';
  END IF;
  branch := lifeos_semantic.substrate_branch(tenant);

  payload := jsonb_build_object(
    'series_key', p_series_key, 'method', p_method, 'horizon', p_horizon,
    'branch_id', branch, 'history', p_history, 'prediction', p_prediction,
    'issued_at', to_char(clock_timestamp() AT TIME ZONE 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  raw_object := lifeos_blob.store_bytes(
    tenant, convert_to(payload::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer', 'lifeos-forecast',
                       'series_key', p_series_key, 'method', p_method),
    'forecast');
  witness := lifeos_semantic.witness_substrate(
    tenant, branch, 'forecast', raw_object, 'forecast',
    jsonb_build_object('series_key', p_series_key));
  SELECT w.chain_id, w.sequence INTO chain, seq
    FROM lifeos_agent.witness_entry w WHERE w.witness_id = witness;

  idem := 'forecast:' || p_series_key || ':' ||
          encode(extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO lifeos_agent.forecast (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, witness_chain_id, witness_sequence
  ) VALUES (
    tenant, branch, 'forecast', raw_object, payload,
    extensions.digest(lifeos_blob.canonical_jsonb_bytes(payload), 'sha256'),
    idem, chain, seq
  )
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING forecast_id INTO v_forecast_id;

  IF v_forecast_id IS NULL THEN
    SELECT f.forecast_id INTO STRICT v_forecast_id FROM lifeos_agent.forecast f
     WHERE f.tenant_id = tenant AND f.idempotency_key = idem;
  END IF;
  RETURN v_forecast_id;
END
$function$;

CREATE OR REPLACE FUNCTION lifeos_agent.score_forecast(
  p_forecast_id uuid,
  p_observed_value double precision
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_agent, lifeos_blob,
                  lifeos_security, lifeos_semantic
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  branch uuid;
  forecast_row lifeos_agent.forecast%ROWTYPE;
  predicted double precision;
  lower_bound double precision;
  upper_bound double precision;
  payload jsonb;
  raw_object uuid;
  witness uuid;
  chain uuid;
  seq bigint;
  v_observation_id uuid;
  idem text;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  SELECT * INTO STRICT forecast_row FROM lifeos_agent.forecast
   WHERE forecast_id = p_forecast_id AND tenant_id = tenant;
  branch := lifeos_semantic.substrate_branch(tenant);

  predicted := (forecast_row.typed_payload->'prediction'->>'value')::double precision;
  lower_bound := nullif(forecast_row.typed_payload->'prediction'->>'lower', '')::double precision;
  upper_bound := nullif(forecast_row.typed_payload->'prediction'->>'upper', '')::double precision;

  payload := jsonb_build_object(
    'forecast_id', p_forecast_id, 'branch_id', branch,
    'series_key', forecast_row.typed_payload->>'series_key',
    'method', forecast_row.typed_payload->>'method',
    'predicted', predicted,
    'observed', p_observed_value,
    'absolute_error', abs(p_observed_value - predicted),
    'signed_error', p_observed_value - predicted,
    'relative_error',
      CASE WHEN p_observed_value = 0 THEN NULL
           ELSE abs(p_observed_value - predicted) / abs(p_observed_value) END,
    'within_interval',
      CASE WHEN lower_bound IS NULL OR upper_bound IS NULL THEN NULL
           ELSE p_observed_value BETWEEN lower_bound AND upper_bound END,
    'observed_at', to_char(clock_timestamp() AT TIME ZONE 'UTC',
                           'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  raw_object := lifeos_blob.store_bytes(
    tenant, convert_to(payload::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer', 'lifeos-forecast-observation',
                       'forecast_id', p_forecast_id),
    'forecast-observation');
  witness := lifeos_semantic.witness_substrate(
    tenant, branch, 'forecast', raw_object, 'forecast-observation',
    jsonb_build_object('forecast_id', p_forecast_id));
  SELECT w.chain_id, w.sequence INTO chain, seq
    FROM lifeos_agent.witness_entry w WHERE w.witness_id = witness;

  idem := 'forecast-observation:' || p_forecast_id::text;
  INSERT INTO lifeos_agent.forecast_observation (
    tenant_id, branch_id, record_kind, raw_object_id, typed_payload,
    record_digest, idempotency_key, witness_chain_id, witness_sequence
  ) VALUES (
    tenant, branch, 'forecast-observation', raw_object, payload,
    extensions.digest(lifeos_blob.canonical_jsonb_bytes(payload), 'sha256'),
    idem, chain, seq
  )
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING forecast_observation_id INTO v_observation_id;

  IF v_observation_id IS NULL THEN
    SELECT o.forecast_observation_id INTO STRICT v_observation_id
      FROM lifeos_agent.forecast_observation o
     WHERE o.tenant_id = tenant AND o.idempotency_key = idem;
  END IF;
  RETURN v_observation_id;
END
$function$;

-- CREATE OR REPLACE preserves ownership and ACLs, so the SECURITY DEFINER
-- owner and the envctl EXECUTE grants from 0088 still stand. Re-asserted here
-- so the privilege shape is readable in one place rather than inferred.
ALTER FUNCTION lifeos_semantic.record_index_generation(text, text, integer, jsonb, jsonb)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_semantic.record_pipeline_causality(text) OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_agent.register_model(text, text, text, bytea) OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_agent.record_model_invocation(uuid, text, bytea, bytea, jsonb)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_agent.issue_forecast(text, text, integer, jsonb, jsonb)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_agent.score_forecast(uuid, double precision) OWNER TO lifeos_migrator;
