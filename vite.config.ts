import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath, URL } from "node:url";

// LifeOS Vue + Tauri kit
// Tauri uses fixed dev port; HMR is wired via Tauri Vite plugin in production.
//
// Dual-plugin: Vue stays the mounted production app throughout the Svelte
// migration (see App.svelte's header comment); the Svelte plugin here just
// lets .svelte files build/HMR side by side with .vue while the port is
// proven out component by component. Each plugin only claims its own file
// extension, so they don't conflict.

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [vue(), svelte()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Split vendor code into dedicated chunks. Lucide is ~600 KB on its own;
        // putting it in a separate chunk means the main app chunk stays small AND
        // browsers cache the vendor chunks across releases that don't bump them.
        // Rolldown's `codeSplitting` groups vendor packages by name/test while
        // preserving Vite 8's current output contract.
        codeSplitting: {
          groups: [
            { name: "lucide", test: /[\\/]node_modules[\\/](?:@lucide[\\/]vue|lucide-svelte)[\\/]/, priority: 40 },
            { name: "vue-router", test: /[\\/]node_modules[\\/]vue-router[\\/]/, priority: 30 },
            { name: "pinia", test: /[\\/]node_modules[\\/]pinia[\\/]/, priority: 20 },
            { name: "vue", test: /[\\/]node_modules[\\/](?:@vue[\\/]|vue[\\/])/, priority: 10 },
            { name: "svelte", test: /[\\/]node_modules[\\/]svelte[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
}));
