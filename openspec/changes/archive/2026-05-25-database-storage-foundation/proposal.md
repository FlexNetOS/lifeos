## Why

LifeOS has zero database today. Account credentials sit in `$APPDATA/lifeos/account.json`; UI state lives in a `LIFEOS_PERSIST_KEYS` localStorage whitelist debounced through `src/lib/persistence.{ts,js}`. Wave 3 of the cross-platform foundation plan just shipped read-only typed MCP clients for Cognitum-Seed and RuVector inside `lifeos-core`, and MempPalace integration is queued next — but none of those clients have anywhere to land data locally. Every MCP call re-hits the server, every result is forgotten when the process exits, and offline use is impossible. The storage substrate has to land before the next wave of MCP client work, not after.

## What Changes

- Add `sqlx` to `crates/lifeos-core` behind a new `storage` Cargo feature, defaulted on for desktop + `lifeos-daemon` and switched off for `no_std`/ESP32 targets — mirrors the existing `mcp-http` and `plugin-host` feature pattern in `crates/lifeos-core/Cargo.toml`.
- SQLite only in this change. PostgreSQL is deferred to a follow-up OPSX change once cloud-sync requirements are concrete (alternatives explicitly tracked in `TODO.md` under "Database driver alternatives").
- Open the database at `<app_data_dir>/lifeos.db` (already covered by the existing Tauri `$APPDATA/lifeos/*` FS scope — no new capability grant needed).
- Embed migrations via `sqlx::migrate!` against `crates/lifeos-core/migrations/`. Idempotent, run on startup.
- Replace the JSON-at-rest contract in `src-tauri/src/auth.rs` (`account.json`) with an `accounts` table. One-time migration on first DB open if the file exists; archived to `account.json.migrated` rather than deleted, for safety. The five `auth_*` Tauri commands keep their exact public surface — only the storage backend changes.
- Add `mempalace_*` mirror tables (`mempalace_nodes`, `mempalace_edges`, `mempalace_drawers`) sized to the upstream MCP surface (`mempalace_kg_add/query`, `mempalace_list_drawers`, `mempalace_list_tunnels`). Read-through cache only — no write-back source-of-truth shift in this change.
- Add `ruvector_*` mirror tables (`ruvector_vectors`, `ruvector_gnn_cache`). Vectors stored as `BLOB` of little-endian `f32` until KNN query latency demands the `sqlite-vec` extension. Read-through cache only.
- Add two new `#[tauri::command]` wrappers in `src-tauri/src/lib.rs`: `db_health` (connectivity + last-applied-migration check) and `db_migrate` (debug surface for manual re-run).
- **No** new `tauri-plugin-sql` dependency. **No** frontend direct DB access — the Vue layer continues to talk to Rust only through `#[tauri::command]`, so the `.ts` ↔ `.js` sibling contract on `src/stores/lifeos.{ts,js}` and `src/lib/persistence.{ts,js}` is not touched.

## Capabilities

### New Capabilities

- `local-storage`: SQLite-backed persistence layer in `lifeos-core` — connection pooling, embedded migrations, `db_health` + `db_migrate` Tauri commands, and ownership of the `$APPDATA/lifeos/lifeos.db` file contract. Behind the `storage` Cargo feature.
- `account-persistence`: Schema and read/write path for the local account record (`accounts` table). Owns the one-time `account.json` → DB migration semantics for first-run upgrades and the archival-not-deletion safety contract.
- `mempalace-mirror`: Read-through cache schema (nodes, edges, drawers) for MempPalace MCP responses. Sync direction is one-way (server → client) in this change.
- `ruvector-mirror`: Read-through cache schema (vectors, GNN cache entries) for RuVector MCP responses. Owns the vector encoding contract (little-endian `f32` BLOB) until `sqlite-vec` is adopted.

### Modified Capabilities

