## Context

LifeOS has zero database today. Account credentials live in a single JSON file at `<app_data_dir>/account.json` (read/write helpers in `src-tauri/src/auth.rs`); UI state lives in a `LIFEOS_PERSIST_KEYS` localStorage whitelist debounced through `src/lib/persistence.{ts,js}`. Wave 3 of the cross-platform foundation has just shipped read-only typed MCP clients for Cognitum-Seed and RuVector in `lifeos-core` (`crates/lifeos-core/src/mcp/`); MempPalace is the next MCP client queued. None of those clients have anywhere to land data locally.

Hard constraints inherited from the codebase (`CLAUDE.md`, `AGENTS.md`, existing `Cargo.toml`s):

- rustls only — no `openssl-sys` in the graph (`reqwest` is already pinned this way in both `src-tauri/Cargo.toml` and `crates/lifeos-core/Cargo.toml`).
- Tauri FS scope is locked to `$APPDATA/lifeos/*` — DB file must live there; no new capability grant.
- `lifeos-core` must compile with `default-features = false` for `no_std`/ESP32 consumers.
- The `mcp-http` and `plugin-host` features are the established pattern for opt-in/opt-out functionality in `lifeos-core`.
- The `.ts` ↔ `.js` sibling contract on `src/stores/lifeos.{ts,js}` and `src/lib/persistence.{ts,js}` is non-negotiable — the frontend store surface must not change.
- Tauri commands cannot be re-exported across crates, so `#[tauri::command]` wrappers stay in `src-tauri/src/`.

## Goals / Non-Goals

**Goals:**
- Add a single SQLite-backed storage layer to `lifeos-core` behind a new `storage` Cargo feature.
- Migrate the JSON-at-rest contract for accounts into a real `accounts` table without changing any Tauri command public surface.
- Land empty-but-typed mirror schemas for MempPalace (nodes/edges/drawers) and RuVector (vectors/GNN cache) so the next wave of MCP client work has somewhere to write.
- Preserve every hard constraint above.
- Verifiable via `cargo test -p lifeos-core --features storage`, `cargo check --workspace`, `cargo check -p lifeos-core --no-default-features`, `bun test`, `bun run build`, `bun run tauri:dev` boot smoke.

**Non-Goals (explicit, deferred to later OPSX changes):**
- PostgreSQL driver (separate change once cloud-sync requirements are concrete — alternatives documented in `TODO.md` under "Database driver alternatives").
- Write-back from local mirrors to MempPalace / RuVector servers.
- `sqlite-vec` extension for native KNN.
- Migrating `LIFEOS_PERSIST_KEYS` localStorage state into the DB.
- `@tauri-apps/plugin-sql` adoption (rejected; would break the `lifeos-daemon` Pi target).
- TTL / auto-refresh logic for mirror tables (only explicit `clear_*` functions in this change).
- Account-keyed cross-device sync (covered by `.claude/plan/account-keyed-sync-sketch.md`).

## Decisions

### D1. Driver — `sqlx` 0.8

`sqlx` with features `sqlite`, `tls-rustls`, `macros`, `migrate`, `runtime-tokio`, `chrono`. Async, single crate covers both SQLite (now) and Postgres (future) with identical macros, rustls posture matches the rest of the workspace, no openssl-sys.

Alternatives considered: `rusqlite + tokio-postgres` (dual codepaths), `sea-orm` (heavier, codegen), `tauri-plugin-sql` (Tauri-coupled, breaks `lifeos-daemon`). All recorded in `TODO.md` with revisit triggers.

### D2. Crate location — `lifeos-core`, behind a `storage` feature

Matches the existing `mcp-http` / `plugin-host` pattern:

```toml
[dependencies]
sqlx  = { version = "0.8", default-features = false, features = ["sqlite", "tls-rustls", "macros", "migrate", "runtime-tokio", "chrono"], optional = true }
tokio = { version = "1", default-features = false, features = ["rt-multi-thread", "macros"], optional = true }

[features]
default = ["mcp-http", "storage"]
storage = ["dep:sqlx", "dep:tokio"]
```

`tokio` is listed explicitly so storage-module code can call `tokio::*` directly without depending on sqlx's transitive re-export. ESP32 / `no_std` consumers turn the whole thing off with `default-features = false`.

`src-tauri/Cargo.toml` enables the flag alongside `plugin-host`:

```toml
lifeos-core = { path = "../crates/lifeos-core", features = ["plugin-host", "storage"] }
```

