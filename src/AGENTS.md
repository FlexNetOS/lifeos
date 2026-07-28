<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-07-27 -->

# src

## Purpose
LifeOS **Svelte 5** application source. Pinia store + headless vue-router + Vite-bundled
Svelte components that render the dark-first six-workspace shell defined in the root
contract. Tauri's `beforeBuildCommand` consumes the Vite output of this tree as
`frontendDist`.

> **Framework note (phase-3 cutover).** The Vue SFC toolchain is retired — every component
> here is `.svelte` using Svelte 5 runes. The `vue` package is still a runtime dependency
> for exactly two reasons: it is Pinia's reactivity engine, and `vue-router` runs headless.
> There are no Vue components. `vite.config.ts` loads only `svelte()`; the typecheck is
> `svelte-check`, not `vue-tsc`.

## Key Files
| File | Description |
|------|-------------|
| `main.ts` | Bootstraps the app: `createPinia()` + `setActivePinia()` (with the `tauriPersistence` plugin registered **before** activation) → explicit ordered CSS imports → manual `router.push(router.options.history.location)` headless boot → `mount(App, { target: #app })`. Side-effect imports `../data.js`. Bridges `lifeos:navigate` Tauri events → `router.push`. |
| `App.svelte` | Root shell: `Sidebar \| Workspace \| main \| AIAvatar` plus the global `CommandPalette`, `KeyboardHelp`, `NotificationsDrawer`, and `ToastContainer` overlays. The `<main>` swaps SettingsView / ContactsView / Dashboard / OpenPencilEditor / N8nFlowView / LightsView / CalendarView / FilesView / HealthView / IoTView / SubsectionView based on `lifeos.activeId` and `lifeos.activeSub.item?.view` (gate at `App.svelte:70`). |
| `shims-svelte.d.ts` | `*.svelte` module declaration for `svelte-check` / TypeScript. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `components/` | 24 Svelte components — shell, view panes, overlays, primitives (see `components/AGENTS.md`) |
| `views/` | `Login.svelte` (pre-shell auth surface) |
| `stores/` | Pinia stores with `.ts` (canonical) ↔ `.js` (preview-path sibling), plus `auth.ts` (see `stores/AGENTS.md`) |
| `lib/` | Resolver, nav, persistence plugin, Pinia↔Svelte bridge, icon barrels (see `lib/AGENTS.md`) |
| `router/` | vue-router config; URL → Pinia state sync |
| `data/` | TypeScript types for `window.LIFEOS_DATA` (see `data/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Path alias `@/` → `src/` is declared in `tsconfig.json` + `vite.config.ts` +
  `vitest.config.ts` + `vitest.a11y.config.ts`. Update all four when adding aliases.
- Every component destructures **`$props()` explicitly with defaults** —
  `let { item, collapsed = false, onclick } = $props()`. Implicit props caused the
  AUDIT.md icon-click bug.
- Use **callback props** (`onclick={fn}`), not `createEventDispatcher`. Children render
  via `{@render children?.()}`.
- **Pinia is bridged, never consumed raw in a component:**
  ```svelte
  import { useLifeos } from "@/stores/lifeos.js";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  const lifeosState = bindStore(useLifeos(), ["activeId", "wsCollapsed"]);
  ```
- **Navigation uses `createNav(router)`** from `@/lib/svelte-nav.js` — *not* `useNav()`
  from `nav.ts`. `useNav()` calls vue-router's `useRouter()`, which needs Vue component
  injection that no longer exists in a Svelte tree.
- TypeScript for everything new. Where a `.ts` has a `.js` sibling (`stores/lifeos`,
  `stores/toasts`, `lib/resolve`, `lib/nav`, `lib/persistence`), edit both together until
  the preview path is retired. `lib/icons-svelte.js` is **exempt** — it is Svelte-only glue,
  deliberately not a third sibling of `icons.ts`.
- Tauri-only branches must be guarded by `window.__TAURI__` (or the `tauriInvoke()` helper)
  so Vitest + the plain Vite dev server stay green.
- `data.js` lives one level up at the repo root — keep it side-effect-importable (no
  top-level `await`).

### Testing Requirements
Each interactive surface ships with a Vitest spec mirroring its path under `../tests/` as
`<Name>.svelte.spec.js`. New components must land with their spec in the same change. New
views/overlays also need an `../tests/a11y/` case. Run `bun run test` and
`bun run test:a11y` before claiming done.

Both Vitest configs alias `lucide-svelte` → `../tests/__mocks__/lucide-svelte.js` and set
`resolve.conditions: ["browser"]` so Svelte's compiled output mounts into happy-dom.

### Common Patterns
- Lucide icons via the kebab-name barrel in `lib/icons-svelte.js` (`<Icon name="user" />`) —
  adding a new icon means adding **both** the named PascalCase import and the kebab map
  entry, or you get a silent blank placeholder.
- All color, spacing, radius, shadow values come from `../colors_and_type.css` tokens — no
  inline hex. Most components carry **no CSS at all** and consume global classes from
  `../lifeos_app.css`; only 8 have a scoped `<style>` block.
- Components mapped to the Figma companion carry a `data-figma-component` anchor
  (`Sidebar.svelte`, `Workspace.svelte`, `MenuRow.svelte`). **Removing or renaming one
  breaks `bun run figma:sidebar:check`.**
- AI suggestions in copy are prefixed `LifeOS suggests:` (verbatim).

## Dependencies

### Internal
- `../data.js` — content layer (`LIFEOS_DATA`, `LIFEOS_AGGREGATORS`, `LIFEOS_FLOWS`)
  attached to `window` on import.
- `../colors_and_type.css` + `../lifeos_app.css` + `../styles.css` — design tokens,
  canonical component CSS, top-level styles. Imported in that exact order by `main.ts`;
  nested `@import` triggers PostCSS ordering warnings.
- `../src-tauri/src/lib.rs` — every `tauriInvoke()` call here has a matching
  `#[tauri::command]` there.

### External
- `svelte@^5.56.7`
- `pinia@^3.0.4` + `vue@^3.5.34` (reactivity engine only) + `vue-router@^5.0.7` (headless)
- `lucide-svelte@^1.0.1`

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
