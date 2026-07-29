-- LifeOS migration 0071 — run canonical embedding retirement as migrator.

ALTER FUNCTION lifeos_semantic.retire_embedding_collection(text)
  OWNER TO lifeos_migrator;
