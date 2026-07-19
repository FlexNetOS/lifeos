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

Toolchain (matches the host's `mise`-managed tree):

| Tool | Version |
|------|---------|
| node | 24.15.0 |
| bun | 1.3.13 |
| rustc / cargo | 1.95.0 |
| tauri-cli | 2.11.1 |

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

Tauri Linux system deps already installed on this host (`webkit2gtk-4.1`, `libsoup-3.0`, `gtk-3`, `libxdo`, `ayatana-appindicator3`, `librsvg2`, `build-essential`).

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
