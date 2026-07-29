-- LifeOS migration 0068 — normalize RuVector loading and storage bridges.
--
-- The installed type I/O routines referenced the shared object by an
-- absolute path while SHAKE routines used $libdir. PostgreSQL loaded the same
-- library twice in one backend, so RuVector's GUC registration collided.

CREATE OR REPLACE FUNCTION extensions.ruvector_in(cstring)
RETURNS extensions.ruvector LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/ruvector', 'ruvector_in';
CREATE OR REPLACE FUNCTION extensions.ruvector_out(extensions.ruvector)
RETURNS cstring LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/ruvector', 'ruvector_out';
CREATE OR REPLACE FUNCTION extensions.ruvector_recv(internal)
RETURNS extensions.ruvector LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/ruvector', 'ruvector_recv';
CREATE OR REPLACE FUNCTION extensions.ruvector_send(extensions.ruvector)
RETURNS bytea LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/ruvector', 'ruvector_send';
CREATE OR REPLACE FUNCTION extensions.ruvector_typmod_in(cstring[])
RETURNS integer LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/ruvector', 'ruvector_typmod_in';
CREATE OR REPLACE FUNCTION extensions.ruvector_typmod_out(integer)
RETURNS cstring LANGUAGE C IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/ruvector', 'ruvector_typmod_out';

ALTER FUNCTION lifeos_security.update_identity_attributes(uuid,jsonb,bytea)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_agentdb.append_projection_record(regclass,text,text,jsonb,bytea)
  OWNER TO lifeos_migrator;

CREATE OR REPLACE FUNCTION lifeos_agentdb.append_projection_record(
  p_target regclass, p_record_kind text, p_logical_key text,
  p_typed_payload jsonb, p_raw_bytes bytea
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_agentdb,
                  lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  raw_object uuid;
  record_id uuid;
  idempotency text := p_record_kind || ':' || p_logical_key || ':' ||
    encode(extensions.digest(p_raw_bytes, 'sha256'), 'hex');
  target_name text;
  target_relation text;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  SELECT format('%I.%I', n.nspname, c.relname), c.relname
    INTO target_name, target_relation
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.oid = p_target;
  IF target_name NOT IN ('lifeos_agentdb.exp_nodes', 'lifeos_agentdb.exp_edges') THEN
    RAISE EXCEPTION 'unsupported AgentDB projection target %', target_name;
  END IF;
  raw_object := lifeos_blob.store_bytes(
    tenant, p_raw_bytes, 'application/json',
    jsonb_build_object('producer','lifeos-agentdb-projection',
                       'record_kind',p_record_kind,
                       'logical_key',p_logical_key),
    'agentdb-projection');
  EXECUTE format(
    'INSERT INTO %s
       (tenant_id, record_kind, raw_object_id, typed_payload,
        record_digest, idempotency_key)
     VALUES ($1, $2, $3, $4, extensions.ruvector_shake256_256($5), $6)
     ON CONFLICT DO NOTHING RETURNING %I',
    target_name, target_relation || '_id'
  ) USING tenant, p_record_kind, raw_object, p_typed_payload,
          p_raw_bytes, idempotency INTO record_id;
  IF record_id IS NULL THEN
    EXECUTE format(
      'SELECT %I FROM %s WHERE tenant_id=$1 AND idempotency_key=$2',
      target_relation || '_id', target_name
    ) USING tenant, idempotency INTO record_id;
  END IF;
  RETURN record_id;
END
$function$;
