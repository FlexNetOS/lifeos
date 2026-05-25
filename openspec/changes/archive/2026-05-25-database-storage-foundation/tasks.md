## 1. Workspace and feature flag setup

- [x] 1.1 Add `tokio` (optional, `rt-multi-thread + macros`) and `sqlx` (optional, `sqlite + tls-rustls + macros + migrate + runtime-tokio + chrono`) to `crates/lifeos-core/Cargo.toml`
- [x] 1.2 Declare `storage = ["dep:sqlx", "dep:tokio"]` feature and include in `default = ["mcp-http", "storage"]`
- [x] 1.3 Enable `storage` feature on the `lifeos-core` dep in `src-tauri/Cargo.toml` alongside `plugin-host`
- [x] 1.4 Verify `cargo check --workspace` and `cargo check -p lifeos-core --no-default-features` both succeed
- [x] 1.5 Verify `cargo tree -p lifeos-core --features storage | grep openssl-sys` is empty

## 2. Migration SQL files

- [x] 2.1 Create `crates/lifeos-core/migrations/` directory
- [x] 2.2 Write `0001_accounts.sql` per design D8 (accounts table + unique email index)
- [x] 2.3 Write `0002_mempalace.sql` per design D8 (nodes / edges with composite PK + FKs + cascade / drawers / to_id index)
- [x] 2.4 Write `0003_ruvector.sql` per design D8 (vectors with dim and length CHECKs + collection index / gnn_cache)

## 3. Storage core module

- [x] 3.1 Create `crates/lifeos-core/src/storage/mod.rs` with `pub struct Storage { pool: SqlitePool, db_path: String }` and `pub async fn new(url: &str) -> Result<Self, StorageError>`
- [x] 3.2 Wire `SqlitePoolOptions::after_connect` to apply `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000` on every new connection
- [x] 3.3 Set `max_connections(5)` and `min_connections(1)` on the pool
- [x] 3.4 Implement `pub async fn migrate(&self) -> Result<MigrateReport, StorageError>` using `sqlx::migrate!("./migrations").run(&self.pool)`
- [x] 3.5 Implement `pub async fn health(&self) -> Result<DbHealth, StorageError>` reading `_sqlx_migrations`
- [x] 3.6 Add `Storage::new_in_memory()` helper that delegates to `new("sqlite::memory:")`
- [x] 3.7 Add `crates/lifeos-core/src/storage/error.rs` with `pub enum StorageError` covering `DuplicateEmail`, `ForeignKeyViolation`, `InvalidVectorBytes`, `VectorLengthMismatch`, `CorruptJson`, `Sqlx(sqlx::Error)`, `Io(std::io::Error)`
- [x] 3.8 Re-export `Storage`, `DbHealth`, `MigrateReport`, `StorageError` from `crates/lifeos-core/src/lib.rs` behind `#[cfg(feature = "storage")]`

## 4. accounts module

- [x] 4.1 Add `crates/lifeos-core/src/storage/accounts.rs` with `pub struct AccountRow { id, email, display_name, password_hash, created_at, updated_at }` deriving `serde::Serialize`, `serde::Deserialize`, `sqlx::FromRow`
- [x] 4.2 Implement `pub async fn insert(pool: &SqlitePool, email, display_name, password_hash) -> Result<AccountRow, StorageError>` mapping SQLite UNIQUE violation to `StorageError::DuplicateEmail`
- [x] 4.3 Implement `pub async fn get_by_email(pool, email) -> Result<Option<AccountRow>, StorageError>`
- [x] 4.4 Implement `pub async fn update_password(pool, id, new_hash) -> Result<(), StorageError>` that also bumps `updated_at`
- [x] 4.5 Implement `pub async fn delete_all(pool) -> Result<u64, StorageError>` (used by `auth_reset_vault`)
- [x] 4.6 Implement `pub enum MigrateOutcome { Migrated, AlreadyMigrated, NoSource }` and `pub enum MigrateError { CorruptJson, Io(...), Sqlx(...) }`
- [x] 4.7 Implement `pub async fn migrate_from_json(pool, app_data_dir) -> Result<MigrateOutcome, MigrateError>` per design D7: empty-table guard, transaction-wrapped insert, RFC3339-UTC archive rename with colon-to-hyphen substitution
- [x] 4.8 Update `src-tauri/src/auth.rs`: replace `read_account` / `write_account` / `delete_account` JSON helpers with `accounts::*` calls; keep `account_path` only for the migration archive lookup; preserve every `#[tauri::command]` signature

## 5. mempalace module

- [x] 5.1 Add `crates/lifeos-core/src/storage/mempalace.rs` with `Node`, `Edge`, `Drawer` structs deriving `serde::Serialize`, `serde::Deserialize`, `sqlx::FromRow`
- [x] 5.2 Implement `upsert_node(pool, id, kind, label, payload_json, last_synced_at)` via `INSERT ... ON CONFLICT(id) DO UPDATE SET ...`
- [x] 5.3 Implement `get_node(pool, id) -> Result<Option<Node>, _>`
- [x] 5.4 Implement `upsert_edge(pool, from_id, to_id, kind, payload_json, last_synced_at)` mapping FK violation to `StorageError::ForeignKeyViolation`
- [x] 5.5 Implement `get_edge(pool, from_id, to_id, kind) -> Result<Option<Edge>, _>`
- [x] 5.6 Implement `upsert_drawer(pool, id, name, payload_json, last_synced_at)` and `get_drawer(pool, id)`
- [x] 5.7 Implement `clear(pool)` that runs `DELETE FROM mempalace_drawers; DELETE FROM mempalace_edges; DELETE FROM mempalace_nodes;` inside a single transaction

