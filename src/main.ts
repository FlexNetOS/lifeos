import { mount } from "svelte";
import { createPinia, setActivePinia } from "pinia";
import { router } from "@/router";
import App from "@/App.svelte";
import { tauriPersistence, LIFEOS_PERSIST_KEYS } from "@/lib/persistence";

// Load data.js (sets window.LIFEOS_DATA / AGGREGATORS / FLOWS).
// In production, port this to a typed module under src/data/.
import "../data.js";
// Keep runtime CSS imports explicit and ordered. Nested CSS @imports trigger
// PostCSS ordering warnings after Vite has expanded the first stylesheet.
import "../colors_and_type.css";
import "../lifeos_app.css";
import "../styles.css";

const pinia = createPinia();
// Register persistence BEFORE activating the pinia so the plugin attaches
// before any store is created. No-op in plain browser / Vitest where Tauri
// invoke is absent.
pinia.use(tauriPersistence({ storeId: "lifeos", keys: LIFEOS_PERSIST_KEYS }));
// No Vue app.use(pinia) anymore — the globally active pinia is how useLifeos()
// et al. resolve from the Svelte tree (and from the router guard).
setActivePinia(pinia);

// Headless router boot: with no Vue app to install into, perform the initial
// navigation ourselves (what install() used to trigger) — this runs the
// URL → store guard for the launch URL, marks the router ready, and attaches
// the popstate listeners for back/forward.
router.push(router.options.history.location).catch(() => {
  /* initial redirect / duplicate navigation — safe to ignore */
});

mount(App, { target: document.getElementById("app")! });

// Bridge to Tauri navigation events (Settings menu → /settings)
declare global { interface Window { __TAURI__?: any; } }
if (window.__TAURI__) {
  window.__TAURI__.event.listen("lifeos:navigate", (e: any) => {
    router.push(e.payload);
  });
}
