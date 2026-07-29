-- LifeOS migration 0053 — retain tenant authority while recording revocation.
--
-- The revocation event trigger verifies its raw envelope through the active
-- runtime binding. Record the event before revoking the binding grants and
-- leases; otherwise current_tenant() becomes NULL during trigger execution.
CREATE OR REPLACE FUNCTION lifeos_security.revoke_secret(
  p_secret_object_id uuid,
  p_reason text,
  p_revocation_object_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  revocation_payload jsonb;
  new_revocation uuid;
BEGIN
  IF NOT lifeos_blob.verify_object(p_revocation_object_id) THEN
    RAISE EXCEPTION 'revocation record failed canonical verification';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM lifeos_security.current_binding() binding
    JOIN lifeos_security."grant" authority ON authority.grant_id = binding.grant_id
    WHERE binding.tenant_id = tenant
      AND binding.expires_at > statement_timestamp()
      AND authority.tenant_id = binding.tenant_id
      AND authority.identity_id = binding.identity_id
      AND authority.revoked_at IS NULL
      AND authority.expires_at > statement_timestamp()
      AND 'revoke-secret' = ANY(authority.action_scope)
      AND authority.resource_scope @> jsonb_build_object('secret_object_id', p_secret_object_id)
  ) THEN
    RAISE EXCEPTION 'secret revocation authority is not active';
  END IF;

  revocation_payload := jsonb_build_object(
    'secret_object_id', p_secret_object_id,
    'reason', p_reason,
    'revoked_at', statement_timestamp()
  );
  INSERT INTO lifeos_security.revocation (
    tenant_id, record_kind, raw_object_id, typed_payload, record_digest,
    idempotency_key, valid_time
  ) VALUES (
    tenant, 'secret-revocation', p_revocation_object_id,
    revocation_payload,
    extensions.digest(convert_to(revocation_payload::text, 'UTF8'), 'sha256'),
    p_secret_object_id::text || ':' || encode(
      extensions.digest(convert_to(p_reason, 'UTF8'), 'sha256'), 'hex'),
    tstzrange(statement_timestamp(), NULL, '[)')
  ) RETURNING revocation_id INTO new_revocation;

  UPDATE lifeos_security."grant" grant_row
  SET revoked_at = clock_timestamp()
  WHERE grant_row.tenant_id = tenant
    AND grant_row.resource_scope @> jsonb_build_object('secret_object_id', p_secret_object_id)
    AND grant_row.revoked_at IS NULL;
  UPDATE lifeos_security.secret_lease lease_row
  SET revoked_at = clock_timestamp()
  FROM lifeos_security.secret_version version_row
  WHERE lease_row.secret_version_id = version_row.secret_version_id
    AND version_row.secret_object_id = p_secret_object_id
    AND lease_row.revoked_at IS NULL;
  RETURN new_revocation;
END
$function$;

ALTER FUNCTION lifeos_security.revoke_secret(uuid, text, uuid)
  OWNER TO lifeos_migrator;
