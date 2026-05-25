## ADDED Requirements

### Requirement: Node mirror storage

The system SHALL provide upsert / get / clear operations against a `mempalace_nodes` table whose columns are `id (TEXT PK)`, `kind (TEXT NOT NULL)`, `label (TEXT)`, `payload_json (TEXT NOT NULL)`, `last_synced_at (INTEGER NOT NULL)`.

#### Scenario: Upsert inserts a new node

- **WHEN** `mempalace::upsert_node(id, kind, label, payload_json, last_synced_at)` is called with an `id` not present in the table
- **THEN** a new row SHALL be inserted with the given values

#### Scenario: Upsert with existing id replaces payload and timestamp

- **WHEN** `upsert_node` is called twice with the same `id` and different `payload_json` / `last_synced_at`
- **THEN** the table SHALL contain exactly one row for that `id`
- **AND** the row SHALL hold the second call's `payload_json` and `last_synced_at`

#### Scenario: Get by id returns Some or None

- **WHEN** `mempalace::get_node(id)` is called
- **THEN** the result SHALL be `Some(Node)` if a row exists with that id
- **AND** SHALL be `None` otherwise

### Requirement: Edge mirror storage with foreign-key enforcement

The system SHALL provide upsert / get / clear operations against a `mempalace_edges` table keyed by `(from_id, to_id, kind)`. The table SHALL enforce `FOREIGN KEY (from_id, to_id) REFERENCES mempalace_nodes(id)` with `ON DELETE CASCADE`.

#### Scenario: Edge requires both endpoint nodes to exist

- **WHEN** `mempalace::upsert_edge(from_id, to_id, kind, ...)` is called where `from_id` or `to_id` is not present in `mempalace_nodes`
- **THEN** the call SHALL return `Err(StorageError::ForeignKeyViolation)`
- **AND** no row SHALL be inserted

#### Scenario: Composite key prevents duplicates

- **WHEN** `upsert_edge` is called twice with identical `(from_id, to_id, kind)` and different payloads
- **THEN** the table SHALL contain exactly one row for that triple
- **AND** the row SHALL hold the second call's payload

#### Scenario: Cascading delete removes incident edges

- **WHEN** a node `N` with incident edges in `mempalace_edges` is deleted via raw SQL `DELETE FROM mempalace_nodes WHERE id = ?`
- **THEN** every edge with `from_id = N` or `to_id = N` SHALL also be removed
- **AND** edges between unrelated nodes SHALL remain

### Requirement: Drawer mirror storage

The system SHALL provide upsert / get / clear operations against a `mempalace_drawers` table whose columns are `id (TEXT PK)`, `name (TEXT NOT NULL)`, `payload_json (TEXT NOT NULL)`, `last_synced_at (INTEGER NOT NULL)`.

#### Scenario: Upsert and get round-trip preserves payload

- **WHEN** `mempalace::upsert_drawer(id, name, payload_json, last_synced_at)` is followed by `mempalace::get_drawer(id)`
- **THEN** the returned drawer's fields SHALL byte-for-byte equal the input values

### Requirement: Bulk clear

The system SHALL provide `mempalace::clear()` that empties all three mempalace mirror tables in a single transaction.

#### Scenario: Clear empties all three tables

- **WHEN** `mempalace::clear()` is called against a populated database
- **THEN** subsequent `SELECT COUNT(*)` against `mempalace_nodes`, `mempalace_edges`, `mempalace_drawers` SHALL each return `0`

### Requirement: Read-only sync direction

This change SHALL NOT introduce any code path that writes from local mirror tables back to MempPalace MCP endpoints. Mirror tables are populated solely by future read-through code that consumes MCP query responses (out of scope for this change).

#### Scenario: No write-back code paths exist

- **WHEN** the codebase is searched for calls to MempPalace MCP write endpoints (`mempalace_kg_add`, `mempalace_add_drawer`, `mempalace_create_tunnel`, `mempalace_update_drawer`, `mempalace_kg_invalidate`)
- **THEN** no such calls SHALL exist within the `storage::mempalace` module
