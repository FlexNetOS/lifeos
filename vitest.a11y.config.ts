import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// Separate Vitest config for the a11y regression suite.
// Run with: bun run test:a11y
// Requires: bun add -D 'vitest-axe@0.1.0' 'axe-core'
//
// Kept separate from vitest.config.ts so a single a11y violation
// does not drown the unit-test signal during normal development.

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@lucide/vue": fileURLToPath(new URL("./tests/__mocks__/lucide-vue.js", import.meta.url)),
    },
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
