// LifeOS — Pinia store (typed)
// Surface MUST match src/stores/lifeos.js — a sync test in tests/store-sync.spec.js
// asserts state-key + action-name parity. The JS sibling exists for the in-browser
// SFC-loader preview path; this TS file is the canonical typed source.

import { defineStore } from "pinia";
import { resolveWorkspace } from "@/lib/resolve";

export interface ActiveSub {
  workspaceId: string;
  sectionTitle: string;
  item: any;
}

export interface AiMessage {
  role: "ai" | "user";
  text: string;
  source?: string;
}

export interface AvatarPos {
  x: number | null;
  y: number | null;
}

export interface LifeosState {
  activeId: string;
  wsCollapsed: boolean;
  pendingExpand: string | null;
  sectionByWs: Record<string, string>;
  activeSub: ActiveSub | null;
  teamOrder: string[] | null;
  sectionOrder: Record<string, string[]>;
  itemOrder: Record<string, Record<string, string[]>>;
  extraItems: Record<string, Record<string, any[]>>;
  extraSections: Record<string, any[]>;
  aiAvatarHidden: boolean;
  aiChatOpen: boolean;
  avatarPos: AvatarPos;
  aiMessages: AiMessage[];
  aiProvider: string;
  telemetryEnabled: boolean;
  telemetryRefreshMs: number;
  cmdkOpen: boolean;
  cmdkSeed: string;
  notificationsDrawerOpen: boolean;
  dismissedNotificationIds: string[];
  readNotificationIds: string[];
}

// Mirrors `AiProvider::ALL` in crates/lifeos-core/src/types.rs (was previously the
// SUPPORTED_PROVIDERS array in src-tauri/src/lib.rs before Stage 1b lifted types
// into lifeos-core). Drives the settings UI dropdown and the `availableAiProviders`
// getter — single source on the JS side.
const AI_PROVIDERS = ["claude", "openai", "gemini"] as const;
const AI_ERROR_MSG =
  "LifeOS couldn't reach the AI provider right now — try again.";

// Same detection pattern LightsView uses for `tauriInvoke`. Returns null in plain
// Vite dev / Vitest so the canned-reply path stays the default.
function tauriInvoke():
  | ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>)
  | null {
  const t = typeof window !== "undefined" ? (window as any).__TAURI__ : null;
  return t?.core?.invoke || null;
}