### D3. Connection pool — `SqlitePoolOptions::max_connections(5).min_connections(1)`

SQLite serializes writes globally; 5 connections is enough for read concurrency without waste. `min_connections(1)` keeps one warm so the first command after idle doesn't pay opening cost.

### D4. PRAGMAs applied per-connection

`journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`. Set via a `sqlx::pool::PoolOptions::after_connect` hook that runs each PRAGMA on every new connection (SQLite's `foreign_keys` is per-connection, not per-database).

### D5. Migration trigger — Tauri `.setup()` before commands fire

Migrations are embedded at compile time via `sqlx::migrate!("./migrations")`. The `SqlitePool` is constructed inside `tauri::Builder::setup()`, `migrate!().run(&pool)` is awaited, the pool is inserted into `tauri::State<Storage>`, and only then does `invoke_handler` get a chance to dispatch a command. On failure the app fails to start with a calm error string: `"LifeOS couldn't initialize storage at <db_path> — see logs."`. sqlx's `_sqlx_migrations` table provides safe concurrent-run semantics if two app instances race on first launch.

### D6. DB file path — `<app_data_dir>/lifeos.db` (creation via `mode=rwc`)

Production URL: `sqlite:<path>?mode=rwc` so the file is created if missing. `Storage::new_in_memory()` uses `sqlite::memory:` for tests. The constructor `Storage::new(url: &str)` is the single entry point; the Tauri shell composes the production URL, tests compose the in-memory one.

### D7. `account.json` migration — timestamped archive

On `Storage::migrate_from_json(app_data_dir)`:

1. If `accounts` table is non-empty → no-op (return `Ok(MigrateOutcome::AlreadyMigrated)`).
2. Else if `<app_data_dir>/account.json` does not exist → no-op.
3. Else: parse JSON into `AccountRecord` (re-using `lifeos_core::auth::AccountRecord`); `INSERT INTO accounts (...)`; rename `account.json` → `account.json.migrated-<RFC3339-UTC>` (e.g. `account.json.migrated-2026-05-25T09-30-15Z`). Colons replaced with hyphens for cross-platform filename safety.
4. On any error: roll back the DB insert via transaction; leave the JSON file untouched; return the error.

Timestamped archive name guarantees uniqueness across re-migration attempts and preserves an audit trail. Out of scope: pruning old archives (user/admin responsibility).

### D8. Concrete schemas

**`0001_accounts.sql`:**
```sql
CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX accounts_email_idx ON accounts(email);
```

**`0002_mempalace.sql`:**
```sql
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
```

**`0003_ruvector.sql`:**
```sql
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
```

### D9. Vector encoding contract — little-endian `f32`

`encode_vector(v: &[f32]) -> Vec<u8>` → `v.iter().flat_map(|f| f.to_le_bytes()).collect()`.
`decode_vector(b: &[u8]) -> Result<Vec<f32>, StorageError>` → reject if `b.len() % 4 != 0`; otherwise `b.chunks_exact(4).map(|c| f32::from_le_bytes(c.try_into().unwrap())).collect()`.

Validated belt-and-braces at three layers: (a) Rust-side length assertion before INSERT; (b) `CHECK (length(vector) = dim * 4)` at the DB level; (c) round-trip property test in the test suite.

### D10. `db_health` return type

```rust
#[derive(serde::Serialize)]
pub struct DbHealth {
    pub status: &'static str,                 // "ok" | "degraded"
    pub db_path: String,
    pub applied_migrations: u32,
    pub last_migration_version: i64,
    pub schema_version: &'static str,         // "1" for this change; bump on wire-format break
}
```

`status == "degraded"` when `applied_migrations` < the embedded migration count (e.g. an automatic migration failed silently — `db_migrate` then re-runs it).

### D11. Module layout

```
crates/lifeos-core/src/storage/
  mod.rs          // pub struct Storage; init/migrate/health/pool accessor
  accounts.rs     // CRUD + migrate_from_json
  mempalace.rs    // upsert/get/clear for nodes/edges/drawers
  ruvector.rs     // vector encode/decode + upsert/get/clear; gnn_cache CRUD
  error.rs        // pub enum StorageError
crates/lifeos-core/migrations/
  0001_accounts.sql
  0002_mempalace.sql
  0003_ruvector.sql
```

`Storage` is the only public surface re-exported from `lifeos-core::storage::*` behind `#[cfg(feature = "storage")]`. The Tauri shell only ever touches `Storage` + the `DbHealth` struct.

### D12. Tauri shell touch points

- `src-tauri/src/lib.rs`:
  - In `tauri::Builder::setup()`: construct `Storage::new(&format!("sqlite:{}?mode=rwc", db_path.display()))`, await `storage.migrate()`, await `storage.migrate_from_json(&app_data_dir)`, `manage(storage)`. On any error, return `Err(...)` from `setup()` so Tauri aborts with the calm string.
  - New `#[tauri::command] async fn db_health(state: tauri::State<'_, Storage>) -> Result<DbHealth, String>`.
  - New `#[tauri::command] async fn db_migrate(state: tauri::State<'_, Storage>) -> Result<MigrateReport, String>`.
- `src-tauri/src/auth.rs`:
  - `read_account` / `write_account` / `delete_account` JSON helpers replaced by calls into `lifeos_core::storage::accounts`.
  - Public command surfaces (`auth_status` / `auth_signup` / `auth_signin` / `auth_signout` / `auth_reset_vault`) unchanged.

## Risks / Trade-offs

- **Tokio runtime double-init.** Tauri 2 owns the runtime; constructing a second one inside `Storage::new` would panic. → Mitigation: never call `Runtime::new()` from `lifeos-core::storage`; require callers to be inside a Tokio context. The Tauri `.setup()` callback is already inside one. Tests use `#[tokio::test]`.
- **SQLite write contention.** Writes serialize globally. → Mitigation: WAL + `busy_timeout=5000` smooths burst contention. Acceptable for a desktop single-user app; revisit if multi-process daemon writes appear.
- **Vector BLOB ergonomics block future `sqlite-vec` migration.** → Mitigation: encode/decode helpers live in one file (`ruvector.rs`). Future change adds a `vec` virtual column and swaps reads; existing rows stay valid.
- **Migration archives accumulate.** → Mitigation: timestamped filenames make pruning trivial for the user. Auto-prune is out of scope; flagged here so reviewers don't expect it.
- **ESP32 build accidentally pulls sqlx via transitive features.** → Mitigation: `storage = ["dep:sqlx", "dep:tokio"]` (no `?` syntax, no feature inheritance from required deps). CI matrix asserts `cargo check -p lifeos-core --no-default-features` succeeds AND `cargo tree -p lifeos-core --no-default-features | grep -E "(sqlx|tokio)"` is empty.
- **`storage` enabled by default could surprise downstream consumers.** → Mitigation: it's listed alongside `mcp-http` (which is already default-on with the same posture); ESP32 firmware crate already opts out via `default-features = false`. Pattern is established.
- **`account.json` migration on a corrupted JSON file.** → Mitigation: parse failure returns `MigrateError::CorruptJson`, JSON file is NOT archived, accounts table stays empty; user can fix or delete the JSON and relaunch. The five `auth_*` commands continue to behave as if no account exists (matches current "no account" path).

## Migration Plan

**Pre-deploy verification gates** (run in this order, all must pass):
1. `cargo check --workspace` — green.
2. `cargo check -p lifeos-core --no-default-features` — green (ESP32 compatibility).
3. `cargo test -p lifeos-core --features storage` — green (round-trip + PBT + migration idempotency).
4. `cargo tree -p lifeos-core --features storage | grep openssl-sys` — empty.
5. `bun test` — green (frontend untouched).
6. `bun run build` — green.
7. `bun run tauri:dev` — manual smoke on (a) fresh appdata, (b) appdata with pre-existing `account.json`. Verify `db_health` returns ok in both, login flow works in both, archive file exists in (b).

**Deploy:** ship via normal `bun run tauri:build`. First-launch migration runs automatically.

**Rollback:** revert source. The `lifeos.db` file remains; downgraded code ignores it (no commands reference unknown tables). `account.json.migrated-*` archives stay (user can rename one back to `account.json` to restore the pre-migration state).

**Forward migration policy:** never edit a shipped migration. Each new schema change adds `000N_<name>.sql`; sqlx tracks state in `_sqlx_migrations` and refuses to run with checksum mismatches against shipped versions.

## Open Questions

None. All ambiguities surfaced during `/ccg:spec-research` were resolved in user confirmations (driver scope, crate location, payload scope) and the Decisions section above (concrete schema columns, PRAGMAs, migration trigger, archive naming, health-command shape).
