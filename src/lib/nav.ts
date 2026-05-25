// LifeOS — navigation composable
// Wraps store actions that change the active workspace/section/sub so they also
// push to vue-router. Without this, in-app clicks change Pinia state but leave
// the URL stale (browser back/forward + bookmarks break).
//
// Callers: Sidebar (rail clicks), Workspace (section selector + MenuRow), Dashboard
// (agent-team cards), OpenPencilEditor (file/folder picks). All four should use
// useNav() instead of useLifeos() + useRouter() directly.

import type { Router } from "vue-router";
import { useRouter } from "vue-router";
import { useLifeos } from "@/stores/lifeos";

export function buildPath(workspaceId: string, sectionTitle?: string | null, subLabel?: string | null): string {
  const base = workspaceId === "settings" ? "/settings" : `/workspace/${encodeURIComponent(workspaceId)}`;
  const parts: string[] = [base];
  if (sectionTitle) parts.push(encodeURIComponent(sectionTitle));
  if (subLabel) parts.push(encodeURIComponent(subLabel));
  return parts.join("/");
}

function pushIfChanged(router: Router | undefined, path: string): void {
  if (!router) return;
  if (router.currentRoute.value.path === path) return;
  // Guard against the in-flight navigation case (rapid clicks)
  router.push(path).catch(() => { /* duplicate / aborted nav — safe to ignore */ });
}

export function useNav() {
  const lifeos = useLifeos();
  // Router may be absent in unit tests that mount components without it.
  // useRouter() returns undefined outside a router-injected setup context.
  const router = useRouter();

  return {
    pickWorkspace(id: string) {
      lifeos.pickWorkspace(id);
      pushIfChanged(router, buildPath(id));
    },
    pickSection(title: string) {
      lifeos.pickSection(title);
      pushIfChanged(router, buildPath(lifeos.activeId, title));
    },
    pickSub(item: any, sectionTitle: string) {
      lifeos.pickSub(item, sectionTitle);
      pushIfChanged(router, buildPath(lifeos.activeId, sectionTitle, item?.label));
    },
    clearSub() {
      const sec = lifeos.sectionByWs[lifeos.activeId];
      lifeos.clearSub();
      pushIfChanged(router, buildPath(lifeos.activeId, sec));
    },
    jumpToTeam(item: any, teamIndex: number) {
      lifeos.jumpToTeam(item, teamIndex);
      pushIfChanged(router, buildPath("ai", "Agent Teams", item?.label));
    },
  };
}
