-- Raw coordinate bytes are the reconstruction source. The normalized RuVector
-- projection is nullable only for non-finite diagnostic vectors; valid model
-- vectors always receive both forms in the same transaction.
CREATE TABLE lifeos_semantic.embedding (
  id              TEXT PRIMARY KEY,
  collection      TEXT NOT NULL,
  dim             INTEGER NOT NULL CHECK (dim > 0 AND dim <= 16384),
  raw_vector      BYTEA NOT NULL,
  embedding       extensions.ruvector,
  metadata_json   JSONB,
  last_synced_at  TIMESTAMPTZ NOT NULL,
  CHECK (octet_length(raw_vector) = dim * 4)
);
CREATE INDEX lifeos_semantic_embedding_collection_idx
  ON lifeos_semantic.embedding(collection);

CREATE TABLE lifeos_semantic.gnn_cache (
  cache_key       TEXT PRIMARY KEY,
  payload         BYTEA NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL
);
