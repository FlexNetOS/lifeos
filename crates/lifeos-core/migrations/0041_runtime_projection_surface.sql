-- LifeOS migration 0041 — restore the durable UI projection surface.
--
-- Migration 0011 preserves the pre-S16 projection relation as
-- lifeos_runtime.projection_pre_s16 while the blueprint's S16 catalog is
-- installed. The Glass persistence contract still needs a small keyed JSONB
-- projection relation for ui-state, lighting-state, and ai-provider. Keep
-- that surface append-aware and tenant-scoped; the preserved relation remains
-- historical compatibility data and is never reused as the active store.

CREATE TABLE IF NOT EXISTS lifeos_runtime.projection (
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  projection_key text NOT NULL,
  payload_json jsonb NOT NULL,
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, projection_key)
);

ALTER TABLE lifeos_runtime.projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifeos_runtime.projection FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projection_tenant_isolation ON lifeos_runtime.projection;
CREATE POLICY projection_tenant_isolation
  ON lifeos_runtime.projection
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
  INSERT INTO lifeos_runtime.projection
    (tenant_id, projection_key, payload_json, generation, updated_at)
  VALUES (lifeos_security.current_tenant(), p_projection_key, p_payload, 1,
          CURRENT_TIMESTAMP)
  ON CONFLICT (tenant_id, projection_key) DO UPDATE SET
    payload_json = EXCLUDED.payload_json,
    generation = lifeos_runtime.projection.generation + 1,
    updated_at = CURRENT_TIMESTAMP;
END
$function$;

ALTER FUNCTION lifeos_runtime.put_projection(text, jsonb)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_runtime.put_projection(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_runtime.put_projection(text, jsonb)
  TO lifeos_runtime, lifeos_envctl;
GRANT SELECT ON lifeos_runtime.projection TO lifeos_runtime, lifeos_envctl;
