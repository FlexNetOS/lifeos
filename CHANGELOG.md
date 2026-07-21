# Changelog

All notable changes to LifeOS (ubuntu-lifeos). Dates ISO. Each stage closed with green gates (tests + build + axe).

## [Unreleased] · PostgreSQL/RuVector durable-storage cutover

- Replaced the application’s SQLite durable-store path with mandatory
  PostgreSQL/RuVector storage (`LIFEOS_DATABASE_URL`), including namespace
  verification for `extensions.ruvector` and a credential-redacted health
  receipt.
- Moved account identity, AgentDB projections, semantic vectors/GNN cache, UI
  persistence, lighting state, and AI-provider selection into PostgreSQL.
- Added administrative extension bootstrap SQL and a host-scoped native SDK
  bridge that resolves both build-time pkg-config metadata and transitive
  GTK/WebKit runtime libraries under the Nix-owned toolchain.
- Added fail-closed, read-only migration of legacy SQLite and JSON sources:
  source bytes are captured with SHA-256 in PostgreSQL, conflicts preserve both
  sources, and local files are retired only after commit.

## [0.1.7] — 2026-05-25 · design-md-format-adoption

`/ccg:spec-impl` run implementing the `design-md-format-adoption` OPSX change. Adopts Google Labs' [`@google/design.md@0.1.1`](https://github.com/google-labs-code/design.md) (Apache-2.0) — a YAML+markdown format spec for describing design systems to AI agents — and locks the previously-manual 0-axe-violation baseline into automated `vitest-axe` specs.

### New capabilities

- **`design-system-contract`** — `DESIGN.md` at repo root with normative YAML front matter (17 colors, 11 typography levels, 7 radii, 9 spacing tokens, 32 components) plus 8-section markdown body (Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts). Lint clean: 0 errors, 0 warnings.
- **`design-system-lint`** — `bun run design:lint` (`design.md lint DESIGN.md`). 8 rules: broken-ref (error), missing-primary, contrast-ratio (WCAG AA), orphaned-tokens, token-summary, missing-sections, missing-typography, section-order. CI gate at `bun run check`.
- **`design-token-exports`** — `bun run design:export` generates `design-system-reference/exports/tokens.json` (DTCG) and `tailwind.theme.json` (Tailwind v3 `theme.extend`). Byte-deterministic across runs. Checked in.
- **`design-system-regression-gate`** — `bun run design:diff` via `scripts/design-diff.mjs` wrapper: snapshots `HEAD~1:DESIGN.md` and fails CI on protected token-level regressions (colors/typography/rounded/spacing removed or modified) unless allowlisted in `scripts/design-diff.allow`.
- **`a11y-regression-suite`** — `tests/a11y/{components,overlays,views}.spec.ts` (3 files, 32 specs) running under a separate `vitest.a11y.config.ts`. Covers Sidebar (×2), AIAvatar (×3), TelemetryWidget (×3), Badge (×2), Icon (×2), MenuRow (×2), CommandPalette/KeyboardHelp/NotificationsDrawer (×2 each), ToastContainer (×2), Dashboard, LightsView, CalendarView, FilesView, HealthView, IoTView, ContactsView (workspace + aggregator), SettingsView, N8nFlowView. Axe rules: `wcag2a, wcag2aa, wcag21aa`. 0 violations enforced.
- **`bun run check`** — umbrella pre-flight: `vue-tsc --noEmit` + `bun run test` + `bun run test:a11y` + `bun run design:lint`.

### Dependencies

- New `devDependencies` (production bundle 0-impact): `@google/design.md@0.1.1` (exact pin — alpha schema), `vitest-axe@^0.1.0`, `axe-core@^4.11.4`. No runtime deps added.
- Apache-2.0 license attribution for `@google/design.md`.

### Verification gates (all green)

| Gate | Result |
|---|---|
| `bun run test` | **217 / 217** across 27 files |
| `bun run test:a11y` | **32 / 32** axe assertions, 0 violations |
| `bun run design:lint` | exit 0, 0 errors, 0 warnings |
| `bun run build` | clean, 199.5 kB / gzip 59.9 kB main + 103.4 kB / gzip 38.9 kB lucide |
| `cargo check --workspace` | green |
| `cargo check -p lifeos-core --no-default-features` | green (ESP32 isolation) |
| `cargo tree -p lifeos-core --features storage \| grep openssl-sys` | empty |
| `bun run design:export` × 2 | byte-identical (md5 stable for both artifacts) |

