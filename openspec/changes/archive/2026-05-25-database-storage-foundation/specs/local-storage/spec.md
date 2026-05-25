## ADDED Requirements

### Requirement: Storage initialization

The system SHALL construct a `Storage` instance from a database URL during application startup, before any Tauri command handler can be invoked. On failure, the application SHALL abort with a calm, user-facing error message and SHALL NOT register any command handlers.

#### Scenario: Fresh launch creates the database file

- **WHEN** the application launches with no existing `<app_data_dir>/lifeos.db` file
- **THEN** `Storage::new("sqlite:<path>?mode=rwc")` SHALL create the file and return a usable `Storage` instance

#### Scenario: Re-launch reopens existing database without data loss

- **WHEN** the application launches with a pre-existing `<app_data_dir>/lifeos.db` containing rows
- **THEN** `Storage::new` SHALL open the file without truncation
- **AND** previously inserted rows SHALL remain readable

#### Scenario: Initialization failure aborts startup with calm message

- **WHEN** `Storage::new` returns an error (permission denied, disk full, corrupt file)
- **THEN** Tauri's `setup()` callback SHALL return that error
- **AND** the user SHALL see the calm string `"LifeOS couldn't initialize storage at <db_path> — see logs."`
- **AND** no `#[tauri::command]` handler SHALL be reachable

### Requirement: Embedded migrations

The system SHALL embed migration SQL files at compile time via `sqlx::migrate!("./migrations")` and SHALL run them idempotently on every startup.

#### Scenario: First run applies all migrations

- **WHEN** the application launches against an empty database
- **THEN** every `.sql` file under `crates/lifeos-core/migrations/` SHALL be applied
- **AND** the `_sqlx_migrations` table SHALL contain one row per applied migration

#### Scenario: Subsequent runs are no-ops

- **WHEN** the application launches against a database whose `_sqlx_migrations` table is already up to date
- **THEN** no schema changes SHALL occur
- **AND** the row count in `_sqlx_migrations` SHALL remain unchanged

#### Scenario: Concurrent app instances cannot corrupt migrations

- **WHEN** two app instances race on first launch against the same DB file
- **THEN** sqlx's built-in `_sqlx_migrations` advisory lock SHALL serialize them
- **AND** the final schema SHALL be identical to a single-instance launch

### Requirement: Connection pool with WAL and foreign keys

The system SHALL maintain a `SqlitePool` with `max_connections=5` and `min_connections=1`. Every connection SHALL have `journal_mode=WAL`, `foreign_keys=ON`, and `busy_timeout=5000` applied via the pool's `after_connect` hook.

#### Scenario: Pool serves concurrent reads

- **WHEN** five `SELECT` queries are dispatched on the pool simultaneously
- **THEN** all five SHALL complete without serialization at the application layer

#### Scenario: Pool honors PRAGMAs per connection

- **WHEN** a fresh connection is acquired from the pool
- **THEN** `PRAGMA journal_mode` SHALL return `wal`
- **AND** `PRAGMA foreign_keys` SHALL return `1`
- **AND** `PRAGMA busy_timeout` SHALL return `5000`

### Requirement: `db_health` Tauri command

The system SHALL expose a `#[tauri::command] async fn db_health()` that returns a `DbHealth` struct describing pool health, applied migration count, and the schema version string. Status SHALL be `"ok"` when applied migrations equal the embedded count; otherwise `"degraded"`.

#### Scenario: Healthy database returns ok status

- **WHEN** the frontend invokes `db_health` on a database with all migrations applied
- **THEN** the response SHALL have `status == "ok"`
- **AND** `applied_migrations` SHALL equal the count of `.sql` files shipped
- **AND** `schema_version` SHALL equal `"1"`

#### Scenario: Behind-by-one returns degraded status

- **WHEN** the frontend invokes `db_health` after a manual `db_migrate` failure left one migration unapplied
- **THEN** the response SHALL have `status == "degraded"`

### Requirement: `db_migrate` Tauri command

The system SHALL expose a `#[tauri::command] async fn db_migrate()` that re-runs the embedded migration set and returns a `MigrateReport { applied: u32, total: u32 }`.

#### Scenario: Manual re-run is idempotent

- **WHEN** the frontend invokes `db_migrate` on an already-up-to-date database
- **THEN** `applied` SHALL equal `total`
- **AND** no new rows SHALL be added to `_sqlx_migrations`

### Requirement: `storage` feature flag

The `lifeos-core` crate SHALL declare a `storage` Cargo feature gating both `sqlx` and `tokio` as optional dependencies. The feature SHALL be included in the default feature set.

#### Scenario: Default build includes storage

- **WHEN** `cargo check -p lifeos-core` runs without any feature overrides
- **THEN** the `lifeos_core::storage` module SHALL be present in the compiled artifact

#### Scenario: `--no-default-features` excludes sqlx entirely

- **WHEN** `cargo check -p lifeos-core --no-default-features` runs
- **THEN** the build SHALL succeed
- **AND** `cargo tree -p lifeos-core --no-default-features` SHALL NOT mention `sqlx` or `tokio`

### Requirement: No `openssl-sys` in the dependency graph

The system SHALL preserve the rustls-only posture of the existing `lifeos-core` and `src-tauri` crates. Enabling the `storage` feature SHALL NOT introduce `openssl-sys`.

#### Scenario: Dependency tree is openssl-free

- **WHEN** `cargo tree -p lifeos-core --features storage | grep openssl-sys` runs
- **THEN** the output SHALL be empty
