# TODO — next session pointers

Short list. Each item has a pointer to the detailed plan file.

## Cross-platform foundation verification (2026-05-25)

Verdict: Vue 3 + Tauri 2 is the right *shell* for the workstation but not the *foundation* for the full target list (iOS, Android, macOS, Win11, Linux, Pi 4/5, Pi Zero/3, ESP32). Restructure as `lifeos-core` (portable Rust crate) + multiple thin shells + `mlua` plugin layer where `std` is available.

**Status — `/team ralph` run on 2026-05-25 closed every item in this section.** Detailed per-item notes below; CHANGELOG 0.1.5 records the full Wave 1–4 outcome. The "Cognitum-Seed MCP client" item targeted the live dot-notation tool names (`seed.cogs.list`, `seed.sensor.snapshot`, `seed.coherence.profile`) from the user's MCP-config screenshot, not the underscore names in the original entry — those don't appear in the live 40-tool list.

- [x] **`lifeos-core` 1a — workspace member** — Convert `src-tauri/Cargo.toml` to a Cargo workspace; add empty `crates/lifeos-core/` with a one-line lib. Acceptance: `cargo check -p lifeos-core` + `bun test` + `bun run tauri:dev` boot. (`Cargo.lock` lifted to repo root; `firmware/esp32/` excluded.)
- [x] **`lifeos-core` 1b — pure types** — Move `Workspace`/`Section`/`Item`/`AiMessage`/`AiProvider` structs out of `src-tauri/src/lib.rs` into `lifeos-core::types`. No behavior. (`VaultEntry`, `AppVersion`, `TelemetrySnapshot` + the new `AiProvider` enum moved; `Workspace`/`Section`/`Item`/`AiMessage` had no pre-existing Rust footprint — deferred until the `data.js → src/data/*.ts → lifeos-core::domain` port.)
- [x] **`lifeos-core` 1c — auth move** — Lift `src-tauri/src/auth.rs` (Argon2id) into `lifeos-core::auth`; Tauri shell keeps a thin `#[tauri::command]` wrapper (Tauri commands cannot be re-exported across crates).
- [x] **`lifeos-core` 1d — MCP module stubs** — Empty `lifeos-core::mcp::{cognitum, ruvector}` client scaffolds. No wire calls yet. (Wave 3 then filled them with read-only REST clients.)
- [x] **Cognitum-Seed MCP client (read-only)** — wrap `seed.cogs.list`, `seed.sensor.snapshot`, `seed.coherence.profile` (live dot-notation tool names from the user's MCP screenshot — the underscore names from the original spec don't appear in the live 40-tool list). HTTP via `reqwest::blocking` + rustls. `LIFEOS_COGNITUM_URL` overrides the live `http://169.254.42.1/mcp` default. Pairing via `seed_pair_clients` stays out of scope.
- [x] **RuVector MCP client (read-only)** — wrap `vector_db_stats`, `gnn_cache_stats` for the AI-memory layer. (REST paths flagged "unverified — confirm before implementing"; `LIFEOS_RUVECTOR_URL` env var to point at a live endpoint.)
- [x] **Tauri Mobile readiness audit** — `cargo tauri info` + sandbox/plugin gap list → `.claude/plan/tauri-mobile-readiness.md`. No migration yet. (Verdict yellow; Wave 4 fixed the one compile blocker the audit flagged.)
- [x] **ESP32 firmware sibling project** — `firmware/esp32/` scaffold pinned to `esp-hal` + Embassy (`no_std`). Pick one chip first; recommended target is **ESP32-C6** (`riscv32imac-unknown-none-elf`, stable Rust, WiFi 6 + BLE). Lua via mlua is **not viable on ESP32**; ESP32 is a sensor/actuator endpoint that speaks MQTT/CoAP back to the workstation. (`cargo check --target riscv32imac-unknown-none-elf` clean; `esp-hal 1.1.1` + `esp-rtos 0.3.0` + `embassy-executor 0.10.0`.)
- [x] **`mlua` plugin host spike** — feature-flagged Lua/Luau scripting inside `lifeos-core` for workstation/mobile/Pi. Sandbox `io`, `os`, `package` before any third-party script runs. (mlua 0.11.6 + vendored Luau; seven dangerous globals stripped — `io`, `os`, `package`, `debug`, `dofile`, `loadfile`, `load` — then `lua.sandbox(true)` engaged. Tauri `plugin_run(script)` command exposed.)
- [x] **Exo desktop fleet plan** — `.claude/plan/exo-integration.md`. Exo is Python-first and macOS/Linux-only — out-of-process RPC, not in-process linking. Mobile/microcontrollers are out of scope for Exo. (HTTP port 52415 verified; OpenAI-compatible at `/v1/chat/completions`. Implementation deferred to a follow-up.)
- [x] **`lifeos-daemon` headless bin crate** — cross-compile to `aarch64-unknown-linux-gnu` for Pi Zero/3 headless nodes (sensor → MQTT bridge). (`cargo check --target aarch64-unknown-linux-gnu` clean; placeholder `main()` prints a banner. Real MQTT body sketched as a Wave 4+ follow-up.)
- [x] **Account-keyed sync for the persistence whitelist** — `src/lib/persistence.{ts,js}` is currently shell-local; "all logins connected via distributed compute" needs account-keyed sync. Sketch only — do not change shipped behavior yet. **Must update both `.ts` and `.js` siblings** (per CLAUDE.md / AGENTS.md sibling-identical contract). (Sketch at `.claude/plan/account-keyed-sync-sketch.md`; backend pick deferred. No shipped behavior changed.)
- [x] **Tauri capabilities split per platform** — Audit `src-tauri/capabilities/default.json` (currently grants `shell:default` + `shell:allow-open` to the main window). **Before** any mobile build, split capabilities so iOS/Android do NOT inherit the desktop shell-spawning grant. (`default.json` scoped `["linux", "macOS", "windows"]`; new `mobile.json` for `["android", "iOS"]` omits `shell:*` + `core:menu:*`.)
- [x] **CHANGELOG.md entry** — record the layered-foundation decision so future agents stop re-debating settled ground. (Version 0.1.5 records the full session.)

