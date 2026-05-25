## ADDED Requirements

### Requirement: Vector encoding contract

The system SHALL encode `&[f32]` vectors as little-endian `f32` BLOBs of length `dim * 4` bytes via `ruvector::encode_vector` and SHALL decode them back via `ruvector::decode_vector`. The encode/decode pair SHALL be bit-exact round-trip safe, including for `NaN`, `Inf`, `-Inf`, and subnormal values.

#### Scenario: Round-trip preserves bit pattern

- **WHEN** a `Vec<f32>` `v` (including special values: `NaN`, `f32::INFINITY`, `f32::NEG_INFINITY`, `f32::MIN_POSITIVE / 2.0`, `0.0`, `-0.0`) is passed through `decode_vector(encode_vector(v))`
- **THEN** each output element SHALL match the input element bit-for-bit (`f32::to_bits` equality)

#### Scenario: Decode rejects misaligned input

- **WHEN** `decode_vector` is called with a byte slice whose length is not a multiple of 4
- **THEN** the call SHALL return `Err(StorageError::InvalidVectorBytes)`

### Requirement: Vector mirror storage

The system SHALL provide upsert / get / list-by-collection / clear-by-collection operations against a `ruvector_vectors` table whose columns are `id (TEXT PK)`, `collection (TEXT NOT NULL)`, `dim (INTEGER NOT NULL CHECK dim > 0 AND dim <= 16384)`, `vector (BLOB NOT NULL CHECK length(vector) = dim * 4)`, `metadata_json (TEXT)`, `last_synced_at (INTEGER NOT NULL)`.

#### Scenario: Upsert by id replaces existing row

- **WHEN** `ruvector::upsert_vector(id, collection, dim, vector_bytes, metadata, last_synced_at)` is called twice with the same `id` and different `vector_bytes`
- **THEN** the table SHALL contain exactly one row for that `id`
- **AND** the row SHALL hold the second call's `vector_bytes`

#### Scenario: List by collection returns scoped vectors

- **WHEN** vectors A and B are upserted into collection `"alpha"` and vector C into collection `"beta"`, then `ruvector::list_by_collection("alpha")` is called
- **THEN** the result SHALL contain exactly A and B
- **AND** SHALL NOT contain C

#### Scenario: dim CHECK rejects out-of-range values

- **WHEN** a raw `INSERT` attempts to write a row with `dim = 0` or `dim = 16385`
- **THEN** SQLite SHALL reject the insert with a CHECK constraint violation

#### Scenario: BLOB length CHECK rejects mismatched payload

- **WHEN** a raw `INSERT` attempts to write `dim = 8` with `length(vector) = 30` (should be 32)
- **THEN** SQLite SHALL reject the insert with a CHECK constraint violation

#### Scenario: Rust-side guard rejects mismatch before SQL

- **WHEN** `ruvector::upsert_vector` is called with `dim = 8` but `vector_bytes.len() = 30`
- **THEN** the call SHALL return `Err(StorageError::VectorLengthMismatch)` without reaching SQLite

### Requirement: GNN cache storage

The system SHALL provide upsert / get / clear operations against a `ruvector_gnn_cache` table whose columns are `cache_key (TEXT PK)`, `payload (BLOB NOT NULL)`, `computed_at (INTEGER NOT NULL)`.

#### Scenario: Upsert by cache key replaces payload

- **WHEN** `ruvector::upsert_gnn(cache_key, payload, computed_at)` is called twice with the same `cache_key`
- **THEN** the table SHALL contain exactly one row for that key
- **AND** the row SHALL hold the second call's `payload` and `computed_at`

#### Scenario: Get returns Some or None

- **WHEN** `ruvector::get_gnn(cache_key)` is called
- **THEN** the result SHALL be `Some(GnnCacheRow)` if a row exists for that key
- **AND** SHALL be `None` otherwise

### Requirement: Scoped clear functions

The system SHALL provide `ruvector::clear_collection(name)` that removes only vectors in the named collection, and `ruvector::clear_gnn_cache()` that empties the cache table.

#### Scenario: Clear collection scope is enforced

- **WHEN** vectors exist in collections `"alpha"` and `"beta"`, then `clear_collection("alpha")` is called
- **THEN** subsequent `list_by_collection("alpha")` SHALL return an empty list
- **AND** `list_by_collection("beta")` SHALL return its vectors unchanged

#### Scenario: Clear GNN cache empties cache without touching vectors

- **WHEN** `clear_gnn_cache()` is called against a database with both vectors and cache entries
- **THEN** `SELECT COUNT(*) FROM ruvector_gnn_cache` SHALL return `0`
- **AND** `SELECT COUNT(*) FROM ruvector_vectors` SHALL be unchanged
