-- LifeOS migration 0065 — close canonical storage SECURITY DEFINER ownership.
--
-- These routines are executable by envctl/runtime, but their bodies must run
-- with the migrator-owned table and schema privileges they require.

ALTER FUNCTION lifeos_security.register_identity(text,text,jsonb,bytea)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_agentdb.append_projection_record(regclass,text,text,jsonb,bytea)
  OWNER TO lifeos_migrator;
ALTER FUNCTION lifeos_semantic.append_embedding_projection(
  text,text,integer,bytea,text,jsonb,bigint,boolean
) OWNER TO lifeos_migrator;
