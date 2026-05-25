// LifeOS — navigation composable (JS sibling for in-browser SFC-loader preview)
// Mirrors src/lib/nav.ts exactly. Sync test in tests/nav.spec.js covers parity.

import { useRouter } from "vue-router";
import { useLifeos } from "@/stores/lifeos.js";

export function buildPath(workspaceId, sectionTitle, subLabel) {
  const base = workspaceId === "settings" ? "/settings" : `/workspace/${encodeURIComponent(workspaceId)}`;
  const parts = [base];
  if (sectionTitle) parts.push(encodeURIComponent(sectionTitle));
  if (subLabel) parts.push(encodeURIComponent(subLabel));
  return parts.join("/");
}

function pushIfChanged(router, path) {
  if (!router) return;
  if (router.currentRoute.value.path === path) return;
  router.push(path).catch(() => { /* duplicate / aborted nav — safe to ignore */ });
}

export function useNav() {
  const lifeos = useLifeos();
  const router = useRouter();

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
    clearSub() {
      const sec = lifeos.sectionByWs[lifeos.activeId];
      lifeos.clearSub();
      pushIfChanged(router, buildPath(lifeos.activeId, sec));
    },
    jumpToTeam(item, teamIndex) {
      lifeos.jumpToTeam(item, teamIndex);
      pushIfChanged(router, buildPath("ai", "Agent Teams", item?.label));
    },
  };
}
