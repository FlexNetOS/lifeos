import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
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