**See full plan + verified primary-source facts**: [`.claude/plan/cross-platform-foundation.md`](.claude/plan/cross-platform-foundation.md)

## Closed: incorporate Google's `design.md` (2026-05-25, CHANGELOG 0.1.7)

- [x] **Clone + study `google-labs-code/design.md`** — cloned to `~/_work/repos/google-labs-code-design.md/`. Determined it is a **format spec** (YAML+markdown for agent-readable design systems), not a UI library; no Material 3 adoption needed.
- [x] **Audit** — produced `openspec/changes/archive/2026-05-25-design-md-format-adoption/proposal.md` (22.7K) categorising every spec feature into Adopt/Adapt/Skip with constraint sets.
- [x] **Plan** — `openspec/changes/archive/2026-05-25-design-md-format-adoption/design.md` (34.5K) with 10 numbered decisions, 9 PBT properties, 14-row risk matrix. `tasks.md` with 88 checkbox tasks across 10 sections.
- [x] **Implement** — `DESIGN.md` at repo root + `@google/design.md@0.1.1` (Apache-2.0) + `vitest-axe` lane (32 specs) + `scripts/design-diff.mjs` regression gate + DTCG and Tailwind exports. All gates green.

### Follow-ups queued

- [x] **OpenPencilEditor a11y spec** — resolved: the dedicated-view a11y suite now synthesizes a valid OpenPencil files-mode `sub` prop and covers the editor surface. Inspector controls have explicit accessible names so the new axe gate stays green.
- [x] **Router-mock fidelity for `components.spec.ts` + `overlays.spec.ts`** — resolved: both a11y files now use real `createRouter({ history: createMemoryHistory() })` plugins, matching `views.spec.ts` and eliminating Vue Router Symbol injection warnings from `bun run test:a11y`.
- [x] **`@google/design.md` post-archive path references** — resolved: docs now point at `openspec/changes/archive/2026-05-25-design-md-format-adoption/` instead of the pre-archive path.
- [ ] **Auto-generate `DESIGN.md` ↔ `colors_and_type.css`** — current sync is manual; lint catches broken `{token.path}` references but not CSS-side `--lifeos-cyan: #...` drift. A small build-time check (regex parse over CSS variables, JSON-equal against DESIGN.md YAML) would close this.
- [x] **GitHub Actions workflow for `bun run check`** — resolved: `.github/workflows/ci.yml` runs the umbrella `bun run check` gate on PRs and on maintained branch prefixes.
- [ ] **Browser-backed Playwright axe lane** — happy-dom cannot reliably compute `:hover` / `:focus-visible` pseudo-classes. A Playwright lane against `bun run dev` could lock pseudo-state contrast (Button hover, focus rings) — not blocking today.
- [ ] **`@google/design.md` post-alpha migration** — pin is `0.1.1` exact. When upstream leaves alpha, re-validate the token shape and update the pin. Track at https://github.com/google-labs-code/design.md/releases.
- [ ] **CSS-tailwind export** — `@google/design.md@0.1.1` documents `css-tailwind` (Tailwind v4 `@theme` block) but only implements `tailwind` (v3 JSON). Switch when upstream ships the v4 format.
- [x] **DESIGN.md `badge-count` contrast fix** — resolved: `badge-count.textColor` changed to `{colors.on-brand}` (#0A0A0A on #FF4D6A ≈ 6:1, passes WCAG AA). Design lint: 0 warnings.

**Reference**: [`.claude/plan/google-design-incorporation.md`](.claude/plan/google-design-incorporation.md), `openspec/changes/archive/2026-05-25-design-md-format-adoption/`.

## Dev environment — codex multi-model backend (2026-05-25)

Discovered during `/ccg:spec-init`. Codex backend currently blocked, so CCG runs in single-model (Claude-only) mode until both items below are done.

- [ ] **Patch `~/.codex/hooks.json` to absolute path** — change `"command": "python3 .codex/hooks/ccg-workflow.py"` → `"command": "python3 /home/drdave/.codex/hooks/ccg-workflow.py"`. The relative path fails in any cwd that lacks `.codex/hooks/ccg-workflow.py` (i.e. every project except `~`), causing codex to report `hook: UserPromptSubmit Blocked` and silently swallow every prompt. User-global config edit; codex will re-prompt to trust the new hook hash on next launch.
- [ ] **`git init` this repo** — `ubuntu-lifeos` is not a git repository, which blocks codex (`Not inside a trusted directory and --skip-git-repo-check was not specified`) and codeagent-wrapper's codex backend. Either run `git init` here, or pass `--skip-git-repo-check` per call. Repo currently has substantial history-worthy content (CLAUDE.md, AGENTS.md, README.md, plans, src/, src-tauri/) — initializing version control is overdue regardless of the codex issue.
- [ ] **(Optional) Resolve rmcp `serde error` noise** — on every codex start, one of the configured MCP servers in `~/.codex/config.toml` (`gitnexus`, `ruvector`, `mempalace`, `understand-anything`, `open-pencil`, `fast-context`, `context7`) emits non-JSON on stdout, triggering `rmcp::transport::async_rw: Error reading from stream: serde error expected value at line 1 column 1`. Doesn't block, just pollutes logs. Bisect by commenting out servers one at a time.

## database-storage-foundation OPSX change — closed 2026-05-25

`/ccg:spec-impl` completed. All tasks 1–8 green. See CHANGELOG 0.1.6 for the full record.

- [x] Cargo workspace + feature flag setup (`storage` feature, default-on)
- [x] Migration SQL files (`0001_accounts.sql`, `0002_mempalace.sql`, `0003_ruvector.sql`)
- [x] Storage core module (`Storage`, `DbHealth`, `MigrateReport`, pool + PRAGMA init)
- [x] `accounts` module (CRUD + one-time `migrate_from_json`)
- [x] `mempalace` module (nodes/edges/drawers upsert/get/clear)
- [x] `ruvector` module (vector encode/decode + upsert/get/clear; GNN cache)
- [x] Tauri shell integration (`db_health`, `db_migrate` commands; Storage init in setup)
- [x] Tests (round-trip, FK cascade, vector bit-exact, constraint violations, JSON migration idempotency)

## Database driver alternatives — considered & deferred (2026-05-25)

Decision: `sqlx` (async, both drivers in one crate, rustls, embedded migrations) is the chosen integration layer for the `database-storage-foundation` OPSX change. The three alternatives below were deliberately rejected for the initial change; entries kept so the decision is auditable and we don't re-litigate without new information.

- [ ] **`tauri-plugin-sql` — revisit only if the frontend ever needs direct DB access** — Tauri's official plugin (sqlite/mysql/pg, `@tauri-apps/plugin-sql` on the JS side, no `#[tauri::command]` wrappers needed). Rejected because it couples DB to Tauri, breaks the `lifeos-daemon` headless Pi target, and `lifeos-core` cannot consume it. Trigger to revisit: the Vue layer gains a legitimate need to bypass Rust for ad-hoc queries (none today).
- [ ] **`sea-orm` — revisit only if hand-written sqlx becomes painful** — Active-record / entity layer over sqlx. Same drivers, same rustls posture, adds codegen + slower compile + extra learning surface. Trigger to revisit: the hand-written sqlx query layer exceeds ~25 entities OR `sqlx::migrate!` outgrows our migration story.
- [ ] **`rusqlite + tokio-postgres` — revisit only if sqlx's runtime conflicts with an embedded target** — Minimalist, separate codepaths per driver, sync `rusqlite` for SQLite. Rejected because dual codepaths double the maintenance surface and we'd lose unified query macros. Trigger to revisit: sqlx's tokio runtime turns out to be too heavy for a single-threaded `std`-enabled embedded target (Pi Zero, ESP32-S3 with `std`).

## Carry-over from prior closures (none blocking "production ready")

- [ ] Real OpenPencil edit-write persistence (the AI bridge handles the chat path; SFC-write persistence is separate)
- [ ] Per-icon dynamic Lucide import (current static 152-icon barrel is already 10× smaller than the original; diminishing returns)
- [ ] Full `data.js` → typed `src/data/*.ts` content port (types are in place; migrating callers is busywork)
- [ ] Tauri auto-updater wiring (`tauri-plugin-updater`)
- [ ] First-run onboarding tour
- [ ] System tray icon (intentionally stripped in Stage 2 — revisit when a real tray UX exists)
- [ ] Mobile breakpoints below 480 px

**See full state**: [`.claude/plan/loop-closure.md`](.claude/plan/loop-closure.md)

## File pointers for next session

| File | Purpose |
|---|---|
| `HANDOFF.md` | Orientation for any agent returning to this repo |
| `CHANGELOG.md` | Version history with iteration summaries |
| `AGENTS.md` | Durable operating contract |
| `AUDIT.md` | Pre-loop swarm audit (historical) |
| `.claude/plan/loop-closure.md` | Canonical end-state document |
| `.claude/plan/cross-platform-foundation.md` | Foundation verification — layered architecture across desktop/mobile/Pi/ESP32 |
| `.claude/plan/google-design-incorporation.md` | Next-session task plan |
| `design-system-reference/README.md` | LifeOS Design System spec |
