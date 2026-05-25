import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useLifeos } from "@/stores/lifeos.js";

describe("lifeos store", () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  it("defaults to ai workspace, panel open", () => {
    const s = useLifeos();
    expect(s.activeId).toBe("ai");
    expect(s.wsCollapsed).toBe(false);
    expect(s.activeSub).toBe(null);
  });

  it("pickWorkspace switches and clears sub", () => {
    const s = useLifeos();
    s.pickSub({ label: "x" }, "Rules");
    s.pickWorkspace("work");
    expect(s.activeId).toBe("work");
    expect(s.activeSub).toBe(null);
  });

  it("toggleWs flips wsCollapsed", () => {
    const s = useLifeos();
    s.toggleWs();
    expect(s.wsCollapsed).toBe(true);
    s.toggleWs();
    expect(s.wsCollapsed).toBe(false);
  });

  it("jumpToTeam sets ai workspace + Agent Teams section + activeSub + pendingExpand", () => {
    const s = useLifeos();
    const team = { label: "Day Captain", flowId: "day", view: "n8n-flow" };
    s.jumpToTeam(team, 0);
    expect(s.activeId).toBe("ai");
    expect(s.sectionByWs.ai).toBe("Agent Teams");
    expect(s.activeSub.item.label).toBe("Day Captain");
    expect(s.pendingExpand).toBe("Agent Teams-0");
  });

  it("setTeamOrder persists the order in getters.teams", () => {
    const s = useLifeos();
    s.setTeamOrder(["day"]);
    expect(s.teams.map(t => t.id)[0]).toBe("day");
  });

  it("consumeExpand clears pendingExpand", () => {
    const s = useLifeos();
    s.jumpToTeam({ label: "x", flowId: "y" }, 1);
    expect(s.pendingExpand).not.toBe(null);
    s.consumeExpand();
    expect(s.pendingExpand).toBe(null);
  });
});
