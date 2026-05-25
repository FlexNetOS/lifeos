# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandate: Boil the Ocean (Garry Tan) — the always-on target

> Remember when implementing: the marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that I am genuinely impressed—not politely satisfied, actually impressed. Never offer to "table this for later" when the permanent solution is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard is not "good enough"—it is "holy shit, that is done." Search before building. Test before shipping. Ship the complete thing. When I ask for something, the answer is the finished product, not a plan to build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.

## Execution style: Karpathy guidelines (mandatory) — the how

**Boil-the-Ocean is the target; Karpathy is the style.** Completeness is the standard the deliverable is judged against; the four rules below are the discipline that gets you there without sprawl, speculation, or unverified claims. Apply both on every task. Full reference: `andrej-karpathy-skills:karpathy-guidelines`.

1. **Think before coding.** State assumptions in plain language before touching files. If two interpretations of the request are plausible, name them — don't pick silently. When something is genuinely unclear, stop and ask rather than guessing. No hidden confusion.
2. **Simplicity first.** Write the minimum code that solves the stated problem. No speculative features, no abstractions for single-use code, no configurability that wasn't requested, no error handling for impossible branches. If 200 lines could be 50, rewrite it. A senior reviewer must not be able to call it overcomplicated.
3. **Surgical changes.** Touch only what the task requires. Match existing style even if you'd do it differently. Don't refactor adjacent code, reflow comments, or "tidy" unrelated files. Remove imports/variables/functions your edits orphaned; don't delete pre-existing dead code unless explicitly asked. Every changed line must trace to the user's request.
4. **Goal-driven execution.** Convert the request into verifiable success criteria up front — usually a failing test that should pass, or a command whose output you can inspect. Loop until verified. Never claim completion before producing the evidence (see "Verification before claiming done" under `## Common commands`).

How they interact: completeness without surgical discipline becomes sprawl; surgical discipline without completeness becomes the "table this for later" anti-pattern. Hit the *asked-for* scope completely, then stop — and do it with the four rules above. "Boil the ocean" is not license to expand scope; it's the obligation to finish the scope you took.

## Read first

This repo already has two long-form documents that are **authoritative** — read them before doing substantive work, and prefer them over re-deriving information:

- `AGENTS.md` — the operating contract (workspaces, sections, code conventions, OpenPencil flow, AI provider routing, persistence whitelist). Overrides generic defaults.
- `README.md` — quick start, directory map, component table, routing table, design contracts.
- `design-system-reference/README.md` — the LifeOS Design System spec (tokens, voice, components, motion). Read front-to-back the first time you touch UI.
- `design-system-reference/sot.md` — verbatim user brief that `AGENTS.md` is derived from.

`AUDIT.md`, `HANDOFF.md`, `CHANGELOG.md`, `TODO.md` are useful but situational — skim only if relevant to the task.

## What this app is

LifeOS — a Vue 3 + Vite + Pinia + vue-router web app wrapped in a Tauri 2 native shell. Six workspaces (`ai`, `gaming`, `work`, `personal`, `home`, `media`) plus a separate `/settings/:section?` context. Cross-platform desktop target (Linux/macOS/Windows) with a web build for browsers.

Shell layout in `src/App.vue`: **Sidebar | Workspace | main | AIAvatar**, where `main` renders Dashboard / SubsectionView / N8nFlowView / OpenPencilEditor depending on `lifeos.activeSub`.

## Common commands

