-- The former local mempalace projection becomes an AgentDB-owned durable
-- projection. The native AgentDB import remains a separate owner task; these
-- rows preserve the existing LifeOS surface without a second durable store.
CREATE TABLE lifeos_agentdb.exp_nodes (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  label           TEXT,
  payload_json    JSONB NOT NULL,
  last_synced_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE lifeos_agentdb.exp_edges (
  from_id         TEXT NOT NULL REFERENCES lifeos_agentdb.exp_nodes(id) ON DELETE CASCADE,
  to_id           TEXT NOT NULL REFERENCES lifeos_agentdb.exp_nodes(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  last_synced_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (from_id, to_id, kind)
);
CREATE INDEX lifeos_agentdb_exp_edges_to_idx ON lifeos_agentdb.exp_edges(to_id);

CREATE TABLE lifeos_agentdb.notes (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  last_synced_at  TIMESTAMPTZ NOT NULL
);