export const useLifeos = defineStore("lifeos", {
  state: (): LifeosState => ({
    activeId: "ai",
    wsCollapsed: false,
    pendingExpand: null,
    sectionByWs: {},
    activeSub: null,
    teamOrder: null,
    sectionOrder: {},
    itemOrder: {},
    extraItems: {},
    extraSections: {},
    aiAvatarHidden: false,
    aiChatOpen: false,
    avatarPos: { x: null, y: null },
    aiMessages: [{ role: "ai", text: "Hey, Alex. I'm here. What do you need?" }],
    aiProvider: "claude",
    telemetryEnabled: true,
    telemetryRefreshMs: 2000,
    cmdkOpen: false,
    cmdkSeed: "",
    notificationsDrawerOpen: false,
    dismissedNotificationIds: [] as string[],
    readNotificationIds: [] as string[],
  }),
  getters: {
    workspace: (s) => resolveWorkspace(s.activeId),
    currentSection(state): string | undefined {
      const ws = resolveWorkspace(state.activeId);
      return state.sectionByWs[state.activeId] || ws?.sections?.[0]?.title;
    },
    teams: (s) => {
      const dash = (window as any).LIFEOS_DATA?.dashboardCanvas?.teams || [];
      if (!s.teamOrder) return dash;
      const byId: Record<string, any> = {};
      dash.forEach((t: any) => (byId[t.id] = t));
      const ordered = s.teamOrder.map((id) => byId[id]).filter(Boolean);
      const extras = dash.filter((t: any) => !s.teamOrder!.includes(t.id));
      return [...ordered, ...extras];
    },
    availableAiProviders: () => [...AI_PROVIDERS],
    unreadNotificationCount(state): number {
      const all: any[] = (window as any).LIFEOS_DATA?.notifications || [];
      return all.filter(
        (n) =>
          n.unread &&
          !state.dismissedNotificationIds.includes(n.id) &&
          !state.readNotificationIds.includes(n.id),
      ).length;
    },
  },
  actions: {
    pickWorkspace(id: string) {
      this.activeId = id;
      this.wsCollapsed = false;
      this.activeSub = null;
    },
    pickSection(title: string) {
      this.sectionByWs[this.activeId] = title;
      this.activeSub = null;
    },
    pickSub(item: any, sectionTitle: string) {
      this.activeSub = { workspaceId: this.activeId, sectionTitle, item };
    },
    clearSub() {
      this.activeSub = null;
    },
    toggleWs() {
      this.wsCollapsed = !this.wsCollapsed;
    },
    jumpToTeam(teamItem: any, teamIndex: number) {
      this.activeId = "ai";
      this.wsCollapsed = false;
      this.sectionByWs.ai = "Agent Teams";
      this.activeSub = { workspaceId: "ai", sectionTitle: "Agent Teams", item: teamItem };
      this.pendingExpand = `Agent Teams-${teamIndex}`;
    },
    setTeamOrder(ids: string[]) {
      this.teamOrder = ids;
    },
    consumeExpand() {
      this.pendingExpand = null;
    },
    // ----- drag/drop reorder + creation -----
    setSectionOrder(wsId: string, titles: string[]) {
      this.sectionOrder = { ...this.sectionOrder, [wsId]: titles };
    },
    setItemOrder(wsId: string, sectionTitle: string, labels: string[]) {
      const ws = this.itemOrder[wsId] || {};
      this.itemOrder = { ...this.itemOrder, [wsId]: { ...ws, [sectionTitle]: labels } };
    },
    addSection(wsId: string, title: string) {
      const list = (this.extraSections[wsId] || []).slice();
      list.push({ title, items: [], custom: true });
      this.extraSections = { ...this.extraSections, [wsId]: list };
    },
    addItem(wsId: string, sectionTitle: string, item: any) {
      const sec = (this.extraItems[wsId] || {})[sectionTitle] || [];
      const next = sec.concat([{ ...item, custom: true }]);
      const ws = { ...(this.extraItems[wsId] || {}), [sectionTitle]: next };
      this.extraItems = { ...this.extraItems, [wsId]: ws };
    },
    // AI avatar + chat
    toggleAiAvatarHidden() {
      this.aiAvatarHidden = !this.aiAvatarHidden;
      this.aiChatOpen = false;
    },
    toggleAiChat() {
      if (!this.aiAvatarHidden) this.aiChatOpen = !this.aiChatOpen;
    },
    closeAiChat() {
      this.aiChatOpen = false;
    },
    setAvatarPos(x: number | null, y: number | null) {
      this.avatarPos = { x, y };
    },
    sendAiMessage(text: string, opts: { source?: string } = {}) {
      const t = String(text || "").trim();
      if (!t) return;
      const source = opts.source || "chat";
      this.aiMessages.push({ role: "user", text: t, source });
      const invoke = tauriInvoke();
      if (invoke) {
        // Tauri path — dispatch to the real provider behind `ai_complete`.
        invoke("ai_complete", { prompt: t, source }).then(
          (reply) => {
            this.aiMessages.push({
              role: "ai",
              text: String(reply ?? "").trim() || AI_ERROR_MSG,
              source,
            });
          },
          () => {
            this.aiMessages.push({ role: "ai", text: AI_ERROR_MSG, source });
          },
        );
        return;
      }
      // Plain Vite dev / Vitest — preserve the canned-reply contract that tests rely on.
      const reply = t.toLowerCase().startsWith("/")
        ? `Got it — running ${t.slice(1)} on your behalf.`
        : source === "open-pencil"
          ? "On it. I'll refactor and run `bun run check` before flagging the PR back."
          : "On it. I'll surface anything that needs your input.";
      setTimeout(() => {
        this.aiMessages.push({ role: "ai", text: reply, source });
      }, 320);
    },
    setAiProvider(name: string) {
      if (!AI_PROVIDERS.includes(name as (typeof AI_PROVIDERS)[number])) return;
      this.aiProvider = name;
      const invoke = tauriInvoke();
      if (invoke) {
        invoke("ai_provider_set", { provider: name }).catch(() => {
          /* UI already reflects the choice; persistence failure is silent. */
        });
      }
    },
    setTelemetryEnabled(b: boolean) {
      this.telemetryEnabled = !!b;
    },
    setTelemetryRefreshMs(n: number) {
      const v = Number(n);
      if (!Number.isFinite(v) || v < 250) return;
      this.telemetryRefreshMs = v;
    },
    resetUiState() {
      // Reset transient + persisted UI slices back to defaults. Persistence plugin
      // catches the resulting mutations on its $subscribe path; outside Tauri the
      // disk write no-ops, so tests run safely without a host.
      this.activeId = "ai";
      this.wsCollapsed = false;
      this.pendingExpand = null;
      this.sectionByWs = {};
      this.activeSub = null;
      this.teamOrder = null;
      this.sectionOrder = {};
      this.itemOrder = {};
      this.extraItems = {};
      this.extraSections = {};
      this.aiAvatarHidden = false;
      this.aiChatOpen = false;
      this.avatarPos = { x: null, y: null };
      this.telemetryEnabled = true;
      this.telemetryRefreshMs = 2000;
      this.cmdkOpen = false;
      this.cmdkSeed = "";
      this.notificationsDrawerOpen = false;
      this.dismissedNotificationIds = [];
      this.readNotificationIds = [];
      const invoke = tauriInvoke();
      if (invoke) {
        invoke("ui_state_write", { state: "{}" }).catch(() => {
          /* Reset already applied in memory; persistence wipe failure is silent. */
        });
      }
    },
    clearAiMessages() {
      this.aiMessages = [{ role: "ai", text: "Hey, Alex. I'm here. What do you need?" }];
    },
    // Command palette (Phase 4 #2)
    openCmdk(seed: string = "") {
      this.cmdkSeed = seed;
      this.cmdkOpen = true;
    },
    closeCmdk() {
      this.cmdkOpen = false;
      this.cmdkSeed = "";
    },
    toggleCmdk() {
      if (this.cmdkOpen) this.closeCmdk();
      else this.openCmdk("");
    },
    // Notifications drawer
    openNotificationsDrawer() {
      this.notificationsDrawerOpen = true;
    },
    closeNotificationsDrawer() {
      this.notificationsDrawerOpen = false;
    },
    toggleNotificationsDrawer() {
      this.notificationsDrawerOpen = !this.notificationsDrawerOpen;
    },
    markNotificationRead(id: string) {
      if (!this.readNotificationIds.includes(id)) {
        this.readNotificationIds = [...this.readNotificationIds, id];
      }
    },
    markAllNotificationsRead() {
      const all: any[] = (window as any).LIFEOS_DATA?.notifications || [];
      const ids = all.map((n) => n.id);
      this.readNotificationIds = [
        ...new Set([...this.readNotificationIds, ...ids]),
      ];
    },
    dismissNotification(id: string) {
      if (!this.dismissedNotificationIds.includes(id)) {
        this.dismissedNotificationIds = [...this.dismissedNotificationIds, id];
      }
    },
    clearDismissedNotifications() {
      this.dismissedNotificationIds = [];
    },
  },
});
