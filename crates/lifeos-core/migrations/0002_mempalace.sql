CREATE TABLE mempalace_nodes (
  id              TEXT    PRIMARY KEY,
  kind            TEXT    NOT NULL,
  label           TEXT,
  payload_json    TEXT    NOT NULL,
  last_synced_at  INTEGER NOT NULL
);
CREATE TABLE mempalace_edges (
  from_id         TEXT    NOT NULL,
  to_id           TEXT    NOT NULL,
  kind            TEXT    NOT NULL,
  payload_json    TEXT    NOT NULL,
  last_synced_at  INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id, kind),
  FOREIGN KEY (from_id) REFERENCES mempalace_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id)   REFERENCES mempalace_nodes(id) ON DELETE CASCADE
);
CREATE INDEX mempalace_edges_to_idx ON mempalace_edges(to_id);
CREATE TABLE mempalace_drawers (
  id              TEXT    PRIMARY KEY,
  name            TEXT    NOT NULL,
  payload_json    TEXT    NOT NULL,
  last_synced_at  INTEGER NOT NULL
);
