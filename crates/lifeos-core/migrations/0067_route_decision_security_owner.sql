-- LifeOS migration 0067 — route decisions use the migrator-owned bridge.
-- envctl executes the routine but never receives direct table INSERT access.

ALTER FUNCTION lifeos_agent.append_route_decision(text, text, jsonb, jsonb, text, text)
  OWNER TO lifeos_migrator;
REVOKE ALL ON FUNCTION lifeos_agent.append_route_decision(text, text, jsonb, jsonb, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifeos_agent.append_route_decision(text, text, jsonb, jsonb, text, text)
  TO lifeos_runtime, lifeos_envctl;
