// LifeOS — vue-router (headless)
// URL maps to the Pinia store on navigation. Since the phase-3 Svelte cutover
// the router runs without a Vue app: nothing renders a <RouterView> (the old
// Vue app never did either — createApp(App) rendered the shell directly), so
// route records carry an inert component and the router is purely the
// URL ⇄ store bridge (beforeEach below, plus createNav() pushes from Svelte).

import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import { useLifeos } from "@/stores/lifeos-native";
import { resolveWorkspace } from "@/lib/resolve";

// Never rendered (no RouterView anywhere) — satisfies the route-record shape only.
const ShellRoute = {};

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/workspace/ai" },
  { path: "/workspace/:id/:section?/:sub?", component: ShellRoute, name: "workspace" },
  { path: "/settings/:section?/:sub?",      component: ShellRoute, name: "settings" },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// Sync URL → store on every navigation
router.beforeEach((to) => {
  const lifeos = useLifeos();
  const id = to.name === "settings" ? "settings" : (to.params.id as string);
  const sec = to.params.section as string | undefined;
  const sectionTitle = sec ? decodeURIComponent(sec) : undefined;
  const sub = to.params.sub as string | undefined;
  let item;
  if (sub) {
    // Find the item in the current section to populate activeSub
    const ws = resolveWorkspace(id);
    const section = ws?.sections?.find((s: any) => s.title === sectionTitle || (!sectionTitle && s.title === lifeos.currentSection));
    item = section?.items?.find((i: any) => i.label === decodeURIComponent(sub));
  }
  lifeos.syncRoute(id, sectionTitle, item);
  return true;
});
