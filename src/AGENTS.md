<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# src

## Purpose
LifeOS Vue 3 application source. Pinia store + vue-router + Vite-bundled SFCs that render the dark-first six-workspace shell defined in the root contract. Tauri's `beforeBuildCommand` consumes the Vite output of this tree as `frontendDist`.

## Key Files
| File | Description |
|------|-------------|
| `main.ts` | Bootstraps the app: `createApp(App)` + Pinia (with `tauriPersistence` plugin registered **before** `app.use(pinia)`) + router + side-effect imports of `../data.js` and `../styles.css`. Bridges `lifeos:navigate` Tauri events → `router.push`. |
| `App.vue` | Root shell SFC: `Sidebar | Workspace | main | AIAvatar` plus the global `CommandPalette`, `KeyboardHelp`, `NotificationsDrawer`, and `ToastContainer` overlays. The `<main>` swaps SettingsView / ContactsView / Dashboard / OpenPencilEditor / N8nFlowView / LightsView / CalendarView / FilesView / HealthView / IoTView / SubsectionView based on `lifeos.activeId` and `lifeos.activeSub.item?.view`. |
| `shims-vue.d.ts` | `*.vue` module declaration for `vue-tsc`. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `components/` | 22 SFCs — shell, view panes, overlays, primitives (see `components/AGENTS.md`) |
| `stores/` | Pinia stores with `.ts` (canonical) ↔ `.js` (preview-path sibling) (see `stores/AGENTS.md`) |
| `lib/` | Resolver, nav composable, persistence plugin, icons barrel (see `lib/AGENTS.md`) |
| `router/` | vue-router config; URL → Pinia state sync (see `router/AGENTS.md`) |
| `data/` | TypeScript types for `window.LIFEOS_DATA` (see `data/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Path alias `@/` → `src/` is declared in `tsconfig.json` + `vite.config.ts` + `vitest.config.ts`. Update all three when adding aliases.
- Every new `.vue` SFC uses `<script setup>` with **explicit `defineProps()` schemas** — inferred props caused the AUDIT.md icon-click bug.
- TypeScript for everything new. Where a `.ts` has a `.js` sibling (`stores/lifeos`, `stores/toasts`, `lib/resolve`, `lib/nav`, `lib/persistence`), edit both together until the preview path is retired.
- Tauri-only branches must be guarded by `window.__TAURI__` (or the `tauriInvoke()` helper) so Vitest + the plain Vite dev server stay green.
- `data.js` lives one level up at the repo root — keep it side-effect-importable (no top-level `await`).

### Testing Requirements
Each interactive surface ships with a Vitest spec mirroring its path under `../tests/`. New components must land with their spec in the same change. Run `bun run test` before claiming done.

### Common Patterns
- Lucide icons via the kebab-name barrel in `lib/icons.ts` (`<Icon name="user" />`) — adding a new icon means adding both the named PascalCase import and the kebab map entry.
- All color, spacing, radius, shadow values come from `../colors_and_type.css` tokens — no inline hex.
- AI suggestions in copy are prefixed `LifeOS suggests:` (verbatim).

## Dependencies

### Internal
- `../data.js` — content layer (`LIFEOS_DATA`, `LIFEOS_AGGREGATORS`, `LIFEOS_FLOWS`) attached to `window` on import.
- `../colors_and_type.css` + `../lifeos_app.css` — design tokens + canonical component CSS.
- `../src-tauri/src/lib.rs` — every `tauriInvoke()` call here has a matching `#[tauri::command]` there.

### External
- `vue@^3.4.27` + `vue-router@^4.3.2` + `pinia@^2.1.7`
- `lucide-vue-next@^0.475.0`

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
