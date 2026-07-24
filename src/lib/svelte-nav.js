// LifeOS — navigation bridge for the Svelte shell port (Svelte counterpart of
// src/lib/nav.js's useNav(), scoped to what Sidebar.svelte/Workspace.svelte call).
//
// Why not reuse useNav() directly: it calls vue-router's useRouter(), which reads
// the router off Vue's component-injection context (inject(routerKey)). Outside a
// Vue component tree that's either undefined or throws, so useNav()'s own router
// push would silently no-op for a Svelte caller (see the guard in nav.js/nav.ts:
// "Router may be absent in unit tests that mount components without it").
// createNav() takes the SAME vue-router `Router` instance directly instead of
// fetching it via injection — the router object itself (push/currentRoute) is
// plain, framework-agnostic JS, so this is a genuine integration, not a stub.
// buildPath() is reused as-is from nav.js so the URL scheme never drifts.
import { buildPath } from "@/lib/nav.js";
import { useLifeos } from "@/stores/lifeos.js";

function pushIfChanged(router, path) {
  if (!router) return;
  if (router.currentRoute.value.path === path) return;
  router.push(path).catch(() => { /* duplicate / aborted nav — safe to ignore */ });
}

export function createNav(router) {
  const lifeos = useLifeos();

  return {
    pickWorkspace(id) {
      lifeos.pickWorkspace(id);
      pushIfChanged(router, buildPath(id));
    },
    pickSection(title) {
      lifeos.pickSection(title);
      pushIfChanged(router, buildPath(lifeos.activeId, title));
    },
    pickSub(item, sectionTitle) {
      lifeos.pickSub(item, sectionTitle);
      pushIfChanged(router, buildPath(lifeos.activeId, sectionTitle, item?.label));
    },
  };
}
