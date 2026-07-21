-- JSON projections are durable PostgreSQL records, not app-data files. The
-- frontend retains its stable command payloads while this table supplies the
-- canonical state and monotonically increasing generation per projection.
CREATE TABLE lifeos_runtime.projection (
  projection_key  TEXT PRIMARY KEY,
  payload_json    JSONB NOT NULL,
  generation      BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
