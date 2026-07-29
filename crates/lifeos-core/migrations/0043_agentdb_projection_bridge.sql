-- LifeOS migration 0043 — envctl-owned AgentDB projection bridge.
--
-- The S16 AgentDB relations are generic, byte-backed canonical records. This
-- bridge gives the existing drawer API a stable logical-key surface without
-- reviving the pre-S16 exp_nodes/exp_edges/notes columns.

CREATE OR REPLACE FUNCTION lifeos_agentdb.append_projection_record(
  p_target regclass,
  p_record_kind text,
  p_logical_key text,
  p_typed_payload jsonb,
  p_raw_bytes bytea
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_agentdb,
                  lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  raw_object uuid;
  record_id uuid;
  idempotency text := p_record_kind || ':' || p_logical_key || ':' ||
    encode(extensions.digest(p_raw_bytes, 'sha256'), 'hex');
  target_name text := p_target::text;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF target_name NOT IN ('lifeos_agentdb.exp_nodes', 'lifeos_agentdb.exp_edges') THEN
    RAISE EXCEPTION 'unsupported AgentDB projection target %', target_name;
  END IF;
  raw_object := lifeos_blob.store_bytes(
    tenant, p_raw_bytes, 'application/json',
    jsonb_build_object('producer','lifeos-agentdb-projection',
                       'record_kind',p_record_kind,
                       'logical_key',p_logical_key),
    'agentdb-projection'
  );
  EXECUTE format(
    'INSERT INTO %s
       (tenant_id, record_kind, raw_object_id, typed_payload,
        record_digest, idempotency_key)
     VALUES ($1, $2, $3, $4, extensions.ruvector_shake256_256($5), $6)
     ON CONFLICT DO NOTHING
     RETURNING %I',
    target_name,
    split_part(target_name, '.', 2) || '_id'
  ) USING tenant, p_record_kind, raw_object, p_typed_payload,
          p_raw_bytes, idempotency
  INTO record_id;
  IF record_id IS NULL THEN
    EXECUTE format(
      'SELECT %I FROM %s WHERE tenant_id=$1 AND idempotency_key=$2',
      split_part(target_name, '.', 2) || '_id', target_name
    ) USING tenant, idempotency INTO record_id;
  END IF;
  RETURN record_id;
END
$function$;

ALTER FUNCTION lifeos_agentdb.append_projection_record(
  regclass, text, text, jsonb, bytea)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_agentdb.append_projection_record(
  regclass, text, text, jsonb, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_agentdb.append_projection_record(
  regclass, text, text, jsonb, bytea)
  TO lifeos_runtime, lifeos_envctl;

CREATE OR REPLACE FUNCTION lifeos_agentdb.clear_projection(p_target regclass)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_agentdb, lifeos_security
AS $function$
DECLARE
  row_value record;
  cleared bigint := 0;
  tombstone jsonb;
BEGIN
  IF p_target::text NOT IN ('lifeos_agentdb.exp_nodes', 'lifeos_agentdb.exp_edges') THEN
    RAISE EXCEPTION 'unsupported AgentDB projection target %', p_target;
  END IF;
  FOR row_value IN EXECUTE format(
    'SELECT DISTINCT ON (typed_payload->>''logical_key'')
       record_kind, typed_payload->>''logical_key'' AS logical_key
     FROM %s
     WHERE tenant_id = lifeos_security.current_tenant()
       AND coalesce((typed_payload->>''tombstone'')::boolean, false) = false
     ORDER BY typed_payload->>''logical_key'', sequence DESC', p_target)
  LOOP
    tombstone := jsonb_build_object(
      'logical_key', row_value.logical_key,
      'tombstone', true,
      'payload', '{}'::jsonb
    );
    PERFORM lifeos_agentdb.append_projection_record(
      p_target, row_value.record_kind, row_value.logical_key,
      tombstone, convert_to(tombstone::text, 'UTF8')
    );
    cleared := cleared + 1;
  END LOOP;
  RETURN cleared;
END
$function$;

ALTER FUNCTION lifeos_agentdb.clear_projection(regclass) OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_agentdb.clear_projection(regclass) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_agentdb.clear_projection(regclass)
  TO lifeos_runtime, lifeos_envctl;