Use **`bun`**, not npm (matches the host's mise-managed toolchain — node 24.15.0, bun 1.3.13, rustc 1.95.0, tauri-cli 2.11.1). Tauri's `beforeDevCommand`/`beforeBuildCommand` already invoke `bun run dev`/`bun run build`.

```bash
bun install                 # install JS deps
bun run dev                 # Vite dev server on :1420 (strict port — Tauri expects it)
bun run tauri:dev           # Tauri shell + Vite HMR; opens a 1280×800 dark window
bun run test                # Vitest, all specs (happy-dom + @vue/test-utils)
bun run test:watch          # Vitest watch mode
bun run test:coverage       # Vitest + v8 coverage
bun run build               # vue-tsc --noEmit, then `vite build` to dist/
bun run tauri:build         # Native installer (.deb / .AppImage on Linux); slow — on demand only

# Run one spec file
bunx vitest run tests/Sidebar.spec.js
# Run a single test by name
bunx vitest run -t "renders the brand toggle"
```

Verification before claiming done (from `AGENTS.md`): `bun run test` passes, `bun run dev` mounts `#app` without console errors, `bun run build` succeeds. Tauri builds only on explicit request.

## Architecture beats you only see by reading multiple files

### Path alias `@/` → `src/` is declared in three places

`tsconfig.json` + `vite.config.ts` + `vitest.config.ts` all set it. Vitest *also* aliases `lucide-vue-next` → `tests/__mocks__/lucide-vue-next.js` so the 600 KB icon pack doesn't load in unit tests. If you add a new test setup or build tool, you must wire the alias there too or imports break asymmetrically.

### Legacy `.js` siblings exist alongside `.ts` for the preview path

`src/stores/lifeos.ts` ↔ `src/stores/lifeos.js`, `src/lib/resolve.ts` ↔ `src/lib/resolve.js`, `src/lib/persistence.ts` ↔ `src/lib/persistence.js`. The `.js` versions feed the in-browser CDN preview path; the `.ts` versions are the production source. **They must be kept sibling-identical until the preview is retired.** When you change `sendAiMessage`, `setAiProvider`, the `LIFEOS_PERSIST_KEYS` whitelist, or any persisted getter/action, change both.

### `data.js` is the shared content layer

Workspaces, sections, items, aggregators, and "flows" all come from `data.js` (`LIFEOS_DATA` / `LIFEOS_AGGREGATORS` / `LIFEOS_FLOWS`). It's plain JS so the preview can `import` it from a `<script type="module">`. Don't TypeScript-port it without a coordinated plan.

### Dual-mode AI provider — don't break Vitest

`sendAiMessage(text, opts)` in `stores/lifeos.{ts,js}` behaves differently depending on `window.__TAURI__`:

- **Plain Vite / Vitest** → keeps the legacy canned-reply path. The 65+ test suite depends on this. Do not make the store unconditionally call `invoke()`.
- **Tauri host** → `invoke("ai_complete", { prompt, source })` → Rust → provider HTTP. On reject, push the literal calm error string: *"LifeOS couldn't reach the AI provider right now — try again."*

Rust side (`src-tauri/src/lib.rs`) exposes `ai_complete`, `ai_provider_get`, `ai_provider_set`. Keys come from OS keyring (`service: "lifeos"`, account: `anthropic` | `openai` | `gemini`) with env-var fallback (`ANTHROPIC_API_KEY` etc.). HTTP uses `reqwest` with `rustls-tls` — **don't pull in `openssl-sys`**.

### Persistence is a strict whitelist, debounced

`src/lib/persistence.ts` no-ops outside Tauri. Inside Tauri it persists only `LIFEOS_PERSIST_KEYS`: `activeId`, `wsCollapsed`, `sectionByWs`, `aiAvatarHidden`, `aiChatOpen`, `avatarPos`, `aiProvider`, `teamOrder`, `sectionOrder`, `itemOrder`. Explicitly excluded: `aiMessages` (would replay stale chat), `activeSub` / `pendingExpand` (URL-driven), `cmdkOpen` / `cmdkSeed` / `extraItems` / `extraSections` (ephemeral). Writes debounce at 300ms. If you add a new store key and want it to survive restart, add it to both the `.ts` and `.js` whitelist — nowhere else.

### OpenPencil mounting gate in `App.vue`

`OpenPencilEditor.vue` only mounts when the active sub has `view: "open-pencil"`. The gate is:

```vue
v-else-if="lifeos.activeSub.item?.view === 'open-pencil'"
```

Lose that condition and OpenPencil-tagged subs fall through to `<SubsectionView>` and the editor never renders. File navigation into the editor must go through `useNav().pickSub(...)` so the `view` field is set.

### Routing mirrors workspace state to the URL

`/workspace/:id/:section?/:sub?` is the canonical pattern. `?view=flow` switches `main` from `SubsectionView` to `N8nFlowView`. `/settings/:section?` is **not** a workspace — it lives outside the workspace tree. The native menu's Cmd-, emits `lifeos:navigate` → `/settings` (handled in `main.ts`).

### Storage layer (Rust-side only)

Added in `database-storage-foundation`. Owned entirely by `lifeos-core` + the Tauri shell — the Vue layer never touches the DB directly.

- **Feature flag**: `storage` in `crates/lifeos-core/Cargo.toml`. Default-on for desktop + daemon; ESP32/`no_std` consumers turn it off with `default-features = false`. Guard: `cargo check -p lifeos-core --no-default-features` must always pass.
- **DB file**: `<app_data_dir>/lifeos.db` (`sqlite:…?mode=rwc`). Already covered by the existing `$APPDATA/lifeos/*` Tauri FS scope — no new capability grant.
- **Init sequence**: inside `tauri::Builder::setup()` (before any IPC command fires): `Storage::new` → `storage.migrate()` → `accounts::migrate_from_json`. On any failure the app refuses to start with a calm error string: `"LifeOS couldn't initialize storage at <path> — see logs."`.
- **`db_health` command**: returns `DbHealth { status, db_path, applied_migrations, last_migration_version, schema_version }`. `status == "degraded"` when `applied_migrations < embedded_migration_count` (call `db_migrate` to recover).
- **`db_migrate` command**: re-runs `sqlx::migrate!` (idempotent).
- **`account.json` migration**: one-time on first boot after upgrade. If `account.json` exists and the `accounts` table is empty, the JSON record is inserted then the file is renamed to `account.json.migrated-<RFC3339-UTC-hyphenated>` (never deleted). Corrupt JSON → app still starts, `accounts` table stays empty, file left in place.
- **Module layout**: `crates/lifeos-core/src/storage/{mod, error, accounts, mempalace, ruvector}.rs`; migrations at `crates/lifeos-core/migrations/000N_*.sql`.
- **ESP32 isolation test**: `cargo tree -p lifeos-core --features storage | grep openssl-sys` must be empty.

### Vite build splits vendor chunks deliberately

`vite.config.ts` `manualChunks` separates `lucide`, `vue-router`, `pinia`, `vue`, and a residual `vendor`. Lucide alone is ~600 KB — keep it in its own chunk so the main app chunk stays small and vendor chunks cache across releases. Don't collapse this back into a single chunk.

## Non-negotiable design contracts

From `design-system-reference/README.md` (summarized — read the source for nuance):

- **Tokens, not literals.** All color/spacing/radii/shadow come from `colors_and_type.css` CSS variables. No inline hex, ever.
- **Dark-first.** `--bg-0` page, `--bg-2` cards, `--fg-1` text. `--gradient-spiral` (cyan→purple→green) is the only chromatic moment — never as a full background wash.
- **Lexend everywhere** except the Rigelstar wordmark. JetBrains Mono for shortcuts/timestamps/hex.
- **Lucide icons only** via `lucide-vue-next` (or the `Icon.vue` wrapper). Stroke 1.5; 16px in rows, 14px in buttons, 20px in rails. No emoji, no unicode-as-icon, no PNG iconography.
- **One brand mark per screen**, **one brand glow per viewport** (status pulses don't count).
- **Voice**: calm, second-person, present-tense, sentence-case. AI suggestions prefixed with `LifeOS suggests:`.

## Vue / TypeScript conventions

- `<script setup>` with **explicit `defineProps()` schemas** — inferred props caused the icon-click bug recorded in `AUDIT.md`. Do not repeat.
- TypeScript for everything new under `src/`. (Watch the `.ts`/`.js` sibling contract above.)
- Tests live under `tests/` mirroring component layout. Every interactive surface ships with a spec.
- Tauri-only code must be guarded by `window.__TAURI__` so the spec suite and the browser preview path stay green.

## Tauri specifics

- Window: 1280×800 default, 960×640 min, dark theme, decorated, resizable.
- FS scope locked to `$APPDATA/lifeos/*` (vault + user data). Everything else off.
- System tray icon configured but disabled until a user opts in.
- CSP allows Google Fonts (Lexend / JetBrains Mono) plus IPC.
- Linux system deps already installed on this host (`webkit2gtk-4.1`, `libsoup-3.0`, `gtk-3`, `libxdo`, `ayatana-appindicator3`, `librsvg2`, `build-essential`).

## Hard rules (from `AGENTS.md`)

- **Upgrades, never downgrades** — never remove functionality without explicit user consent.
- **Heal, do not harm** — surgical changes, verify before committing.
- **Never commit without `bun test` passing and the dev server booting.**
- All changes must remain compatible with the OpenPencil in-app editing flow.