None. `openspec/specs/` is empty (fresh OPSX init). All existing Tauri command surfaces (`auth_status`, `auth_signup`, `auth_signin`, `auth_signout`, `auth_reset_vault`, `ai_complete`, `ai_provider_get`, `ai_provider_set`, telemetry / vault commands) are preserved unchanged; this change adds capabilities rather than mutating prior contracts.

## Impact

**Code**:
- `crates/lifeos-core/Cargo.toml` — adds `sqlx` as an optional dep + new `storage` feature; the feature gets added to the default set on desktop targets (same pattern as `mcp-http`).
- `crates/lifeos-core/src/storage/` — new module (`mod.rs`, `accounts.rs`, `mempalace.rs`, `ruvector.rs`, `migrations.rs`).
- `crates/lifeos-core/migrations/` — new directory: `0001_accounts.sql`, `0002_mempalace.sql`, `0003_ruvector.sql`.
- `src-tauri/src/auth.rs` — JSON read/write helpers replaced with calls into `lifeos_core::storage::accounts`. Tauri command surfaces unchanged.
- `src-tauri/src/lib.rs` — new `db_health` and `db_migrate` commands; the `SqlitePool` is constructed at startup and placed in `tauri::State` for handlers to fetch.
- `src-tauri/Cargo.toml` — enables `storage` on the `lifeos-core` dep (alongside the existing `plugin-host` feature).

**Dependencies**:
- New: `sqlx` with features `sqlite`, `tls-rustls`, `macros`, `migrate`, `runtime-tokio`. Optional via the `storage` feature, default-on like `mcp-http`.
- Tokio: already available because Tauri 2 runs on it; `runtime-tokio` reuses the same runtime — verified during implementation to avoid double-init.
- `sqlx-cli` is **not** a runtime dep. Migrations are embedded at compile time via `sqlx::migrate!`.
- Hard constraint preserved: no `openssl-sys` in the graph (rustls features chosen throughout — matches `reqwest` in `src-tauri/Cargo.toml` and `lifeos-core/Cargo.toml`).

**Systems**:
- Tauri FS scope unchanged — `lifeos.db` lives under `$APPDATA/lifeos/*` which is already allowed.
- Tauri capabilities (`src-tauri/capabilities/default.json`) unchanged.
- ESP32 / `no_std` consumers of `lifeos-core` opt out via `default-features = false`. Pi `lifeos-daemon` (planned `aarch64-unknown-linux-gnu` headless binary) keeps the `storage` feature on.
- The frontend `LIFEOS_PERSIST_KEYS` whitelist and Pinia persistence plugin stay exactly as they are — UI state remains ephemeral by design; canonical user data moves to the DB. Sibling parity (`.ts` ↔ `.js`) is not at risk.

**Test gates** (per `AGENTS.md` "verification before claiming done"):
- `cargo test -p lifeos-core --features storage` — round-trip insert/query/update/delete on every table against an in-memory SQLite (`sqlite::memory:`); migration idempotency test (run twice, verify state).
- `cargo check --workspace` — both `storage`-on and `--no-default-features` configurations must compile.
- `bun test` — full Vitest suite stays green (frontend store surface is untouched).
- `bun run build` + `vue-tsc --noEmit` — must stay green.
- `bun run tauri:dev` — manual boot smoke: app starts without console errors, `db_health` returns OK, sign-up / sign-in / sign-out work on a fresh appdata dir AND on an appdata dir with a pre-existing `account.json` (the migration path, including the `.migrated` archive verification).

**Out of scope (explicit, deferred to later OPSX changes)**:
- PostgreSQL driver (separate change once cloud-sync requirements crystallize).
- Write-back from local mirrors to MempPalace / RuVector servers (source-of-truth flip).
- `sqlite-vec` extension for native KNN search (deferred until query latency demands it).
- Migrating `LIFEOS_PERSIST_KEYS` localStorage state into the DB (intentionally UI-ephemeral; not currently a problem).
- `@tauri-apps/plugin-sql` adoption (rejected: would couple DB to Tauri and break the `lifeos-daemon` target — see `TODO.md` under "Database driver alternatives").
