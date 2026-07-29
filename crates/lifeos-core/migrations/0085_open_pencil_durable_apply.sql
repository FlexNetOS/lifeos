-- LifeOS migration 0085 — OpenPencil durable Apply.
--
-- OpenPencil edits are buffered in Glass. Apply crosses the existing CodeDB
-- outbox and envctl commit boundary, then stores the exact UTF-8 source bytes
-- in lifeos_blob and publishes a maintained keyed projection. The projection
-- is a read model; the blob and append-only audit row remain authoritative.

CREATE TABLE IF NOT EXISTS lifeos_runtime.open_pencil_apply (
  tenant_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  relative_path text NOT NULL,
  source_sha256 text NOT NULL,
  object_id uuid NOT NULL,
  apply_payload jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, idempotency_key)
);

ALTER TABLE lifeos_runtime.open_pencil_apply ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_runtime.open_pencil_apply FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_pencil_apply_tenant_isolation
  ON lifeos_runtime.open_pencil_apply;
CREATE POLICY open_pencil_apply_tenant_isolation
  ON lifeos_runtime.open_pencil_apply
  USING (tenant_id = lifeos_security.current_tenant())
  WITH CHECK (tenant_id = lifeos_security.current_tenant());

CREATE OR REPLACE FUNCTION lifeos_runtime.apply_open_pencil(
  p_request jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_runtime,
                  lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  idempotency text := btrim(p_request->>'idempotency_key');
  relative_path text := p_request->>'relative_path';
  declared_sha text := lower(btrim(p_request->>'source_sha256'));
  raw_bytes bytea;
  actual_sha text;
  stored_object uuid;
  existing lifeos_runtime.open_pencil_apply%ROWTYPE;
  media_type text := coalesce(nullif(p_request->>'media_type', ''),
                              'text/plain; charset=utf-8');
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'OpenPencil Apply requires a bound tenant context';
  END IF;
  IF idempotency = '' OR length(idempotency) > 256 THEN
    RAISE EXCEPTION 'OpenPencil Apply idempotency_key is invalid';
  END IF;
  IF relative_path IS NULL OR relative_path = ''
     OR left(relative_path, 1) = '/'
     OR position(E'\\' in relative_path) > 0
     OR relative_path ~ '(^|/)(\\.|\\.\\.)(/|$)' THEN
    RAISE EXCEPTION 'OpenPencil Apply path must be clean and relative';
  END IF;
  IF declared_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'OpenPencil Apply source_sha256 must be lowercase hex';
  END IF;
  IF p_request->>'raw_bytes_base64' IS NULL THEN
    RAISE EXCEPTION 'OpenPencil Apply must carry exact raw bytes';
  END IF;

  raw_bytes := decode(p_request->>'raw_bytes_base64', 'base64');
  IF octet_length(raw_bytes) > 4 * 1024 * 1024 THEN
    RAISE EXCEPTION 'OpenPencil Apply source exceeds the 4 MiB bound';
  END IF;
  actual_sha := encode(digest(raw_bytes, 'sha256'), 'hex');
  IF actual_sha <> declared_sha THEN
    RAISE EXCEPTION 'OpenPencil Apply source digest does not match raw bytes';
  END IF;

  SELECT * INTO existing
  FROM lifeos_runtime.open_pencil_apply
  WHERE tenant_id = tenant AND idempotency_key = idempotency;
  IF FOUND THEN
    IF existing.relative_path <> relative_path
       OR existing.source_sha256 <> declared_sha THEN
      RAISE EXCEPTION 'OpenPencil Apply idempotency key was reused for different bytes';
    END IF;
    RETURN jsonb_build_object(
      'status', 'already_applied',
      'idempotency_key', idempotency,
      'relative_path', existing.relative_path,
      'source_sha256', existing.source_sha256,
      'object_id', existing.object_id,
      'applied_at', existing.applied_at
    );
  END IF;

  stored_object := lifeos_blob.store_bytes(
    tenant, raw_bytes, media_type,
    jsonb_build_object(
      'producer', 'open-pencil',
      'relative_path', relative_path,
      'idempotency_key', idempotency,
      'source_sha256', declared_sha,
      'apply_payload', p_request
    ),
    'open-pencil-apply', NULL
  );

  INSERT INTO lifeos_runtime.open_pencil_apply (
    tenant_id, idempotency_key, relative_path, source_sha256,
    object_id, apply_payload
  ) VALUES (
    tenant, idempotency, relative_path, declared_sha, stored_object, p_request
  );

  PERFORM lifeos_runtime.put_projection(
    'open-pencil/' || relative_path,
    jsonb_build_object(
      'schema_version', 'lifeos.open-pencil.projection.v1',
      'relative_path', relative_path,
      'source_sha256', declared_sha,
      'object_id', stored_object,
      'idempotency_key', idempotency,
      'applied_at', CURRENT_TIMESTAMP
    )
  );

  RETURN jsonb_build_object(
    'status', 'applied',
    'idempotency_key', idempotency,
    'relative_path', relative_path,
    'source_sha256', declared_sha,
    'object_id', stored_object
  );
END
$function$;

ALTER FUNCTION lifeos_runtime.apply_open_pencil(jsonb) OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_runtime.apply_open_pencil(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_runtime.apply_open_pencil(jsonb) TO lifeos_envctl;
GRANT SELECT ON lifeos_runtime.open_pencil_apply TO lifeos_envctl;
