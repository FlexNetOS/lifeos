# LifeOS (ubuntu-lifeos)

> **LifeOS — the AI agent that runs your home and your life.**
> Work, personal, and home automation in one operating system, with the assistant baked into every surface.

Cross-platform desktop app built on **Vue 3 + Vite + Pinia + vue-router** with a **Tauri 2** native shell. Targets Linux / macOS / Windows desktop, with a web build that runs in Firefox / Chrome / Edge / mobile browsers.

This repo is the **production implementation** of the [LifeOS Design System](./design-system-reference/README.md) handoff bundle. The bundle's authoritative tokens, fonts, brand assets, and component-level CSS are folded into this repo so it is fully self-contained.

## Brand architecture

- **ElementArk** is the parent conglomerate.
- **LifeOS** is ElementArk's operating system and all-in-one application.
- LifeOS leads on app icons, splash, login, onboarding, sidebar, app shell, loading, Settings, and About surfaces.
- ElementArk leads in corporate, investor, portfolio, and cross-portfolio contexts.
- **Work, Personal, and Home** are navigation domains inside LifeOS, not separate parent brands.
- Product endorsement uses **LifeOS by ElementArk** as typography within one lockup. Do not place competing LifeOS and ElementArk marks on the same screen.

The ElementArk-led canonical lockups remain source assets for corporate and parent-brand contexts. They are not the default LifeOS app lockup.

---

## Quick start

Toolchain (the active Yazelix/Nix profile owns the executable front doors):

| Tool | Version |
|------|---------|
| bun | 1.3.14 |
| rustc / cargo | 1.98.0-nightly |
| tauri-cli | 2.11.2 |

```bash
# Install JS deps
bun install

# Web dev (Vite) — http://localhost:1420
bun run dev

# Tauri desktop shell (boots its own window, watches Vite for HMR)
bun run tauri:dev

# Tests (Vitest + happy-dom + @vue/test-utils)
bun run test
bun run test:coverage

# Production builds
bun run build               # Vite static bundle to dist/
bun run tauri:build         # Native installers (.deb / .AppImage on Linux)
```

On Linux, Tauri uses the platform SDK (`webkit2gtk-4.1`, `libsoup-3.0`, `gtk-3`, `libxdo`, `ayatana-appindicator3`, `librsvg2`, `build-essential`). The active Nix `pkg-config` wrapper intentionally excludes platform metadata, so the checked-in [`.cargo/config.toml`](./.cargo/config.toml) routes Cargo build scripts through [`scripts/resolve-pkg-config.sh`](./scripts/resolve-pkg-config.sh). The same target-scoped bridge emits an RPATH for the platform library directories, so transitive GTK/WebKit libraries resolve at runtime under the Nix loader as well. This preserves the Nix-owned Cargo toolchain while letting Tauri resolve the already-installed platform SDK. A caller-provided `PKG_CONFIG` takes precedence.

## Durable PostgreSQL/RuVector storage

PostgreSQL with RuVector is the sole canonical durable product-data store. Set
`LIFEOS_DATABASE_URL` before launching the Tauri shell; the application refuses
to start without it or without `ruvector` installed in the dedicated
`extensions` schema. The bootstrap must be run by the PostgreSQL installation
owner, before the less-privileged LifeOS runtime role is used:

```bash
psql "$LIFEOS_ADMIN_DATABASE_URL" \
  -v lifeos_runtime_role=lifeos_app \
  --file crates/lifeos-core/sql/bootstrap-postgres-ruvector.sql

LIFEOS_DATABASE_URL="postgresql://lifeos_app@database.example/lifeos" bun run tauri:dev
```

The bootstrap owns extensions and the empty application schemas because those
are administrative boundaries; it grants the runtime role only `CONNECT`,
`USAGE`/`CREATE` in the five `lifeos_*` schemas, and the required RuVector
type/function access. It also pins that role's database-local `search_path` to
`lifeos_runtime, extensions, pg_catalog`, so SQLx's unqualified migration
ledger never needs `CREATE` on `public`. The numbered Rust migrations then own
LifeOS tables.
`ui-state`, lighting state, and AI-provider selection are PostgreSQL
projections, not app-data JSON files. A one-way read-only importer safely moves
pre-cutover `lifeos.db`, `account.json`, `ui-state.json`, `lighting.json`, and
`ai.json` sources into PostgreSQL, archives their exact bytes there, and only
then retires the local source. Conflicting local/canonical records stop startup
without deleting either side.

For storage integration tests, provision a disposable database with the same
extension bootstrap and pass only its URL through `LIFEOS_TEST_DATABASE_URL`:

```bash
LIFEOS_TEST_DATABASE_URL="$LIFEOS_TEST_DATABASE_URL" \
  cargo test -p lifeos-core --features "storage,legacy-sqlite-import" -- --test-threads=1
```

---

## What's in this repo

