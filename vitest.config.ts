import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// Vitest config — separated from vite.config.ts so dev server stays clean.

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
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.spec.{js,ts}"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.{vue,js,ts}"],
      exclude: ["src/main.ts"],
    },
  },
});