### Explicitly NOT in this release

- Auto-generation of `DESIGN.md` ↔ `colors_and_type.css` (manual sync for now; lint catches broken references; CSS-side parity check deferred to a follow-up).
- Playwright lane for browser-rendered pseudo-state contrast (happy-dom cannot reliably compute `:hover` / `:focus-visible` — documented limitation, not blocked).
- GitHub Actions workflow wiring (`bun run check` is local-only until repo gets a `.github/workflows/`).
- `@google/design.md` post-alpha migration — will trigger a follow-up change when upstream leaves alpha.
- The `css-tailwind` export format (Tailwind v4 `@theme` block) — documented upstream but not yet implemented in `@google/design.md@0.1.1`; we ship the JSON v3 config only.

---

## [0.1.6] — 2026-05-25 · database-storage-foundation

`/ccg:spec-impl` run implementing the `database-storage-foundation` OPSX change. Adds SQLite persistence to `lifeos-core` behind the `storage` Cargo feature, migrates the JSON account store to a proper `accounts` table, and lands empty mirror schemas for MempPalace and RuVector.

### New capabilities

- **`local-storage`** — `crates/lifeos-core/src/storage/` module: `SqlitePool` with WAL + FK + busy-timeout PRAGMAs, `max_connections(5) / min_connections(1)`, embedded migrations via `sqlx::migrate!`, `Storage::new(url)` / `new_in_memory()`, `migrate()`, `health()`. DB file at `<app_data_dir>/lifeos.db`; opened `mode=rwc` on first boot. Two new Tauri commands: `db_health` (returns `DbHealth` with status / applied_migrations / schema_version) and `db_migrate` (manual re-run surface).
- **`account-persistence`** — `storage::accounts` module: `AccountRow` (`sqlx::FromRow` + serde), `insert`, `get_by_email`, `get_first`, `update_password`, `delete_all`. One-time migration from `account.json`: transaction-wrapped INSERT, timestamped archive rename (`account.json.migrated-<RFC3339-UTC-hyphenated>`), corrupt-JSON guard that leaves the file in place and lets the app boot in no-account state.
- **`mempalace-mirror`** — `storage::mempalace`: `Node`, `Edge`, `Drawer` structs + `upsert_node / upsert_edge / upsert_drawer / get_node / get_edge / get_drawer / clear`. FK constraint on edges (cascade deletes); single-transaction `clear()`.
- **`ruvector-mirror`** — `storage::ruvector`: `encode_vector` / `decode_vector` (little-endian f32, length-mod-4 guard), `VectorRow`, `GnnCacheRow`, `upsert_vector / get_vector / list_by_collection / upsert_gnn / get_gnn / clear_collection / clear_gnn_cache`. Rust-side `VectorLengthMismatch` guard before INSERT + DB-level `CHECK (length(vector) = dim * 4)`.

### Modified capabilities

- **`auth_*` Tauri commands** — backend swapped from `account.json` helpers to `storage::accounts` DB calls. Public command surfaces (`auth_status` / `auth_signup` / `auth_signin` / `auth_signout` / `auth_reset_vault`) are unchanged from the frontend's perspective. Commands became `async fn`; `app: AppHandle` parameter removed (no longer needed).
- **Tauri `setup()`** — now initializes `Storage`, runs migrations, and triggers the one-time JSON migration before the event loop starts. On failure: calm error string `"LifeOS couldn't initialize storage at <path> — see logs."`.

### Dependencies added

- `sqlx 0.8` with features `sqlite, tls-rustls, macros, migrate, runtime-tokio, chrono` — optional, behind `storage` feature.
- `tokio 1` with `rt-multi-thread, macros` — optional, behind `storage` feature.
- `chrono 0.4` with `std, clock` — optional, behind `storage` feature.
- `tempfile 3` — dev-dependency for migration tests.
- Hard constraint preserved: `cargo tree -p lifeos-core --features storage | grep openssl-sys` is empty.

### Explicitly NOT in this release (deferred)

PostgreSQL driver, sqlite-vec KNN, write-back from local mirrors to MempPalace/RuVector servers, LIFEOS_PERSIST_KEYS localStorage migration, sea-orm, tauri-plugin-sql, rusqlite. See `TODO.md` under "Database driver alternatives".

