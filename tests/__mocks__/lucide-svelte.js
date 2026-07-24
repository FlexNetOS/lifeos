// Mock lucide-svelte so SFCs that import named icons (PascalCase) don't fail in happy-dom.
// Returns a generic <svg /> stub component for any name accessed off the proxy.
// Svelte counterpart of lucide-vue.js — see that file's header comment for the
// overall pattern (aliased in ../../vitest.config.ts).

import LucideIconStub from "./LucideIconStub.svelte";

export default new Proxy({}, {
  get(_, key) {
    if (key === "__esModule" || key === "default" || typeof key !== "string") return undefined;
    return LucideIconStub;
  },
});
