import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

// Vitest config — separated from vite.config.ts so dev server stays clean.

// The archbp-* planning-spine suite validates live FlexNetOS host state
// (postgres cluster, durable mounts, envelope sessions) by design. Off-host
// (e.g. GitHub-hosted runners) those paths cannot exist, so the suite is
// excluded there and runs on the self-hosted gha-runner instead
// (nix/gha-runner). The gate is the host state plane itself, not an env var.
const onFlexnetosHost = existsSync("/home/flexnetos/meta/var/lib/postgresql/17");
if (!onFlexnetosHost) {
  console.warn(
    "vitest: FlexNetOS host state plane absent — excluding tests/archbp-* (runs on the self-hosted runner)"
  );
}

export default defineConfig({
  plugins: [vue(), svelte()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@lucide/vue": fileURLToPath(new URL("./tests/__mocks__/lucide-vue.js", import.meta.url)),
      "lucide-svelte": fileURLToPath(new URL("./tests/__mocks__/lucide-svelte.js", import.meta.url)),
    },
    // Vitest runs test files through Vite's SSR module loader even though the
    // simulated DOM is happy-dom, so package.json "exports" resolution defaults
    // to non-browser conditions. Svelte's compiled output needs the browser/DOM
    // runtime (svelte/internal/client) to mount into happy-dom correctly — this
    // is the standard, documented Svelte+Vitest fix. Vue/Pinia/vue-router also
    // resolve fine under "browser" (verified by the full suite staying green).
    conditions: ["browser"],
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["tests/*.spec.{js,ts}"],
    exclude: onFlexnetosHost
      ? ["**/node_modules/**"]
      : ["**/node_modules/**", "tests/archbp-*.spec.{js,ts}"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.{vue,js,ts}"],
      exclude: ["src/main.ts"],
    },
  },
});
