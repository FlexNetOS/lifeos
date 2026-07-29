<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-24 | Updated: 2026-05-24 -->

# stores

## Purpose
Stores for LifeOS. The legacy Pinia `lifeos` and `toasts` siblings remain the browser-preview compatibility surface, with strict `.ts` ↔ `.js` parity enforced by a test. Native Svelte runtime surfaces use `lifeos-native.ts` and `toasts-native.ts` with subscribable contracts.

## Key Files
| File | Description |
|------|-------------|
| `lifeos.ts` | Canonical typed Pinia store. State, getters, actions for `activeId`, `sectionByWs`, `activeSub`, `teamOrder`, `sectionOrder`, `itemOrder`, `aiMessages`, `aiProvider`, telemetry, cmdk, notifications. `sendAiMessage()` is dual-mode: Tauri → `invoke("ai_complete", …)`; Vite/Vitest → canned-reply. `setAiProvider()` calls `invoke("ai_provider_set", …)` on the Tauri path. |
| `lifeos.js` | Sibling for the in-browser CDN preview path. Surface MUST match `lifeos.ts` (the `../../tests/store-sync.spec.js` spec asserts state-key + action-name parity). |
| `lifeos-native.ts` | Native Svelte Glass runtime store. Owns the live state machine, native subscription boundary, Tauri projection hydration, and debounced `ui-state` writes. |
| `toasts.ts` | Typed toast queue. Push / dismiss API consumed by `../components/ToastContainer.vue`. |
| `toasts.js` | Preview-path sibling for `toasts.ts`. |

## For AI Agents

### Working In This Directory
- **Sibling parity is non-negotiable.** When you add/rename a state field, action, or getter in `lifeos.ts`, mirror it in `lifeos.js` in the same patch. The `store-sync` spec compares `Object.keys` and will fail if they drift. Same rule for `toasts.{ts,js}`.
- Persistence whitelist (`LIFEOS_PERSIST_KEYS` in `../lib/persistence.{ts,js}`) is a separate file — extending the store with a new persisted key means updating that whitelist in both the `.ts` and `.js` sibling there.
- `tauriInvoke()` is the standard detection helper: returns `window.__TAURI__?.core?.invoke || null`. Use it for any new IPC call so the Vitest path stays no-op.
- The calm error string for an AI failure is the literal `"LifeOS couldn't reach the AI provider right now — try again."` — bind it to a constant, never inline duplicate.
- The supported provider list (`AI_PROVIDERS`) MUST match `SUPPORTED_PROVIDERS` in `../../src-tauri/src/lib.rs`. Adding a new provider here without updating Rust will silently bounce.

### Testing Requirements
- `../../tests/store.spec.js` covers basic state/action behaviour.
- `../../tests/store-sync.spec.js` enforces TS ↔ JS sibling parity. Run after any change.
- `../../tests/Toasts.spec.js` covers the toasts queue.

### Common Patterns
- All array/object mutations spread to new references (`this.x = { ...this.x, [k]: v }`) so the persistence plugin's `$subscribe` deep-equality fires.
- Notifications API is split across `markNotificationRead`, `markAllNotificationsRead`, `dismissNotification`, `clearDismissedNotifications`. Read state and dismissed state are independent.

## Dependencies

### Internal
- `@/lib/resolve` — `resolveWorkspace` used by the `workspace` and `currentSection` getters.
- `window.LIFEOS_DATA` (provided by `../../data.js` side-effect import) — feeds `teams`, `unreadNotificationCount`, and `markAllNotificationsRead`.

### External
- `pinia@^2.1.7`

<!-- MANUAL: Add notes below; this section is preserved on regeneration. -->
