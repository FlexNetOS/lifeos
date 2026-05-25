CREATE TABLE ruvector_vectors (
  id              TEXT    PRIMARY KEY,
  collection      TEXT    NOT NULL,
  dim             INTEGER NOT NULL CHECK (dim > 0 AND dim <= 16384),
  vector          BLOB    NOT NULL CHECK (length(vector) = dim * 4),
  metadata_json   TEXT,
  last_synced_at  INTEGER NOT NULL
);
CREATE INDEX ruvector_vectors_collection_idx ON ruvector_vectors(collection);
CREATE TABLE ruvector_gnn_cache (
  cache_key       TEXT    PRIMARY KEY,
  payload         BLOB    NOT NULL,
  computed_at     INTEGER NOT NULL
);
