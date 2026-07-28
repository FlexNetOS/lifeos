-- LifeOS migration 0045 — envctl-owned identity mutation bridge.
--
-- Identity updates must retain the new source bytes just like registration;
-- application code receives only a narrow bridge and never writes the catalog.

CREATE OR REPLACE FUNCTION lifeos_security.update_identity_attributes(
  p_identity_id uuid,
  p_attributes jsonb,
  p_raw_bytes bytea
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  raw_object uuid;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  raw_object := lifeos_blob.store_bytes(
    tenant, p_raw_bytes, 'application/json',
    jsonb_build_object('producer','lifeos-identity-mutation',
                       'identity_id',p_identity_id),
    'identity-mutation');
  UPDATE lifeos_security.identity
  SET attributes = p_attributes,
      raw_object_id = raw_object
  WHERE identity_id = p_identity_id
    AND tenant_id = tenant
    AND active_until IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active identity % does not exist in tenant', p_identity_id;
  END IF;
END
$function$;

ALTER FUNCTION lifeos_security.update_identity_attributes(uuid, jsonb, bytea)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_security.update_identity_attributes(uuid, jsonb, bytea)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_security.update_identity_attributes(uuid, jsonb, bytea)
  TO lifeos_runtime, lifeos_envctl;

CREATE OR REPLACE FUNCTION lifeos_security.deactivate_identity(
  p_identity_id uuid,
  p_raw_bytes bytea
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_blob, lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  raw_object uuid;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  raw_object := lifeos_blob.store_bytes(
    tenant, p_raw_bytes, 'application/json',
    jsonb_build_object('producer','lifeos-identity-deactivation',
                       'identity_id',p_identity_id),
    'identity-deactivation');
  UPDATE lifeos_security.identity
  SET active_until = CURRENT_TIMESTAMP,
      raw_object_id = raw_object
  WHERE identity_id = p_identity_id
    AND tenant_id = tenant
    AND active_until IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active identity % does not exist in tenant', p_identity_id;
  END IF;
END
$function$;

ALTER FUNCTION lifeos_security.deactivate_identity(uuid, bytea)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_security.deactivate_identity(uuid, bytea)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_security.deactivate_identity(uuid, bytea)
  TO lifeos_runtime, lifeos_envctl;