## 6. ruvector module

- [x] 6.1 Add `crates/lifeos-core/src/storage/ruvector.rs` with `pub fn encode_vector(v: &[f32]) -> Vec<u8>` and `pub fn decode_vector(b: &[u8]) -> Result<Vec<f32>, StorageError>` per design D9 (length-mod-4 guard)
- [x] 6.2 Add `VectorRow { id, collection, dim, vector, metadata_json, last_synced_at }` and `GnnCacheRow { cache_key, payload, computed_at }` (both `sqlx::FromRow`)
- [x] 6.3 Implement `upsert_vector(pool, id, collection, dim, vector_bytes, metadata, last_synced_at)` with Rust-side `vector_bytes.len() == dim * 4` guard before INSERT (returns `StorageError::VectorLengthMismatch` on mismatch)
- [x] 6.4 Implement `get_vector(pool, id) -> Result<Option<VectorRow>, _>` and `list_by_collection(pool, collection) -> Result<Vec<VectorRow>, _>`
- [x] 6.5 Implement `upsert_gnn(pool, cache_key, payload, computed_at)` and `get_gnn(pool, cache_key)`
- [x] 6.6 Implement `clear_collection(pool, name)` and `clear_gnn_cache(pool)`

## 7. Tauri shell integration

- [x] 7.1 In `src-tauri/src/lib.rs::run()`, replace the synchronous setup body with `tauri::Builder::default().setup(|app| { ... async block ... })` that resolves `app.path().app_data_dir()`, calls `Storage::new(format!("sqlite:{}?mode=rwc", db_path.display()).as_str()).await`, `storage.migrate().await`, `accounts::migrate_from_json(storage.pool(), &app_data_dir).await`, then `app.manage(storage)`. On any error return `Err(format!("LifeOS couldn't initialize storage at {db_path} — see logs."))`.
- [x] 7.2 Add `#[tauri::command] async fn db_health(storage: tauri::State<'_, Storage>) -> Result<DbHealth, String>`
- [x] 7.3 Add `#[tauri::command] async fn db_migrate(storage: tauri::State<'_, Storage>) -> Result<MigrateReport, String>`
- [x] 7.4 Register `db_health` and `db_migrate` in the existing `tauri::generate_handler!` invocation alongside the auth and AI commands

## 8. Tests

- [x] 8.1 `storage::tests::init_idempotency` — open in-memory pool, run `migrate()` twice, assert `_sqlx_migrations` row count is constant
- [x] 8.2 `storage::accounts::tests::round_trip` — insert / get / update / `updated_at >= created_at`; second insert with same email returns `DuplicateEmail`
- [x] 8.3 `storage::accounts::tests::migrate_from_json` — fixture `account.json` in `tempfile::tempdir()`; assert one row, archive file exists, JSON file removed; second call returns `AlreadyMigrated`; corrupt JSON returns `CorruptJson` and leaves file in place
- [x] 8.4 `storage::mempalace::tests::edge_fk` — upsert two nodes, upsert edge succeeds; upsert edge referencing missing node returns `ForeignKeyViolation`; cascade test removes incident edges on node delete
- [x] 8.5 `storage::ruvector::tests::vector_roundtrip` — `proptest` (or hand-rolled property loop) over `Vec<f32>` containing `NaN`, `±Inf`, subnormals, `±0.0`; assert bit-for-bit round-trip via `to_bits` equality
- [x] 8.6 `storage::ruvector::tests::check_constraints` — raw `sqlx::query(...)` insert with `dim = 0` and with `length(vector) != dim * 4` both rejected by SQLite; Rust-side guard also rejects mismatch with `VectorLengthMismatch`
- [x] 8.7 Workspace assertion script: `cargo tree -p lifeos-core --features storage` does not contain `openssl-sys`; `cargo tree -p lifeos-core --no-default-features` does not contain `sqlx` or `tokio` (CI gate; either a bash one-liner in a justfile or a `#[test]` that shells out)
- [x] 8.8 `bun test` continues to pass (frontend store surface untouched)
- [x] 8.9 `bun run build` and `vue-tsc --noEmit` continue to pass
- [x] 8.10 Manual `bun run tauri:dev` smoke: (a) fresh `$APPDATA/lifeos` — app boots, `invoke('db_health')` returns `status: "ok"`, sign-up flow works; (b) pre-seeded `$APPDATA/lifeos/account.json` — app boots, `db_health` returns ok, sign-in works with the original password, `account.json.migrated-<timestamp>` archive present

## 9. Documentation

- [x] 9.1 Update `CLAUDE.md` "Architecture beats you only see by reading multiple files" section: add a "Storage layer (Rust-side only)" subsection covering the `storage` feature flag, `<app_data_dir>/lifeos.db` ownership, the `db_health` / `db_migrate` commands, and the explicit note that the frontend never touches the DB directly
- [x] 9.2 Update `AGENTS.md` verification commands to include `cargo test -p lifeos-core --features storage` and `cargo check -p lifeos-core --no-default-features`
- [x] 9.3 Add a `CHANGELOG.md` entry under the next version recording the `database-storage-foundation` summary, the four new capabilities, and the deferred items pulled from `TODO.md`
- [x] 9.4 In `TODO.md`, check off the `database-storage-foundation` items once Tasks 1–8 are green; leave the deferred entries (PG driver, sqlite-vec, write-back, sea-orm, tauri-plugin-sql, rusqlite) as-is for future audit
