-- LifeOS migration 0042 — envctl-owned canonical identity registration.
--
-- The S16 identity catalog requires UUID identity rows with a byte-backed raw
-- object. Keep that invariant behind the envctl-owned bridge so the shell
-- never writes the catalog directly or creates an unbacked identity.

CREATE OR REPLACE FUNCTION lifeos_security.register_identity(
  p_subject_kind text,
  p_subject_key text,
  p_attributes jsonb,
  p_raw_bytes bytea
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  raw_object uuid;
  identity_id uuid;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  raw_object := lifeos_blob.store_bytes(
    tenant,
    p_raw_bytes,
    'application/json',
    jsonb_build_object(
      'producer', 'lifeos-identity-registration',
      'subject_kind', p_subject_kind,
      'subject_key', p_subject_key,
      'source', coalesce(p_attributes->>'source', 'identity-registration')
    ),
    'identity-registration'
  );
  INSERT INTO lifeos_security.identity (
    tenant_id, subject_kind, subject_key, attributes, raw_object_id
  ) VALUES (
    tenant, p_subject_kind, p_subject_key, p_attributes, raw_object
  ) RETURNING lifeos_security.identity.identity_id INTO identity_id;
  RETURN identity_id;
END
$function$;

ALTER FUNCTION lifeos_security.register_identity(text, text, jsonb, bytea)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_security.register_identity(text, text, jsonb, bytea)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_security.register_identity(text, text, jsonb, bytea)
  TO lifeos_runtime, lifeos_envctl;
