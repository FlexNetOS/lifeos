import { mount } from "svelte";
import { router } from "@/router";
import App from "@/App.svelte";
import { createSurface } from "@/lib/surface.svelte.js";
import { useLifeos } from "@/stores/lifeos-native";

// Load data.js (sets window.LIFEOS_DATA / AGGREGATORS / FLOWS).
// In production, port this to a typed module under src/data/.
import "../data.js";
// Keep runtime CSS imports explicit and ordered. Nested CSS @imports trigger
// PostCSS ordering warnings after Vite has expanded the first stylesheet.
import "../colors_and_type.css";
import "../lifeos_app.css";
import "../styles.css";

// Stamp [data-surface] on <html> before mount so the density tokens in
// colors_and_type.css §9 are resolved on the very first paint (no reflow flash).
// Build-time target wins over width auto-detection: VITE_LIFEOS_SURFACE=tv-10ft.
export const surface = createSurface({ env: import.meta.env.VITE_LIFEOS_SURFACE });

// Hydrate the native projection before the first URL → store sync so persisted
// UI state cannot race the launch route. The shell mounts immediately and
// renders defaults until the projection resolves.
useLifeos().hydrate().then(() => {
  // Headless router boot: with no Vue app to install into, perform the initial
  // navigation ourselves (what install() used to trigger).
  return router.push(router.options.history.location);
}).catch(() => {
  /* initial redirect / projection failure — safe to ignore */
});

mount(App, { target: document.getElementById("app")! });

// Bridge to Tauri navigation events (Settings menu → /settings)
declare global { interface Window { __TAURI__?: any; } }
if (window.__TAURI__) {
  window.__TAURI__.event.listen("lifeos:navigate", (e: any) => {
    router.push(e.payload);
  });
}
