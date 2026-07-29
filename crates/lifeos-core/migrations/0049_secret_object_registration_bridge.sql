-- LifeOS migration 0049 — canonical ciphertext-backed secret registration.
--
-- The application may submit already-encrypted bytes for custody, but it never
-- writes a plaintext secret into PostgreSQL. Mint, authorize, relay, rotate,
-- and revoke remain behind the existing S16 authority procedures.

CREATE OR REPLACE FUNCTION lifeos_security.register_secret_object(
  p_secret_key text,
  p_target_scope jsonb,
  p_purpose_scope text[],
  p_raw_object_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  secret_id uuid;
  existing lifeos_security.secret_object%ROWTYPE;
BEGIN
  IF nullif(trim(p_secret_key), '') IS NULL
     OR jsonb_typeof(coalesce(p_target_scope, '{}'::jsonb)) <> 'object'
     OR coalesce(array_length(p_purpose_scope, 1), 0) = 0
     OR NOT lifeos_blob.verify_object(p_raw_object_id) THEN
    RAISE EXCEPTION 'secret registration requires a key, object scope, purpose, and verified bytes';
  END IF;

  INSERT INTO lifeos_security.secret_object (
    tenant_id, secret_key, target_scope, purpose_scope, raw_object_id
  ) VALUES (
    tenant, trim(p_secret_key), p_target_scope, p_purpose_scope, p_raw_object_id
  )
  ON CONFLICT (tenant_id, secret_key) DO NOTHING
  RETURNING secret_object_id INTO secret_id;

  IF secret_id IS NULL THEN
    SELECT * INTO STRICT existing
    FROM lifeos_security.secret_object
    WHERE tenant_id = tenant AND secret_key = trim(p_secret_key)
    FOR SHARE;
    IF existing.target_scope IS DISTINCT FROM p_target_scope
       OR existing.purpose_scope IS DISTINCT FROM p_purpose_scope THEN
      RAISE EXCEPTION 'secret registration conflicts with the existing scope';
    END IF;
    secret_id := existing.secret_object_id;
  END IF;
  RETURN secret_id;
END
$function$;

ALTER FUNCTION lifeos_security.register_secret_object(text, jsonb, text[], uuid)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_security.register_secret_object(text, jsonb, text[], uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_security.register_secret_object(text, jsonb, text[], uuid)
  TO lifeos_runtime, lifeos_envctl;
