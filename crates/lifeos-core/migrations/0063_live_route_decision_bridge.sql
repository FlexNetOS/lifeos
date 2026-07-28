-- LifeOS migration 0063 — live AI dispatch route decisions.
-- Every Tauri ai_complete dispatch leaves a canonical, byte-backed decision
-- before the provider call begins.

CREATE OR REPLACE FUNCTION lifeos_agent.append_route_decision(
  p_route text,
  p_reason text,
  p_signals jsonb,
  p_policy jsonb,
  p_source text,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions, lifeos_blob, lifeos_agent,
                  lifeos_security
AS $function$
DECLARE
  tenant uuid := lifeos_security.current_tenant();
  payload jsonb;
  raw_object uuid;
  decision_id uuid;
BEGIN
  IF tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context is not bound';
  END IF;
  IF nullif(btrim(p_route), '') IS NULL
     OR nullif(btrim(p_reason), '') IS NULL
     OR nullif(btrim(p_source), '') IS NULL
     OR nullif(btrim(p_idempotency_key), '') IS NULL
     OR jsonb_typeof(p_signals) <> 'object'
     OR jsonb_typeof(p_policy) <> 'object' THEN
    RAISE EXCEPTION 'route decision requires non-empty route, reason, source, idempotency key, signals, and policy objects';
  END IF;

  payload := jsonb_build_object(
    'route', p_route,
    'reason', p_reason,
    'signals', p_signals,
    'policy', p_policy,
    'source', p_source
  );
  raw_object := lifeos_blob.store_bytes(
    tenant, convert_to(payload::text, 'UTF8'), 'application/json',
    jsonb_build_object('producer', 'lifeos-ai-dispatch', 'record_kind', 'route-decision', 'source', p_source),
    'ai-route-decision'
  );

  INSERT INTO lifeos_agent.route_decision
    (tenant_id, record_kind, raw_object_id, typed_payload, record_digest, idempotency_key)
  VALUES
    (tenant, 'route-decision', raw_object, payload,
     extensions.ruvector_shake256_256(convert_to(payload::text, 'UTF8')),
     p_idempotency_key)
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING route_decision_id INTO decision_id;

  IF decision_id IS NULL THEN
    SELECT route_decision_id INTO decision_id
      FROM lifeos_agent.route_decision
     WHERE tenant_id = tenant AND idempotency_key = p_idempotency_key;
  END IF;
  RETURN decision_id;
END
$function$;

ALTER FUNCTION lifeos_agent.append_route_decision(text, text, jsonb, jsonb, text, text)
  OWNER TO lifeos_envctl;
REVOKE ALL ON FUNCTION lifeos_agent.append_route_decision(text, text, jsonb, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_agent.append_route_decision(text, text, jsonb, jsonb, text, text)
  TO lifeos_runtime, lifeos_envctl;
