## Requirements

### Requirement: PostgreSQL/RuVector initialization

The system SHALL construct `Storage` from `LIFEOS_DATABASE_URL` before Tauri
command handlers are registered. The URL SHALL be PostgreSQL; SQLite URLs
SHALL be rejected. Startup SHALL migrate the application schemas and verify
that `ruvector` is installed in schema `extensions`.

#### Scenario: Missing or non-PostgreSQL configuration fails closed

- **WHEN** `LIFEOS_DATABASE_URL` is absent or is a SQLite URL
- **THEN** startup SHALL fail before command registration
- **AND** the user-facing initialization error SHALL not expose credentials

#### Scenario: Bootstraped PostgreSQL opens safely

- **WHEN** the installation owner has run
  `bootstrap-postgres-ruvector.sql` and supplied a runtime role URL
- **THEN** `Storage::from_runtime_env`, migrations, and extension verification
  SHALL succeed without creating a local durable database file

### Requirement: Administrative extension bootstrap

The application migration set SHALL not install extensions. The PostgreSQL
installation owner SHALL run `crates/lifeos-core/sql/bootstrap-postgres-ruvector.sql`
with `lifeos_runtime_role`; it SHALL install `pgcrypto`, `btree_gin`, and
`ruvector` in `extensions`, create the five empty `lifeos_*` schemas, and
grant the runtime role only database connect, required extension
type/function usage, and `USAGE`/`CREATE` in those application schemas.
It SHALL pin the runtime role's database-local search path to
`lifeos_runtime, extensions, pg_catalog` so SQLx migration bookkeeping does
not require `CREATE` on `public`.

#### Scenario: Incorrect extension placement is rejected

- **WHEN** `ruvector` is absent from `extensions`, including when it exists in
  `public`
- **THEN** runtime health verification SHALL fail closed

### Requirement: Embedded application migrations

The system SHALL embed numbered SQL migrations with `sqlx::migrate!` and run
them idempotently in PostgreSQL. The administrative bootstrap SHALL create the
`lifeos_blob`, `lifeos_security`, `lifeos_runtime`, `lifeos_semantic`, and
`lifeos_agentdb` schemas; migrations SHALL verify their presence and create
only application relations within their scoped runtime grants.

#### Scenario: First run applies every migration

- **WHEN** a bootstraped empty database is started
- **THEN** every numbered migration SHALL be recorded in `_sqlx_migrations`

#### Scenario: Incomplete migrations fail health

- **WHEN** fewer embedded migrations are recorded than shipped
- **THEN** `Storage::health` SHALL return `StorageError::IncompleteMigrations`

### Requirement: Durable projection state

`ui-state`, `lighting-state`, and `ai-provider` SHALL be JSONB projections in
`lifeos_runtime.projection`; app-data JSON files SHALL be legacy import sources
only. Each successful write SHALL atomically advance that projection's
generation.

#### Scenario: Projection writes validate JSON

- **WHEN** a projection write receives invalid JSON
- **THEN** it SHALL return `StorageError::InvalidProjectionJson`
- **AND** the prior canonical projection SHALL remain unchanged

### Requirement: Compatibility and dependency isolation

The `storage` feature SHALL gate PostgreSQL/RuVector storage. The
`legacy-sqlite-import` feature SHALL add read-only import support only; it
SHALL not authorize new SQLite product writes. `cargo check -p lifeos-core
--no-default-features` SHALL succeed, and enabling storage SHALL not introduce
`openssl-sys`.
