import { createApp } from "vue";
import { createPinia } from "pinia";
import { router } from "@/router";
import App from "@/App.vue";
import { tauriPersistence, LIFEOS_PERSIST_KEYS } from "@/lib/persistence";

// Load data.js (sets window.LIFEOS_DATA / AGGREGATORS / FLOWS).
// In production, port this to a typed module under src/data/.
import "../data.js";
import "../styles.css";

const pinia = createPinia();
// Register persistence BEFORE app.use(pinia) so the plugin attaches before any
// store is activated. No-op in plain browser / Vitest where Tauri invoke is absent.
pinia.use(tauriPersistence({ storeId: "lifeos", keys: LIFEOS_PERSIST_KEYS }));

const app = createApp(App);
app.use(pinia);
app.use(router);
app.mount("#app");

// Bridge to Tauri navigation events (Settings menu → /settings)
declare global { interface Window { __TAURI__?: any; } }
if (window.__TAURI__) {
  window.__TAURI__.event.listen("lifeos:navigate", (e: any) => {
    router.push(e.payload);
  });
}
