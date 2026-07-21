// LifeOS — Pinia persistence plugin (JS sibling for browser preview).
// Surface MUST match src/lib/persistence.ts — store-sync parity is enforced.
//
// Reads the canonical PostgreSQL `ui-state` projection on store activation and
// merges only the whitelisted keys into `$patch`. Subscribes to `$state` changes
// and debounce-writes the same whitelisted slice via `ui_state_write`. Outside Tauri
// (plain Vite dev / Vitest, where `window.__TAURI__?.core?.invoke` is missing)
// the plugin no-ops — no read, no subscribe, no console noise — so the existing
// 93-test suite stays green.

// Same Tauri 2.x detection pattern stores/lifeos.js uses. Returns null in plain
// browser / Vitest so the plugin can short-circuit at activation.
function tauriInvoke() {
  const t = typeof window !== "undefined" ? window.__TAURI__ : null;
  return t?.core?.invoke || null;
}

function pickKeys(state, keys) {
  const out = {};
  for (const k of keys) {
    if (k in state) out[k] = state[k];
  }
  return out;
}

export function tauriPersistence(opts) {
  const { storeId, keys, debounceMs = 300 } = opts;

  return (ctx) => {
    // Pinia invokes plugins for every store on the instance — only handle ours.
    if (ctx.store.$id !== storeId) return;

    const invoke = tauriInvoke();
    // No Tauri host → silent no-op. Don't read, don't subscribe, don't log.
    if (!invoke) return;

    // Closure flag prevents the hydration `$patch` from triggering an immediate
    // write of the same data we just read.
    let hydrating = true;
    let writeTimer = null;

    // Hydrate first — merge whitelisted keys from PostgreSQL into the live store.
    invoke("ui_state_read")
      .then((raw) => {
        const text = typeof raw === "string" ? raw : "";
        let parsed = {};
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = {};
        }
        const patch = pickKeys(parsed, keys);
        if (Object.keys(patch).length > 0) {
          ctx.store.$patch(patch);
        }
      })
      .catch(() => {
        /* Persistence read failed — keep defaults, stay silent. */
      })
      .finally(() => {
        hydrating = false;
      });

    // Debounced write of just the whitelisted slice on every state change.
    // `flush: "sync"` so the subscriber fires inside the mutation tick — keeps
    // the debounce timer deterministic under Vitest fake timers.
    ctx.store.$subscribe(
      (_mutation, state) => {
        if (hydrating) return;
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = setTimeout(() => {
          writeTimer = null;
          const slice = pickKeys(state, keys);
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
// intentionally excluded. Mirrors LIFEOS_PERSIST_KEYS in persistence.ts.
export const LIFEOS_PERSIST_KEYS = [
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
