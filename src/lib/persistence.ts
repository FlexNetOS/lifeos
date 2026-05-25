// LifeOS — Pinia persistence plugin (Tauri-only, no-op in browser/Vitest).
// Surface MUST match src/lib/persistence.js — store-sync parity is enforced.
//
// Reads `<app_data_dir>/ui-state.json` on store activation and merges only the
// whitelisted keys into `$patch`. Subscribes to `$state` changes and debounce-
// writes the same whitelisted slice back via `ui_state_write`. Outside Tauri
// (plain Vite dev / Vitest, where `window.__TAURI__?.core?.invoke` is missing)
// the plugin no-ops — no read, no subscribe, no console noise — so the existing
// 93-test suite stays green.

import type { PiniaPluginContext } from "pinia";

export interface TauriPersistenceOptions {
  storeId: string;
  keys: string[];
  debounceMs?: number;
}

// Same Tauri 2.x detection pattern stores/lifeos.ts uses. Returns null in plain
// browser / Vitest so the plugin can short-circuit at activation.
function tauriInvoke():
  | ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>)
  | null {
  const t = typeof window !== "undefined" ? (window as any).__TAURI__ : null;
  return t?.core?.invoke || null;
}

function pickKeys(state: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in state) out[k] = state[k];
  }
  return out;
}

export function tauriPersistence(opts: TauriPersistenceOptions) {
  const { storeId, keys, debounceMs = 300 } = opts;

  return (ctx: PiniaPluginContext): void => {
    // Pinia invokes plugins for every store on the instance — only handle ours.
    if (ctx.store.$id !== storeId) return;

    const invoke = tauriInvoke();
    // No Tauri host → silent no-op. Don't read, don't subscribe, don't log.
    if (!invoke) return;

    // Closure flag prevents the hydration `$patch` from triggering an immediate
    // write of the same data we just read.
    let hydrating = true;
    let writeTimer: ReturnType<typeof setTimeout> | null = null;

    // Hydrate first — merge whitelisted keys from disk into the live store.
    invoke("ui_state_read")
      .then((raw) => {
        const text = typeof raw === "string" ? raw : "";
        let parsed: Record<string, unknown> = {};
        try {
          parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
          parsed = {};
        }
        const patch = pickKeys(parsed, keys);
        if (Object.keys(patch).length > 0) {
          ctx.store.$patch(patch as any);
        }
      })
      .catch(() => {
        /* Persistence read failed — keep defaults, stay silent. */
      })
      .finally(() => {
        hydrating = false;
      });

    // Debounced write of just the whitelisted slice on every state change.
    // Default flush (post / async) — fires after the mutation microtask drains.
    ctx.store.$subscribe(
      (_mutation, state) => {
        if (hydrating) return;
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = setTimeout(() => {
          writeTimer = null;
          const slice = pickKeys(state as Record<string, unknown>, keys);
          const payload = JSON.stringify(slice);
          invoke("ui_state_write", { state: payload }).catch(() => {
            /* Persistence write failed — UI already reflects the change; stay silent. */
          });
        }, debounceMs);
      },
      { detached: true },
    );
  };
}

// Whitelist of LifeOS store keys that survive app restarts. Scalar/serializable
// only — transient (`aiMessages`), URL-driven (`activeSub`, `pendingExpand`), or
// ephemeral UI state (`cmdkOpen`, `cmdkSeed`, `extraItems`, `extraSections`) are
// intentionally excluded. Mirrors LIFEOS_PERSIST_KEYS in persistence.js.
export const LIFEOS_PERSIST_KEYS: string[] = [
  "activeId",
  "wsCollapsed",
  "sectionByWs",
  "aiAvatarHidden",
  "aiChatOpen",
  "avatarPos",
  "aiProvider",
  "telemetryEnabled",
  "telemetryRefreshMs",
  "teamOrder",
  "sectionOrder",
  "itemOrder",
  "notificationsDrawerOpen",
  "dismissedNotificationIds",
  "readNotificationIds",
];
