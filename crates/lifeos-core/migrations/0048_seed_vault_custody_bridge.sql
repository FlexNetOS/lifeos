-- LifeOS migration 0048 — Seed Vault custody registration.
-- The seed remains in the OS custody provider; PostgreSQL receives only its
-- digest, derivation context, and byte-backed provenance.

CREATE OR REPLACE FUNCTION lifeos_security.register_seed_vault_root(
  p_seed_digest bytea,
  p_custody_provider text,
  p_derivation_context jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  root_id uuid;
  raw_object uuid;
  payload jsonb;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF octet_length(p_seed_digest) <> 32
     OR btrim(coalesce(p_custody_provider, '')) = ''
     OR jsonb_typeof(coalesce(p_derivation_context, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'invalid Seed Vault custody registration';
  END IF;
  payload := jsonb_build_object(
    'record_kind', 'seed-vault-root',
    'seed_digest', encode(p_seed_digest, 'hex'),
    'custody_provider', p_custody_provider,
    'derivation_context', p_derivation_context
  );
  raw_object := lifeos_blob.store_bytes(
    tenant, convert_to(payload::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer','lifeos-seed-vault'),
    'seed-vault-registration');
  INSERT INTO lifeos_security.seed_vault_record (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, valid_time)
  VALUES (
    tenant, 'seed-vault-root', raw_object, payload,
    extensions.digest(convert_to(payload::text, 'UTF8'), 'sha256'),
    'seed-vault-root:' || encode(p_seed_digest, 'hex'),
    tstzrange(statement_timestamp(), NULL, '[)'))
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING seed_vault_record_id INTO root_id;
  IF root_id IS NULL THEN
    SELECT seed_vault_record_id INTO STRICT root_id
    FROM lifeos_security.seed_vault_record
    WHERE tenant_id = tenant
      AND idempotency_key = 'seed-vault-root:' || encode(p_seed_digest, 'hex');
  END IF;
  RETURN root_id;
END
$function$;

ALTER FUNCTION lifeos_security.register_seed_vault_root(bytea, text, jsonb)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_security.register_seed_vault_root(bytea, text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_security.register_seed_vault_root(bytea, text, jsonb)
  TO lifeos_runtime, lifeos_envctl;
