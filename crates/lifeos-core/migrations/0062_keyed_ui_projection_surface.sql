-- LifeOS migration 0062 — separate keyed UI state from the S16 projection log.
--
-- Migration 0041 used the name `projection` for keyed JSON state, but the
-- blueprint's S16 catalog already owns that relation as an append-only,
-- byte-backed projection log.  Keep that canonical log authoritative and give
-- the Glass persistence contract its own keyed relation.

CREATE TABLE IF NOT EXISTS lifeos_runtime.ui_projection (
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  projection_key text NOT NULL,
  payload_json jsonb NOT NULL,
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, projection_key)
);

ALTER TABLE lifeos_runtime.ui_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_runtime.ui_projection FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ui_projection_tenant_isolation
  ON lifeos_runtime.ui_projection;
CREATE POLICY ui_projection_tenant_isolation
  ON lifeos_runtime.ui_projection
  USING (tenant_id = lifeos_security.current_tenant())
  WITH CHECK (tenant_id = lifeos_security.current_tenant());

CREATE OR REPLACE FUNCTION lifeos_runtime.put_projection(
  p_projection_key text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lifeos_security, lifeos_runtime
AS $function$
BEGIN
  INSERT INTO lifeos_runtime.ui_projection
    (tenant_id, projection_key, payload_json, generation, updated_at)
  VALUES (lifeos_security.current_tenant(), p_projection_key, p_payload, 1,
          CURRENT_TIMESTAMP)
  ON CONFLICT (tenant_id, projection_key) DO UPDATE SET
    payload_json = EXCLUDED.payload_json,
    generation = lifeos_runtime.ui_projection.generation + 1,
    updated_at = CURRENT_TIMESTAMP;
END
$function$;

ALTER FUNCTION lifeos_runtime.put_projection(text, jsonb)
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_runtime.put_projection(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_runtime.put_projection(text, jsonb)
  TO lifeos_runtime, lifeos_envctl;
GRANT SELECT ON lifeos_runtime.ui_projection TO lifeos_runtime, lifeos_envctl;
