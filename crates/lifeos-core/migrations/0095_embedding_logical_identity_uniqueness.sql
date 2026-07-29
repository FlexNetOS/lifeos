-- LifeOS migration 0095 — preserve distinct logical embeddings for shared bytes.
--
-- The canonical blob layer deliberately deduplicates identical bytes.  The
-- original embedding uniqueness key treated a shared source object as a
-- duplicate even when two logical IDs legitimately projected those bytes.
-- Keep the byte identity and add the semantic logical identity to the key.

ALTER TABLE lifeos_semantic.embedding
  ADD COLUMN IF NOT EXISTS logical_id text
  GENERATED ALWAYS AS (metadata->>'logical_id') STORED;

ALTER TABLE lifeos_semantic.embedding
  DROP CONSTRAINT IF EXISTS embedding_branch_id_source_object_id_byte_start_byte_end_mo_key;

CREATE UNIQUE INDEX IF NOT EXISTS embedding_logical_identity_generation_unique
  ON lifeos_semantic.embedding (
    branch_id, source_object_id, byte_start, byte_end,
    model_digest, generation, dimension, logical_id
  );
