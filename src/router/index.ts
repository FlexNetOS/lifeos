// LifeOS — vue-router
// URL maps to the Pinia store on navigation.

import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import { useLifeos } from "@/stores/lifeos";
import { resolveWorkspace } from "@/lib/resolve";
import App from "@/App.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/workspace/ai" },
  { path: "/workspace/:id/:section?/:sub?", component: App, name: "workspace" },
  { path: "/settings/:section?/:sub?",      component: App, name: "settings" },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// Sync URL → store on every navigation
router.beforeEach((to) => {
  const lifeos = useLifeos();
  const id = to.name === "settings" ? "settings" : (to.params.id as string);
  if (id && id !== lifeos.activeId) lifeos.activeId = id;
  const sec = to.params.section as string | undefined;
  if (sec) lifeos.sectionByWs[id] = decodeURIComponent(sec);
  const sub = to.params.sub as string | undefined;
  if (sub) {
    // Find the item in the current section to populate activeSub
    const ws = resolveWorkspace(id);
    const section = ws?.sections?.find((s: any) => s.title === lifeos.sectionByWs[id]);
    const item = section?.items?.find((i: any) => i.label === decodeURIComponent(sub));
    if (item) lifeos.activeSub = { workspaceId: id, sectionTitle: section!.title, item };
  } else {
    lifeos.activeSub = null;
  }
  return true;
});
