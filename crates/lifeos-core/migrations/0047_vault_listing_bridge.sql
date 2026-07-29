-- LifeOS migration 0047 — non-secret vault listing bridge.
--
-- The Glass settings surface may see metadata only. Ciphertext, wrapping-key
-- references, nonces, and raw secret bytes never cross this function.

CREATE OR REPLACE FUNCTION lifeos_security.list_vault_entries()
RETURNS TABLE (
  id text,
  label text,
  kind text,
  masked_preview text,
  last_rotated text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_security
AS $function$
  SELECT
    secret.secret_key,
    coalesce(secret.target_scope->>'label', secret.secret_key),
    coalesce(secret.target_scope->>'kind', 'password'),
    coalesce(secret.target_scope->>'masked_preview', '••••'),
    coalesce(
      to_char(max(version.created_at), 'YYYY-MM-DD'),
      to_char(secret.created_at, 'YYYY-MM-DD')
    )
  FROM lifeos_security.secret_object secret
  LEFT JOIN lifeos_security.secret_version version
    ON version.secret_object_id = secret.secret_object_id
   AND version.tenant_id = secret.tenant_id
   AND version.retired_at IS NULL
  WHERE secret.tenant_id = lifeos_security.current_tenant()
  GROUP BY secret.secret_key, secret.target_scope, secret.created_at
  ORDER BY secret.secret_key
$function$;

ALTER FUNCTION lifeos_security.list_vault_entries()
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_security.list_vault_entries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_security.list_vault_entries()
  TO lifeos_runtime, lifeos_envctl;