### Test gates

- `cargo test -p lifeos-core --features storage` — 35 passing (10 storage + 13 plugin-host + 12 auth).
- `cargo check --workspace` — 0 errors.
- `cargo check -p lifeos-core --no-default-features` — 0 errors (ESP32 isolation confirmed).
- `cargo tree -p lifeos-core --features storage | grep openssl-sys` — empty.

## [0.1.5] — 2026-05-25 · Cross-platform foundation + read-only MCP + safe sweep

`/team ralph` run scoped to the foundation refactor + read-only MCP + safe sweep (the `/ecc:multi-frontend` loop closed at 0.1.4 with the dashboard production-ready; this iteration restructures the Rust side for cross-platform reuse without touching the Vue surface).

### Layered foundation — TODO 1a → 1d
The repo became a Cargo workspace at root. Tauri shell stayed in `src-tauri/`; portable Rust core lifted into `crates/lifeos-core/`. ESP32-C6 firmware skeleton stands alone at `firmware/esp32/` (excluded from the workspace — own `no_std` resolver).

- **1a — workspace member.** Root `Cargo.toml` declares `src-tauri/` + `crates/lifeos-core/` + `crates/lifeos-daemon/`; `Cargo.lock` moved up from `src-tauri/`. `firmware/esp32/` lives outside the workspace.
- **1b — pure types.** `VaultEntry`, `AppVersion`, `TelemetrySnapshot` moved to `lifeos_core::types`. New `AiProvider` enum replaces the local `SUPPORTED_PROVIDERS` string array (with round-trip + serde tests). The Vue store sibling comments (`src/stores/lifeos.{ts,js}`) updated to point at the new canonical location.
- **1c — auth move.** `Argon2id` hashing, validators, `AccountRecord`, `AuthStatus`, and `AuthState` lifted into `lifeos_core::auth`. The Tauri shell (`src-tauri/src/auth.rs`) slimmed to JSON storage + five `#[tauri::command]` wrappers. `argon2` dep removed from `src-tauri/Cargo.toml` (transitive through lifeos-core).
- **1d — MCP module stubs (Wave 3 filled them in).** `lifeos_core::mcp::{cognitum, ruvector}` started as scaffolds, then Wave 3 wrapped read-only REST clients (`reqwest::blocking`, rustls — no openssl-sys) behind a shared `Transport` trait + in-memory test fake. Cognitum endpoint defaults to `http://169.254.42.1/mcp` (live IP from the user's appliance). Method coverage: `cogs_list`, `sensor_snapshot`, `coherence_profile` (path unverified — flagged), and `vector_db_stats`, `gnn_cache_stats` for RuVector (paths unverified — flagged). Behind the `mcp-http` Cargo feature; default-on for desktop, off-able for future no_std / WASM slices.

### Wave 3 additions
- **Cognitum + RuVector read-only MCP clients** — typed `serde_json::Value`-wrapping response structs with one or two typed accessors plus `raw()` escape hatch. Live smoke test for Cognitum is `#[ignore]`-d and skips silently when `LIFEOS_COGNITUM_URL` isn't set.
- **`lifeos-daemon` bin crate** — placeholder banner that prints `lifeos-core` + daemon versions and exits 0. Pure-Rust deps only. Cross-compiles to `aarch64-unknown-linux-gnu` (`rustup target add aarch64-unknown-linux-gnu` is the only host change). README documents `gcc-aarch64-linux-gnu` or `cross` for the actual link step; Wave 4+ adds the sensor → MQTT bridge.
- **mlua plugin host spike** — `lifeos_core::plugin` behind the `plugin-host` feature. mlua 0.11.6 + Luau VM (vendored). Strips `io`, `os`, `package`, `debug`, `dofile`, `loadfile`, `load` from globals before any script runs, then engages `lua.sandbox(true)`. Tauri shell exposes `plugin_run(script: String) -> Result<String, String>`; a fresh `PluginHost` is built per call so a misbehaving script can't poison the next caller.

### Safe sweep (Wave 1, parallel)
- **`.claude/plan/tauri-mobile-readiness.md`** — verdict yellow. iOS blocked on macOS host (signing + Xcode). Android startable on this Linux host with target install + SDK/NDK env setup. Flagged the one compile blocker — `tauri::menu::*` not gated behind `#[cfg(desktop)]` — which Wave 4 fixed.
- **`.claude/plan/exo-integration.md`** — Exo at HTTP port 52415, OpenAI-compatible at `/v1/chat/completions`. Out-of-scope for mobile/Pi/ESP32. Plan slots Exo in as a fourth provider in `ai_complete` once a follow-up adds it.
- **`.claude/plan/account-keyed-sync-sketch.md`** — three-layer design (local file / account vault / per-key LWW reconciliation) for the persistence whitelist. Per-key sync tags applied to all 15 `LIFEOS_PERSIST_KEYS`. Backend pick deferred; favors Cognitum-Seed's custody chain.
- **`firmware/esp32/`** — ESP32-C6 scaffold pinned to `esp-hal 1.1.1` + `esp-rtos 0.3.0` + `embassy-executor 0.10.0` + `embassy-time 0.5.0`. `cargo check --target riscv32imac-unknown-none-elf` passes 0 errors 0 warnings. Standalone — explicitly NOT a workspace member.

### Wave 4 polish (lead-executed)
- **`#[cfg(desktop)]` gate** on `tauri::menu::*` setup inside `run()` in `src-tauri/src/lib.rs`. Unblocks iOS/Android compile per the mobile audit's one compile-blocker finding.
- **Per-platform Tauri capabilities** — `src-tauri/capabilities/default.json` now scoped `"platforms": ["linux", "macOS", "windows"]`. New `src-tauri/capabilities/mobile.json` for `"platforms": ["android", "iOS"]` omits `shell:default` + `shell:allow-open` + `core:menu:default`. FS scope stays the same on every platform.
- **`mcp-http`-feature gate** on `rest_base_from_mcp_url` (and its test) — kills a dead-code warning surfaced by `lifeos-daemon` building `lifeos-core` with `default-features = false`.

### Explicitly NOT in this release
- Google `design.md` incorporation (blocked on the canonical source URL — TODO item stays open).
- OpenPencil edit-write persistence, dynamic Lucide imports, full `data.js` → `src/data/*.ts` port, Tauri auto-updater, first-run onboarding tour, system tray, mobile breakpoints below 480 px — all explicitly punted in the prior TODO carry-over list as "none blocking production ready."
- Real wire calls from the daemon (`main()` is still a banner).
- Cognitum pairing — Wave 3 only wraps read-only tools. Pairing via `seed_pair_clients` stays a deliberate user action.

### Test count
- `cargo test -p lifeos-core --features plugin-host` — 42 passing (29 from Wave 3 MCP + 13 from the plugin spike), 1 `#[ignore]`-d live smoke.
- `bun run test` — 217/217 Vitest (unchanged — no Vue source modified beyond two comment updates).
- `bun run build` — clean. App chunk ≈199 kB / ≈60 kB gzip.

## [0.1.4] — 2026-05-21 · `/loop /ecc:multi-frontend` close

Four iterations of multi-model swarms (Gemini analyzer + Claude executor agents).

### Iter 4 — Contacts
- **ContactsView** for Work, Personal, and the persistent rail-footer Contacts aggregator
- 16 sample contacts (8 work + 8 personal), starred + last-seen + channel chips
- App.vue handles both `view: "contacts"` and `activeId === "contacts"` (aggregator entry) paths
- +14 specs (180 → 194)

### Iter 3 — Health · IoT · Notifications
- **HealthView** (Personal → Health): 4 metric cards + sleep bar chart + activity rings + heart-rate sparkline + LifeOS suggest
- **IoTView** (Home → IoT): room filter chips + device list + signal strength + latency pill
- **NotificationsDrawer** (right-side, triggered by rail-footer bell): mark-all-read · dismiss · persistent unread badge · drawer state in persistence whitelist
- Post-swarm a11y fixes: aside→section on Health/IoT, h3→h2 in IoT, `--fg-4`→`--fg-3` in NotificationsDrawer
- +30 specs (150 → 180)

### Iter 2 — Settings · KeyboardHelp · Files
- **SettingsView** (`/settings`): AI provider dropdown · Telemetry on/off + 1s/2s/5s rate radio · Appearance placeholder · About (with Tauri runtime version)
- **KeyboardHelp** overlay (`?` opens): 13+ shortcuts grouped Global/Navigation/Lights/CommandPalette · proper `role="dialog" aria-modal`
- **FilesView** (Work + Personal → Files): folder tree + recent files list
- Rust: new `app_version()` command
- Post-swarm a11y fixes: `.toast-stack` got `role="region"`, settings-side aside→section, KeyboardHelp contrast bump
- +33 specs (117 → 150)

### Iter 1 — Persistence · Toasts · Telemetry
- **`tauriPersistence` Pinia plugin** + `ui_state_{read,write}` Rust commands. 13 whitelisted state keys survive reload via `$APPDATA/lifeos/ui-state.json`
- **`useToasts` Pinia store + `<ToastContainer />`**: 4 variants (info/success/warn/error), auto-dismiss, hover-pause. Replaces the "coming soon → AI chat" pattern across Dashboard/Lights
- **TelemetryWidget** on Dashboard: live CPU / memory / network / uptime via new Rust `telemetry_read` command (`sysinfo 0.32`)
- +24 specs (93 → 117)

## [0.1.3] — 2026-05-21 · `/goal "100% healthy"` swarm close

6 parallel lanes covering the AUDIT.md "what remains" list:
- **Lucide tree-shake**: 778 kB → 63 kB raw (-92%). Static 152-icon barrel at `src/lib/icons.{ts,js}`
- **Sidebar Net-Control token hygiene**: 14 inline rgba literals → 0; 12 new `--tint-*` tokens in `colors_and_type.css`
- **Lights v2**: brightness sliders on active tiles · Kelvin color-temp meter per active room · roving tabindex on scene radiogroup · schedule edit/delete affordances · Tauri-backed persistence (`lights_state_{read,write}`)
- **Real AI provider routing**: `ai_complete` / `ai_provider_{get,set}` Rust commands behind `reqwest` rustls + `keyring 3`. Routes Claude / OpenAI / Gemini with keyring → env fallback. `sendAiMessage` detects `window.__TAURI__` and falls back to canned reply for offline/Vitest
- **Production data polish**: colorTemp values on 12 lights, new CalendarView, SubsectionView empty-state hints
- **Inline a11y sweep**: rail-badge contrast (white→black on bright tones), h3→h2 heading order, Workspace `<section>` aria-label, Lights timeline aside→section, `.sr-only` utility added
- Tests 72 → 93, app chunk 1 MB → 128 kB / gzip 40 kB

## [0.1.2] — 2026-05-20 · Stage 2 Phase 1–5 close

- **Deep-linking**: new `useNav()` composable (`src/lib/nav.{ts,js}`) threads `router.push` through every store mutation. Sidebar, Workspace, Dashboard, OpenPencilEditor all migrated.
- **CommandPalette** (⌘K / Ctrl-K): ported from React canon, fuzzy search across workspaces/sections/items/teams
- **Dashboard CTAs wired**: Ask LifeOS → AI chat, New automation → CommandPalette
- **Vue-tsc parity** on `lifeos.{ts,js}` store siblings + new `nav.{ts,js}` pair + `tests/store-sync.spec.js` enforces it
- **A11y**: `role="group"` on stat-grid, `role="img"` + computed aria-label on stat-cards, global `:focus-visible` ring, `prefers-reduced-motion`
- **Bundle split**: `manualChunks` for vue / vue-router / pinia / lucide / vendor
- **`data.js` typed surface**: `src/data/types.ts` with `LifeosData` interface + `useData()` / `useFlow()` / `useAggregator()`
- **Tauri**: stripped unused tray-icon feature, OpenPencil docs in AGENTS.md
- Tests 46 → 72

## [0.1.1] — 2026-05-20 · Stage 1 lift

- Lifted `lifeos_vue/` from the handoff bundle into `~/repos/ubuntu-lifeos/`. Self-contained (tokens, fonts, brand assets folded in).
- Audit fixes: Sidebar `<img>` switched to `public/`-served path, `lifeos_app.css` import path corrected, `styles.css` rewritten for local tree
- Vite production entry (`index.html`) replacing the CDN preview
- Tauri 2: `lib.rs` + `main.rs` split (Tauri 2 convention), capabilities file, full icon set via `cargo-tauri icon`
- Bug fix: `router/index.ts` was using undefined `window.resolveWorkspace` — replaced with proper `@/lib/resolve` import
- Tests 0 → 46

## [0.1.0] — 2026-05-20 · Initial scaffold

Vue 3 + Vite + Pinia + vue-router + Tauri 2 starter from the LifeOS Design System handoff bundle. Sources: `design-system-reference/` (read-only).
