import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath, URL } from "node:url";

// Separate Vitest config for the a11y regression suite.
// Run with: bun run test:a11y
// Requires: bun add -D 'vitest-axe@0.1.0' 'axe-core'
//
// Kept separate from vitest.config.ts so a single a11y violation
// does not drown the unit-test signal during normal development.

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "lucide-svelte": fileURLToPath(new URL("./tests/__mocks__/lucide-svelte.js", import.meta.url)),
    },
    // Same rationale as vitest.config.ts: Vitest loads specs through Vite's
    // SSR module loader, so Svelte's compiled output needs the browser
    // condition to mount into happy-dom correctly.
    conditions: ["browser"],
  },
  test: {
    environment: "happy-dom",
    globals: true,
    // Data fixture first, then axe matcher extension.
    setupFiles: ["./tests/setup.js", "./tests/setup.ts"],
    include: ["tests/a11y/**/*.spec.{ts,js}"],
    reporters: ["verbose"],
  },
});
