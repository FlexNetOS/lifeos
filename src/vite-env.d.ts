/// <reference types="vite/client" />

// LifeOS — Vite ambient types. Supplies `import.meta.env` to svelte-check/tsc and
// declares the app's own build-time variables so they are typed, not `any`.

interface ImportMetaEnv {
  /**
   * Build-time surface target. Outranks width auto-detection but is outranked by
   * an explicit pin or a `?surface=` query. See colors_and_type.css §9 and
   * src/lib/surface.svelte.js.
   */
  readonly VITE_LIFEOS_SURFACE?: "mobile" | "workstation" | "tv-10ft" | "ai-glasses";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
