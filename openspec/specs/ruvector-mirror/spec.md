## Requirements

### Requirement: Exact vector source bytes plus RuVector projection

The system SHALL preserve each vector's little-endian f32 source bytes in
`lifeos_semantic.embedding.raw_vector`, validate `octet_length(raw_vector) =
dim * 4`, and project finite coordinates into the `extensions.ruvector`
column. PostgreSQL/RuVector is the canonical semantic/vector authority.

#### Scenario: Bit-exact round-trip

- **WHEN** finite values, NaN, infinities, signed zero, or subnormal f32 values
  pass through `decode_vector(encode_vector(v))` and PostgreSQL storage
- **THEN** source bytes and f32 bit patterns SHALL round-trip exactly

#### Scenario: Non-finite values retain source without unsafe projection

- **WHEN** a vector contains a non-finite f32
- **THEN** raw bytes SHALL be retained
- **AND** the RuVector projection SHALL be `NULL`

#### Scenario: Invalid dimensions fail before persistence

- **WHEN** the declared dimension does not match raw-byte length
- **THEN** `upsert_vector` SHALL return `StorageError::VectorLengthMismatch`

### Requirement: Collection and cache operations

The system SHALL provide upsert, get, list-by-collection, clear-by-collection,
and GNN-cache operations in PostgreSQL. `lifeos_semantic.gnn_cache` is the
canonical reconstructable cache receipt; a redb hot cache, when introduced,
is transient and cannot replace it.

#### Scenario: Collection clear remains scoped

- **WHEN** `clear_collection("alpha")` is called
- **THEN** only `alpha` embeddings SHALL be removed

#### Scenario: GNN cache clear does not remove embeddings

- **WHEN** `clear_gnn_cache()` runs
- **THEN** only `lifeos_semantic.gnn_cache` SHALL be emptied
