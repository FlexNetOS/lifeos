// LifeOS — Pinia store (JS sibling for browser preview)

import { defineStore } from "pinia";
import { resolveWorkspace } from "@/lib/resolve.js";

// Mirrors `AiProvider::ALL` in crates/lifeos-core/src/types.rs (was previously the
// SUPPORTED_PROVIDERS array in src-tauri/src/lib.rs before Stage 1b lifted types
// into lifeos-core) and AI_PROVIDERS in lifeos.ts.
const AI_PROVIDERS = ["claude", "openai", "gemini"];
const AI_ERROR_MSG =
  "LifeOS couldn't reach the AI provider right now — try again.";

// Detect the Tauri host the same way LightsView does. Returns null in plain Vite/Vitest.
function tauriInvoke() {
  const t = typeof window !== "undefined" ? window.__TAURI__ : null;
  return t?.core?.invoke || null;
}

export const useLifeos = defineStore("lifeos", {
  state: () => ({
    activeId: "ai",
    wsCollapsed: false,
    pendingExpand: null,
    sectionByWs: {},
    activeSub: null,
    teamOrder: null,
    // Drag-and-drop reorder overlays, keyed by workspace id.
    // sectionOrder[wsId] = [sectionTitle, ...]   (overrides ws.sections order if present)
    // itemOrder[wsId][sectionTitle] = [itemLabel, ...]  (overrides items order in that section)
    sectionOrder: {},
    itemOrder: {},
    // User-added items / sections (per workspace)
    extraItems:    {},  // { wsId: { sectionTitle: [item, ...] } }
    extraSections: {},  // { wsId: [section, ...] }
    // AI avatar + chat panel — declared up-front so $state shape matches lifeos.ts.
    aiAvatarHidden: false,
    aiChatOpen:     false,
    avatarPos:      { x: null, y: null },
    aiMessages:     [{ role: "ai", text: "Hey, Alex. I'm here. What do you need?" }],
    aiProvider:     "claude",
    telemetryEnabled:   true,
    telemetryRefreshMs: 2000,
    // Command palette (Phase 4 #2)
    cmdkOpen:       false,
    cmdkSeed:       "",
    // Notifications drawer
    notificationsDrawerOpen:    false,
    dismissedNotificationIds:   [],
    readNotificationIds:        [],
  }),
  getters: {
    workspace(s) { return resolveWorkspace(s.activeId); },
    currentSection(state) {
      const ws = resolveWorkspace(state.activeId);
      return state.sectionByWs[state.activeId] || ws?.sections?.[0]?.title;
    },
    teams(s) {
      const dash = window.LIFEOS_DATA?.dashboardCanvas?.teams || [];
      if (!s.teamOrder) return dash;
      const byId = {};
      dash.forEach(t => (byId[t.id] = t));
      const ordered = s.teamOrder.map(id => byId[id]).filter(Boolean);
      const extras = dash.filter(t => !s.teamOrder.includes(t.id));
      return [...ordered, ...extras];
    },
    availableAiProviders() { return [...AI_PROVIDERS]; },
    unreadNotificationCount(state) {
      const all = window.LIFEOS_DATA?.notifications || [];
      return all.filter(
        (n) =>
          n.unread &&
          !state.dismissedNotificationIds.includes(n.id) &&
          !state.readNotificationIds.includes(n.id),
      ).length;
    },
  },
  actions: {
    pickWorkspace(id) { this.activeId = id; this.wsCollapsed = false; this.activeSub = null; },
    pickSection(title) { this.sectionByWs[this.activeId] = title; this.activeSub = null; },
    pickSub(item, sectionTitle) { this.activeSub = { workspaceId: this.activeId, sectionTitle, item }; },
    clearSub() { this.activeSub = null; },
    toggleWs() { this.wsCollapsed = !this.wsCollapsed; },
    jumpToTeam(teamItem, teamIndex) {
      this.activeId = "ai";
      this.wsCollapsed = false;
      this.sectionByWs.ai = "Agent Teams";
      this.activeSub = { workspaceId: "ai", sectionTitle: "Agent Teams", item: teamItem };
      this.pendingExpand = `Agent Teams-${teamIndex}`;
    },
    setTeamOrder(ids) { this.teamOrder = ids; },
    consumeExpand() { this.pendingExpand = null; },

    // ----- drag/drop reorder + creation -----
    setSectionOrder(wsId, titles) {
      this.sectionOrder = { ...this.sectionOrder, [wsId]: titles };
    },
    setItemOrder(wsId, sectionTitle, labels) {
      const ws = this.itemOrder[wsId] || {};
      this.itemOrder = { ...this.itemOrder, [wsId]: { ...ws, [sectionTitle]: labels } };
    },
    addSection(wsId, title) {
      const list = (this.extraSections[wsId] || []).slice();
      list.push({ title, items: [], custom: true });
      this.extraSections = { ...this.extraSections, [wsId]: list };
    },
    addItem(wsId, sectionTitle, item) {
      const sec = (this.extraItems[wsId] || {})[sectionTitle] || [];
      const next = sec.concat([{ ...item, custom: true }]);
      const ws = { ...(this.extraItems[wsId] || {}), [sectionTitle]: next };
      this.extraItems = { ...this.extraItems, [wsId]: ws };
    },

    // AI avatar + chat
    toggleAiAvatarHidden() { this.aiAvatarHidden = !this.aiAvatarHidden; this.aiChatOpen = false; },
    toggleAiChat() { if (!this.aiAvatarHidden) this.aiChatOpen = !this.aiChatOpen; },
    closeAiChat() { this.aiChatOpen = false; },
    setAvatarPos(x, y) { this.avatarPos = { x, y }; },

    // Shared chat — used by AIChat (avatar) + OpenPencilEditor (ai-chat pane).
    sendAiMessage(text, opts = {}) {
      const t = String(text || "").trim();
      if (!t) return;
      const source = opts.source || "chat";
      this.aiMessages.push({ role: "user", text: t, source });
      const invoke = tauriInvoke();
      if (invoke) {
        // Tauri host — dispatch to the real provider behind `ai_complete`.
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
      // Plain Vite dev / Vitest — preserve the canned-reply contract tests rely on.
      const reply = t.toLowerCase().startsWith("/")
        ? `Got it — running ${t.slice(1)} on your behalf.`
        : source === "open-pencil"
          ? "On it. I'll refactor and run `bun run check` before flagging the PR back."
          : "On it. I'll surface anything that needs your input.";
      setTimeout(() => {
        this.aiMessages.push({ role: "ai", text: reply, source });
      }, 320);
    },
    setAiProvider(name) {
      if (!AI_PROVIDERS.includes(name)) return;
      this.aiProvider = name;
      const invoke = tauriInvoke();
      if (invoke) {
        invoke("ai_provider_set", { provider: name }).catch(() => {
          /* UI already reflects the choice; persistence failure is silent. */
        });
      }
    },
    setTelemetryEnabled(b) {
      this.telemetryEnabled = !!b;
    },
    setTelemetryRefreshMs(n) {
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
    openCmdk(seed = "") {
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
    markNotificationRead(id) {
      if (!this.readNotificationIds.includes(id)) {
        this.readNotificationIds = [...this.readNotificationIds, id];
      }
    },
    markAllNotificationsRead() {
      const all = window.LIFEOS_DATA?.notifications || [];
      const ids = all.map((n) => n.id);
      this.readNotificationIds = [
        ...new Set([...this.readNotificationIds, ...ids]),
      ];
    },
    dismissNotification(id) {
      if (!this.dismissedNotificationIds.includes(id)) {
        this.dismissedNotificationIds = [...this.dismissedNotificationIds, id];
      }
    },
    clearDismissedNotifications() {
      this.dismissedNotificationIds = [];
    },
  },
});
