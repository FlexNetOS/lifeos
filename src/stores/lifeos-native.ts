// LifeOS — native Svelte runtime store.
//
// This is the Glass runtime boundary. The Pinia siblings remain available for
// the legacy browser-preview contract and its parity tests, while Svelte owns
// one plain subscribable state machine with the same public surface.

import { resolveWorkspace } from "@/lib/resolve";
import { LIFEOS_PERSIST_KEYS } from "@/lib/persistence";

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

export type LifeosSnapshot = LifeosState & {
  workspace: any;
  currentSection: string | undefined;
  teams: any[];
  availableAiProviders: string[];
  unreadNotificationCount: number;
};

type Subscriber = (snapshot: LifeosSnapshot) => void;
type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

const AI_PROVIDERS = ["claude", "openai", "gemini"] as const;
const AI_ERROR_MSG = "LifeOS couldn't reach the AI provider right now — try again.";

function tauriInvoke(): TauriInvoke | null {
  const t = typeof window !== "undefined" ? (window as any).__TAURI__ : null;
  return t?.core?.invoke || null;
}

function initialState(): LifeosState {
  return {
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
    dismissedNotificationIds: [],
    readNotificationIds: [],
  };
}

export class NativeLifeosStore {
  private state = initialState();
  private readonly subscribers = new Set<Subscriber>();
  private hydrating = true;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!tauriInvoke()) this.hydrating = false;
  }

  get activeId() { return this.state.activeId; }
  set activeId(value: string) { this.patch({ activeId: value }); }
  get wsCollapsed() { return this.state.wsCollapsed; }
  set wsCollapsed(value: boolean) { this.patch({ wsCollapsed: value }); }
  get pendingExpand() { return this.state.pendingExpand; }
  set pendingExpand(value: string | null) { this.patch({ pendingExpand: value }); }
  get sectionByWs() { return this.state.sectionByWs; }
  set sectionByWs(value: Record<string, string>) { this.patch({ sectionByWs: value }); }
  get activeSub() { return this.state.activeSub; }
  set activeSub(value: ActiveSub | null) { this.patch({ activeSub: value }); }
  get teamOrder() { return this.state.teamOrder; }
  set teamOrder(value: string[] | null) { this.patch({ teamOrder: value }); }
  get sectionOrder() { return this.state.sectionOrder; }
  set sectionOrder(value: Record<string, string[]>) { this.patch({ sectionOrder: value }); }
  get itemOrder() { return this.state.itemOrder; }
  set itemOrder(value: Record<string, Record<string, string[]>>) { this.patch({ itemOrder: value }); }
  get extraItems() { return this.state.extraItems; }
  set extraItems(value: Record<string, Record<string, any[]>>) { this.patch({ extraItems: value }); }
  get extraSections() { return this.state.extraSections; }
  set extraSections(value: Record<string, any[]>) { this.patch({ extraSections: value }); }
  get aiAvatarHidden() { return this.state.aiAvatarHidden; }
  set aiAvatarHidden(value: boolean) { this.patch({ aiAvatarHidden: value }); }
  get aiChatOpen() { return this.state.aiChatOpen; }
  set aiChatOpen(value: boolean) { this.patch({ aiChatOpen: value }); }
  get avatarPos() { return this.state.avatarPos; }
  set avatarPos(value: AvatarPos) { this.patch({ avatarPos: value }); }
  get aiMessages() { return this.state.aiMessages; }
  set aiMessages(value: AiMessage[]) { this.patch({ aiMessages: value }); }
  get aiProvider() { return this.state.aiProvider; }
  set aiProvider(value: string) { this.patch({ aiProvider: value }); }
  get telemetryEnabled() { return this.state.telemetryEnabled; }
  set telemetryEnabled(value: boolean) { this.patch({ telemetryEnabled: value }); }
  get telemetryRefreshMs() { return this.state.telemetryRefreshMs; }
  set telemetryRefreshMs(value: number) { this.patch({ telemetryRefreshMs: value }); }
  get cmdkOpen() { return this.state.cmdkOpen; }
  set cmdkOpen(value: boolean) { this.patch({ cmdkOpen: value }); }
  get cmdkSeed() { return this.state.cmdkSeed; }
  set cmdkSeed(value: string) { this.patch({ cmdkSeed: value }); }
  get notificationsDrawerOpen() { return this.state.notificationsDrawerOpen; }
  set notificationsDrawerOpen(value: boolean) { this.patch({ notificationsDrawerOpen: value }); }
  get dismissedNotificationIds() { return this.state.dismissedNotificationIds; }
  set dismissedNotificationIds(value: string[]) { this.patch({ dismissedNotificationIds: value }); }
  get readNotificationIds() { return this.state.readNotificationIds; }
  set readNotificationIds(value: string[]) { this.patch({ readNotificationIds: value }); }

  get workspace() { return resolveWorkspace(this.state.activeId); }

  get currentSection(): string | undefined {
    const ws = resolveWorkspace(this.state.activeId);
    return this.state.sectionByWs[this.state.activeId] || ws?.sections?.[0]?.title;
  }

  get teams(): any[] {
    const dash = (typeof window !== "undefined"
      ? (window as any).LIFEOS_DATA?.dashboardCanvas?.teams
      : null) || [];
    if (!this.state.teamOrder) return dash;
    const byId: Record<string, any> = {};
    dash.forEach((team: any) => (byId[team.id] = team));
    const ordered = this.state.teamOrder.map((id) => byId[id]).filter(Boolean);
    const extras = dash.filter((team: any) => !this.state.teamOrder!.includes(team.id));
    return [...ordered, ...extras];
  }

  get availableAiProviders(): string[] { return [...AI_PROVIDERS]; }

  get unreadNotificationCount(): number {
    const all: any[] = (typeof window !== "undefined" ? (window as any).LIFEOS_DATA?.notifications : null) || [];
    return all.filter(
      (notification) => notification.unread
        && !this.state.dismissedNotificationIds.includes(notification.id)
        && !this.state.readNotificationIds.includes(notification.id),
    ).length;
  }

  subscribe(run: Subscriber): () => void {
    run(this.snapshot());
    this.subscribers.add(run);
    return () => this.subscribers.delete(run);
  }

  async hydrate() {
    const invoke = tauriInvoke();
    if (!invoke) {
      this.hydrating = false;
      return;
    }
    try {
      const raw = await invoke("ui_state_read");
      const parsed = typeof raw === "string" && raw ? JSON.parse(raw) : {};
      const patch: Partial<LifeosState> = {};
      for (const key of LIFEOS_PERSIST_KEYS) {
        if (key in parsed) (patch as any)[key] = parsed[key];
      }
      if (Object.keys(patch).length) {
        this.patch(patch, false);
        this.emit();
      }
    } catch {
      // Keep defaults when the canonical projection is not available yet.
    } finally {
      this.hydrating = false;
    }
  }

  private snapshot(): LifeosSnapshot {
    return {
      ...this.state,
      workspace: this.workspace,
      currentSection: this.currentSection,
      teams: this.teams,
      availableAiProviders: this.availableAiProviders,
      unreadNotificationCount: this.unreadNotificationCount,
    };
  }

  private emit() {
    const snapshot = this.snapshot();
    for (const subscriber of this.subscribers) subscriber(snapshot);
    this.schedulePersist();
  }

  private patch(changes: Partial<LifeosState>, emit = true) {
    this.state = { ...this.state, ...changes };
    if (emit) this.emit();
  }

  private schedulePersist() {
    const invoke = tauriInvoke();
    if (this.hydrating || !invoke) return;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      const slice: Record<string, unknown> = {};
      for (const key of LIFEOS_PERSIST_KEYS) slice[key] = (this.state as any)[key];
      invoke("ui_state_write", { state: JSON.stringify(slice) }).catch(() => {});
    }, 300);
  }

  pickWorkspace(id: string) { this.patch({ activeId: id, wsCollapsed: false, activeSub: null }); }

  pickSection(title: string) {
    this.patch({ sectionByWs: { ...this.state.sectionByWs, [this.state.activeId]: title }, activeSub: null });
  }

  pickSub(item: any, sectionTitle: string) {
    this.patch({ activeSub: { workspaceId: this.state.activeId, sectionTitle, item } });
  }

  clearSub() { this.patch({ activeSub: null }); }

  toggleWs() { this.patch({ wsCollapsed: !this.state.wsCollapsed }); }

  jumpToTeam(teamItem: any, teamIndex: number) {
    this.patch({
      activeId: "ai",
      wsCollapsed: false,
      sectionByWs: { ...this.state.sectionByWs, ai: "Agent Teams" },
      activeSub: { workspaceId: "ai", sectionTitle: "Agent Teams", item: teamItem },
      pendingExpand: `Agent Teams-${teamIndex}`,
    });
  }

  setTeamOrder(ids: string[]) { this.patch({ teamOrder: ids }); }
  consumeExpand() { this.patch({ pendingExpand: null }); }

  setSectionOrder(wsId: string, titles: string[]) {
    this.patch({ sectionOrder: { ...this.state.sectionOrder, [wsId]: titles } });
  }

  setItemOrder(wsId: string, sectionTitle: string, labels: string[]) {
    this.patch({
      itemOrder: {
        ...this.state.itemOrder,
        [wsId]: { ...(this.state.itemOrder[wsId] || {}), [sectionTitle]: labels },
      },
    });
  }

  addSection(wsId: string, title: string) {
    const list = (this.state.extraSections[wsId] || []).slice();
    list.push({ title, items: [], custom: true });
    this.patch({ extraSections: { ...this.state.extraSections, [wsId]: list } });
  }

  addItem(wsId: string, sectionTitle: string, item: any) {
    const sec = (this.state.extraItems[wsId] || {})[sectionTitle] || [];
    const next = sec.concat([{ ...item, custom: true }]);
    this.patch({
      extraItems: {
        ...this.state.extraItems,
        [wsId]: { ...(this.state.extraItems[wsId] || {}), [sectionTitle]: next },
      },
    });
  }

  toggleAiAvatarHidden() { this.patch({ aiAvatarHidden: !this.state.aiAvatarHidden, aiChatOpen: false }); }

  toggleAiChat() {
    if (!this.state.aiAvatarHidden) this.patch({ aiChatOpen: !this.state.aiChatOpen });
  }

  closeAiChat() { this.patch({ aiChatOpen: false }); }
  setAvatarPos(x: number | null, y: number | null) { this.patch({ avatarPos: { x, y } }); }

  sendAiMessage(text: string, opts: { source?: string } = {}) {
    const value = String(text || "").trim();
    if (!value) return;
    const source = opts.source || "chat";
    this.patch({ aiMessages: [...this.state.aiMessages, { role: "user", text: value, source }] });
    const invoke = tauriInvoke();
    if (invoke) {
      invoke("ai_complete", { prompt: value, source }).then(
        (reply) => this.patch({ aiMessages: [...this.state.aiMessages, { role: "ai", text: String(reply ?? "").trim() || AI_ERROR_MSG, source }] }),
        () => this.patch({ aiMessages: [...this.state.aiMessages, { role: "ai", text: AI_ERROR_MSG, source }] }),
      );
      return;
    }
    const reply = value.toLowerCase().startsWith("/")
      ? `Got it — running ${value.slice(1)} on your behalf.`
      : source === "open-pencil"
        ? "On it. I'll refactor and run `bun run check` before flagging the PR back."
        : "On it. I'll surface anything that needs your input.";
    setTimeout(() => this.patch({ aiMessages: [...this.state.aiMessages, { role: "ai", text: reply, source }] }), 320);
  }

  setAiProvider(name: string) {
    if (!AI_PROVIDERS.includes(name as (typeof AI_PROVIDERS)[number])) return;
    this.patch({ aiProvider: name });
    const invoke = tauriInvoke();
    if (invoke) invoke("ai_provider_set", { provider: name }).catch(() => {});
  }

  setTelemetryEnabled(enabled: boolean) { this.patch({ telemetryEnabled: !!enabled }); }

  setTelemetryRefreshMs(value: number) {
    const next = Number(value);
    if (Number.isFinite(next) && next >= 250) this.patch({ telemetryRefreshMs: next });
  }

  resetUiState() {
    const defaults = initialState();
    this.patch({
      activeId: defaults.activeId,
      wsCollapsed: defaults.wsCollapsed,
      pendingExpand: defaults.pendingExpand,
      sectionByWs: defaults.sectionByWs,
      activeSub: defaults.activeSub,
      teamOrder: defaults.teamOrder,
      sectionOrder: defaults.sectionOrder,
      itemOrder: defaults.itemOrder,
      extraItems: defaults.extraItems,
      extraSections: defaults.extraSections,
      aiAvatarHidden: defaults.aiAvatarHidden,
      aiChatOpen: defaults.aiChatOpen,
      avatarPos: defaults.avatarPos,
      telemetryEnabled: defaults.telemetryEnabled,
      telemetryRefreshMs: defaults.telemetryRefreshMs,
      cmdkOpen: defaults.cmdkOpen,
      cmdkSeed: defaults.cmdkSeed,
      notificationsDrawerOpen: defaults.notificationsDrawerOpen,
      dismissedNotificationIds: defaults.dismissedNotificationIds,
      readNotificationIds: defaults.readNotificationIds,
    });
    const invoke = tauriInvoke();
    if (invoke) invoke("ui_state_write", { state: "{}" }).catch(() => {});
  }

  clearAiMessages() {
    this.patch({ aiMessages: [{ role: "ai", text: "Hey, Alex. I'm here. What do you need?" }] });
  }

  openCmdk(seed = "") { this.patch({ cmdkSeed: seed, cmdkOpen: true }); }
  closeCmdk() { this.patch({ cmdkOpen: false, cmdkSeed: "" }); }
  toggleCmdk() { this.cmdkOpen ? this.closeCmdk() : this.openCmdk(""); }

  openNotificationsDrawer() { this.patch({ notificationsDrawerOpen: true }); }
  closeNotificationsDrawer() { this.patch({ notificationsDrawerOpen: false }); }
  toggleNotificationsDrawer() { this.patch({ notificationsDrawerOpen: !this.state.notificationsDrawerOpen }); }

  markNotificationRead(id: string) {
    if (!this.state.readNotificationIds.includes(id)) {
      this.patch({ readNotificationIds: [...this.state.readNotificationIds, id] });
    }
  }

  markAllNotificationsRead() {
    const all: any[] = (typeof window !== "undefined" ? (window as any).LIFEOS_DATA?.notifications : null) || [];
    this.patch({ readNotificationIds: [...new Set([...this.state.readNotificationIds, ...all.map((n) => n.id)])] });
  }

  dismissNotification(id: string) {
    if (!this.state.dismissedNotificationIds.includes(id)) {
      this.patch({ dismissedNotificationIds: [...this.state.dismissedNotificationIds, id] });
    }
  }

  clearDismissedNotifications() { this.patch({ dismissedNotificationIds: [] }); }

  syncRoute(id: string, sectionTitle?: string, item?: any) {
    const sectionByWs = sectionTitle
      ? { ...this.state.sectionByWs, [id]: sectionTitle }
      : this.state.sectionByWs;
    this.patch({
      activeId: id,
      sectionByWs,
      activeSub: item && sectionTitle ? { workspaceId: id, sectionTitle, item } : null,
    });
  }
}

const lifeos = new NativeLifeosStore();

export function useLifeos(): NativeLifeosStore { return lifeos; }
