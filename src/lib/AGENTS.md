<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# lib

## Purpose
Shared helpers used across SFCs and the store: data resolver, navigation composable, the Tauri-only Pinia persistence plugin, and the static Lucide icon barrel.

## Key Files
| File | Description |
|------|-------------|
| `resolve.ts` | `resolveWorkspace(id)` returns the workspace, settings profile, or aggregator-built workspace from `window.LIFEOS_DATA`. `flow(flowId)` returns a flow definition. |
| `resolve.js` | Preview-path sibling — keep API-identical. |
| `nav.ts` | `useNav()` composable — wraps store actions (`pickWorkspace`, `pickSection`, `pickSub`, `clearSub`, `jumpToTeam`) so they also `router.push` the matching `/workspace/:id/:section?/:sub?` URL. Exports `buildPath(...)` for tests. |
| `nav.js` | Preview-path sibling for `nav.ts`. |
| `persistence.ts` | `tauriPersistence({ storeId, keys, debounceMs })` Pinia plugin. Hydrates from `ui_state_read` on activation; debounce-writes whitelisted keys via `ui_state_write`. **No-ops outside Tauri** so Vitest / browser preview stay silent. Exports `LIFEOS_PERSIST_KEYS` (whitelist). |
| `persistence.js` | Preview-path sibling for `persistence.ts`. |
| `icons.ts` | Static kebab-name → Lucide component map. Tree-shaking-safe — only icons actually used in templates + `data.js` are imported. Unknown names fall back to `../components/Icon.vue`'s placeholder. |

## For AI Agents

### Working In This Directory
- **All `.ts` files except `icons.ts` have `.js` siblings.** Keep `resolve`, `nav`, `persistence` siblings API-identical. The `store-sync` spec doesn't cover lib helpers, but breaking the preview path is a silent regression — verify the preview HTML still loads.
- Adding a new icon: import the named PascalCase symbol from `lucide-vue-next` at the top of `icons.ts`, then add the `"kebab-name": Symbol` entry to the `icons` map. Templates use `<Icon name="kebab-name" />`.
- The persistence whitelist (`LIFEOS_PERSIST_KEYS`) excludes `aiMessages` (would replay stale chat), `activeSub` / `pendingExpand` (URL-driven), `cmdkOpen` / `cmdkSeed` / `extraItems` / `extraSections` (ephemeral). Never add them. Document the reason in the comment block above the array when extending.
- `tauriInvoke()` here must match the same detection (`window.__TAURI__?.core?.invoke`) used in `../stores/lifeos.ts` — if you change one, change both.

### Testing Requirements
- `../../tests/resolve.spec.js` — resolver coverage.
- `../../tests/nav.spec.js` — `useNav()` URL push behaviour (mounts a real router).
- `../../tests/persistence.spec.js` — hydration + debounced write contract.

### Common Patterns
- All helpers return `null` (not throw) when `window.LIFEOS_DATA` is absent — the preview/Vitest paths sometimes mount before data lands.
- The persistence plugin uses `$subscribe(..., { detached: true })` so subscriber lifecycle isn't tied to a component.

## Dependencies

### Internal
- `@/stores/lifeos` — `useNav()` imports `useLifeos()` for state mutation.

### External
- `vue-router@^4` — `useRouter` inside `nav.ts`.
- `lucide-vue-next@^0.475.0` — icon source for `icons.ts`.
- `pinia@^2` — `PiniaPluginContext` type only.

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