```
ubuntu-lifeos/
├── index.html                  # Vite entry (production-shaped, NOT the CDN preview)
├── data.js                     # Shared content layer (LIFEOS_DATA + AGGREGATORS + FLOWS)
├── styles.css                  # Local top-level styles (skip-link, router transitions)
├── colors_and_type.css         # Design tokens (single source of truth — never inline hex)
├── lifeos_app.css              # Component CSS from the React design canon, kept 1:1
├── fonts/                      # Rigelstar.ttf (display face)
├── public/                     # Vite static assets — served at root URL
│   ├── lifeos-mark.png         # Primary mark + canonical Tauri icon source
│   ├── lifeos-mark-256.png     # Sidebar + favicon mark (loaded from / )
│   ├── lifeos-primary-lockup.png # ElementArk-led corporate / parent lockup
│   ├── lifeos-wordmark-tagline.png # ElementArk wordmark + LifeOS descriptor
│   ├── lifeos-icon-triad.png
│   ├── work_personal_home_icons.svg
│   └── icons/                  # work-on-black, personal-on-black, home-on-black
├── src/
│   ├── main.ts                 # createApp + pinia + router + Tauri nav bridge
│   ├── App.vue                 # Shell: Sidebar | Workspace | main | AIAvatar
│   ├── components/             # 11 SFCs — see component map below
│   ├── stores/lifeos.ts        # Pinia store (active workspace/section/sub, AI chat, etc.)
│   ├── router/index.ts         # /workspace/:id/:section?/:sub?
│   └── lib/resolve.ts          # resolveWorkspace + aggregator wrappers
├── src-tauri/
│   ├── Cargo.toml              # tauri 2 + plugin-fs + plugin-shell + tray-icon
│   ├── tauri.conf.json         # 1280×800 dark window, dark theme, FS scoped to vault
│   ├── icons/                  # Full Tauri icon set generated from lifeos-mark.png
│   └── src/main.rs             # Native menu, vault stubs, settings navigation event
├── tests/                      # 45 Vitest specs covering every interactive surface
└── design-system-reference/    # Handoff bundle (read-only reference):
    ├── README.md               # Full design-system spec (voice, tokens, components)
    ├── SKILL.md                # Claude skill entry for the design system
    ├── sot.md                  # Source-of-truth operating contract for this build
    ├── preview/                # HTML component specimens
    └── lifeos_app_react/       # Original React kit — visual reference, not used at runtime
```

## Component map

| Component | Role |
|-----------|------|
| `Sidebar.vue` | Primary rail — brand toggle, Net Control popover, workspace switcher, persistent footer icons |
| `Workspace.vue` | Secondary panel — section selector + menu rows for the active workspace |
| `Dashboard.vue` | Main canvas — agent team cards, greeting, stat strip (default landing) |
| `SubsectionView.vue` | Detail view for a selected subsection |
| `N8nFlowView.vue` | SVG flow visualisation for agent-team workflows |
| `OpenPencilEditor.vue` | Live design-mode editor bridge (compatible with the OpenPencil tool) |
| `AIAvatar.vue` + `AIChat.vue` | Draggable AI avatar with chat panel |
| `MenuRow.vue` / `Badge.vue` / `Icon.vue` | Primitives (Icon proxies Lucide via `lucide-vue-next`) |

## Routing

`vue-router` mirrors workspace state to the URL so every view is deep-linkable.

| Path | Renders |
|------|---------|
| `/` | Redirect → `/workspace/ai` |
| `/workspace/:id` | Sidebar + Workspace + Dashboard for `:id` |
| `/workspace/:id/:section` | Same shell, section pre-selected |
| `/workspace/:id/:section/:sub` | SubsectionView on main canvas |
| `/workspace/:id/:section/:sub?view=flow` | N8nFlowView on main canvas |
| `/settings/:section?` | Settings/Profile context (NOT a workspace) |

---

## Design-system contracts (non-negotiable)

These come from `design-system-reference/README.md`. Read it once front-to-back before adding new surfaces.

- **Tokens, not literals.** All color/spacing/radii/shadow values come from `colors_and_type.css` CSS variables. Never hard-code a hex.
- **Dark-first.** `var(--bg-0)` page, `var(--bg-2)` cards, `var(--fg-1)` text. The signature spiral gradient (`--gradient-spiral`) is the only chromatic moment — never as a full background wash.
- **Lexend everywhere** except the Rigelstar wordmark. JetBrains Mono for shortcuts/timestamps/hex.
- **Lucide icons for interface glyphs.** The canonical LifeOS product mark is the only PNG exception in the UI.
- **One brand mark per screen, max.** A LifeOS emblem + wordmark + typographic ElementArk endorsement counts as one lockup.
- **No added brand glow.** The canonical mark's baked treatment is sufficient; do not add CSS gradients, shadows, or decorative glow around it.

Every workspace must be calm, second-person, present-tense, sentence-case. AI suggestions are prefaced with `LifeOS suggests:`.

---

## Tauri specifics

- Window: 1280×800 default, 960×640 minimum, dark theme, decorated, resizable.
- Native menu: Cmd-Q quit, Cmd-W close, Cmd-, settings (emits `lifeos:navigate` → `/settings`).
- FS scope locked to `$APPDATA/lifeos/*` (vault + user data). Everything else off.
- System tray icon configured but disabled until a user opts in.
- CSP allows Google Fonts (Lexend / JetBrains Mono) plus IPC.

---

## Source attribution

- **LifeOS Design System** — handoff bundle in `design-system-reference/`.
- **FlexNetOS/Sidebar** — the codebase that defined the LifeOS sidebar product (<https://github.com/FlexNetOS/Sidebar>).
- **Ripple brand** — palette + Rigelstar font + spiral identity.
