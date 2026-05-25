<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# components

## Purpose
22 Vue 3 SFCs — the LifeOS shell, every workspace view pane, overlay layers, and primitives. `App.vue` orchestrates which view pane mounts via `v-else-if` on `lifeos.activeId` and `lifeos.activeSub.item?.view`. Add the same `view` discriminator to `data.js` (and `../data/types.ts`) when adding a new view pane.

## Key Files

### Shell (always mounted by `App.vue`)
| File | Description |
|------|-------------|
| `Sidebar.vue` | Primary rail — brand toggle, workspace switcher, persistent footer icons (Settings · Favorites · Notifications · Calendar · To-Do · Knowledge · Contacts). |
| `Workspace.vue` | Secondary panel — section selector + draggable menu rows for the active workspace. |
| `Dashboard.vue` | Default canvas — greeting, stat strip, agent team cards. Renders when `!lifeos.activeSub`. |

### View panes (rendered in `<main>` based on `activeId` / `activeSub.item.view`)
| File | Discriminator | Description |
|------|---------------|-------------|
| `SubsectionView.vue` | *(default fallback)* | Detail view for any sub without a specialised pane. |
| `N8nFlowView.vue` | `view: "n8n-flow"` | SVG visualisation of agent-team workflows (consumes `LIFEOS_FLOWS[flowId]`). |
| `OpenPencilEditor.vue` | `view: "open-pencil"` | AI-mediated SFC editor surface. **Mounting gate** in `App.vue` must remain `v-else-if="lifeos.activeSub.item?.view === 'open-pencil'"`. |
| `LightsView.vue` | `view: "lights"` | Home → Lights subsection. Persists scene/room state via `lights_state_read`/`lights_state_write`. |
| `CalendarView.vue` | `view: "calendar"` | Aggregator-backed Calendar view. |
| `FilesView.vue` | `view: "files"` | Files browser (Work / Personal). |
| `HealthView.vue` | `view: "health"` | Health metrics + sleep / activity / heart charts. |
| `IoTView.vue` | `view: "iot"` | IoT rooms, devices, signal panel. |
| `ContactsView.vue` | `activeId === "contacts"` *or* `view: "contacts"` | Aggregated contacts view. |
| `SettingsView.vue` | `activeId === "settings"` | Settings & Profile pane — provider dropdown, telemetry refresh, About card. |

### Overlays (always mounted; visibility driven by store flags)
| File | Description |
|------|-------------|
| `AIAvatar.vue` | Draggable AI avatar; click toggles `aiChatOpen`. Position persists via `avatarPos`. |
| `AIChat.vue` | Chat panel rendered alongside the avatar; calls `lifeos.sendAiMessage(text, { source })`. |
| `CommandPalette.vue` | ⌘K palette — opens via `lifeos.openCmdk(seed)`. |
| `KeyboardHelp.vue` | Shortcut cheatsheet overlay. |
| `NotificationsDrawer.vue` | Right-side notifications drawer; reads `LIFEOS_DATA.notifications`, drives the read / dismissed sets in the store. |
| `ToastContainer.vue` | Renders the queue from `@/stores/toasts`. |

### Widget
| File | Description |
|------|-------------|
| `TelemetryWidget.vue` | Polls Tauri's `telemetry_read` (sysinfo) every `lifeos.telemetryRefreshMs` ms when `telemetryEnabled`. |

### Primitives
| File | Description |
|------|-------------|
| `Badge.vue` | Tone-tinted count pill (`info`/`warn`/`err`/`ok`). |
| `Icon.vue` | Lucide proxy — looks up the kebab name in `@/lib/icons` and falls back to a placeholder `<span>` for unknown names. |
| `MenuRow.vue` | Sidebar row primitive — icon, label, badge, status dot. |

## For AI Agents

### Working In This Directory
- **Always declare explicit `defineProps()` schemas.** Inferred props broke icon-click handling once already (see root `AUDIT.md`).
- Adding a new view pane requires three steps: (1) add the SFC here, (2) wire a new `v-else-if` branch in `../App.vue` keyed on `lifeos.activeSub.item?.view === '<id>'`, (3) extend `DataItem["view"]` in `../data/types.ts` so the discriminator is typed.
- Use `useNav()` from `@/lib/nav` instead of mutating store state + calling `useRouter()` directly — otherwise the URL drifts from Pinia.
- Tauri-only flows must check `window.__TAURI__?.core?.invoke` first; the canned-reply / no-op paths keep Vitest green.
- No emoji in templates. No unicode-as-icon. Lucide names (kebab) only via `Icon.vue` or `lucide-vue-next` directly.

### Testing Requirements
Every interactive component has a spec under `../../tests/<Name>.spec.js`. Adding a new component without its spec breaks the documented contract (root `AGENTS.md` §Code conventions).

### Common Patterns
- CSS lives in scoped `<style>` blocks — tokens from `../../colors_and_type.css` (`var(--bg-2)`, `var(--lifeos-cyan)`, …). No inline hex.
- Section headers are uppercase + tracked `+.08em`. Buttons are sentence case.
- Status dots only on live signals; pulses on unread badges only.
- One brand mark per screen; one brand glow per viewport.

## Dependencies

### Internal
- `@/stores/lifeos` — every shell + view pane reads/writes the Pinia store.
- `@/stores/toasts` — `ToastContainer.vue` consumes the toast queue.
- `@/lib/nav` — `useNav()` for routed navigation.
- `@/lib/resolve` — `resolveWorkspace`, `flow` data accessors.
- `@/lib/icons` — kebab → Lucide map used by `Icon.vue`.

### External
- `lucide-vue-next@^0.475.0` (Vitest aliases this to `../../tests/__mocks__/lucide-vue-next.js`).
- `vue-router@^4` (`useRouter` in nav-aware components).

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
