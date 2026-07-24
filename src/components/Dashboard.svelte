<script>
  // LifeOS — Dashboard SFC (Svelte port of Dashboard.vue)
  // Main canvas: greeting + 4 stat cards + agent-team grid (drag+click) + activity + agenda + AI suggest.
  import { useLifeos } from "@/stores/lifeos.js";
  import { useAuth } from "@/stores/auth";
  import { useToasts } from "@/stores/toasts.js";
  import { createNav } from "@/lib/svelte-nav.js";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { router as appRouter } from "@/router";
  import Icon from "./Icon.svelte";
  import TelemetryWidget from "./TelemetryWidget.svelte";

  let { router = appRouter } = $props();

  const lifeos = useLifeos();
  const auth = useAuth();
  const toasts = useToasts();
  const nav = createNav(router);
  const lifeosState = bindStore(lifeos, ["teams"]);
  const authState = bindStore(auth, ["account"]);
  const d = globalThis.LIFEOS_DATA?.dashboardCanvas;
  const TONE = globalThis.TONE || {};
  let teams = $derived(lifeosState.teams);
  const todayLabel =
    new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  let greeting = $derived.by(() => {
    const name = authState.account?.displayName?.trim();
    return name ? `Good afternoon, ${name}.` : d.greeting;
  });
  const aiAgentTeamItems = () =>
    globalThis.LIFEOS_DATA?.workspaces?.ai?.sections?.find((s) => s.title === "Agent Teams")?.items || [];

  // drag-reorder
  let dragId = $state(null);
  let overId = $state(null);
  const onDragStart = (e, id) => {
    dragId = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (e, targetId) => {
    e.preventDefault();
    const sourceId = dragId;
    dragId = null; overId = null;
    if (!sourceId || sourceId === targetId) return;
    const current = teams.map((t) => t.id);
    const fromIdx = current.indexOf(sourceId);
    const toIdx = current.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...current];
    const [m] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, m);
    lifeos.setTeamOrder(next);
  };

  // click → flow
  const openTeam = (t) => {
    const items = aiAgentTeamItems();
    const idx = items.findIndex((x) => x.flowId === t.flowId);
    const enriched = idx >= 0
      ? Object.assign({}, items[idx], { _teamIndex: idx })
      : { label: t.name, icon: t.icon, view: "n8n-flow", flowId: t.flowId, _teamIndex: 0 };
    nav.jumpToTeam(enriched, idx >= 0 ? idx : 0);
  };

  const toneOf = (key) => TONE[key] || { bg: "transparent", fg: "var(--fg-0)", bd: "var(--bg-5)" };

  // Dashboard CTAs (Phase 4 #3) — wire to real behaviors where they exist;
  // surface "coming soon" for shells we haven't built yet (Activity feed, Agenda sync, suggestion-apply).
  const askLifeOS = () => lifeos.toggleAiChat();
  const newAutomation = () => {
    // Open the command palette pre-seeded so the user can pick an existing workflow
    // to clone, or land in the AI chat with the /new-automation slash command.
    lifeos.openCmdk("automation");
  };
  const comingSoon = (label) => {
    toasts.info(`${label} is coming soon.`);
  };
</script>

{#if !d}
  <div class="canvas"><h1 class="canvas-greeting">Loading…</h1></div>
{:else}
  <div class="canvas">
    <header class="canvas-head">
      <div>
        <div class="canvas-eyebrow">{todayLabel}</div>
        <h1 class="canvas-greeting">{greeting}</h1>
        <p class="canvas-sub">{d.sub}</p>
      </div>
      <div class="canvas-actions">
        <button class="btn-gradient" aria-label="Ask LifeOS" onclick={askLifeOS}><Icon name="sparkles" size={14} />Ask LifeOS</button>
        <button class="btn-secondary" aria-label="New automation" onclick={newAutomation}><Icon name="plus" size={14} />New automation</button>
      </div>
    </header>

    <div class="stats-grid" role="group" aria-label="Workspace overview">
      {#each d.stats as s, i (s.id)}
        <div class="fade-in-up" style="animation-delay: {i * 50}ms;">
          <div class="stat-card"
               role="img"
               aria-label="{s.label}: {s.value}{s.unit || ''}, {s.delta}"
               style="background: linear-gradient(180deg, {toneOf(s.tone).bg} 0%, transparent 60%), var(--bg-2); border-color: {toneOf(s.tone).bd};">
            <div class="stat-head">
              <span class="stat-ico" style="background: {toneOf(s.tone).bg}; color: {toneOf(s.tone).fg};">
                <Icon name={s.icon} size={16} />
              </span>
              <span class="stat-delta" style="color: {toneOf(s.tone).fg};">{s.delta}</span>
            </div>
            <div class="stat-value">{s.value}<span class="stat-unit">{s.unit}</span></div>
            <div class="stat-label">{s.label}</div>
            <div class="stat-meta">{s.meta}</div>
          </div>
        </div>
      {/each}
    </div>

    <TelemetryWidget />

    <div class="teams-block">
      <div class="teams-head">
        <h2>Your agent teams</h2>
        <span class="teams-meta">{teams.length} teams · 21 agents · running now</span>
        <span class="teams-hint"><Icon name="move" size={11} /> drag to reorder · click to open</span>
      </div>
      <div class="teams-grid">
        {#each teams as t, i (t.id)}
          <button class="team-card"
                  class:is-dragging={dragId === t.id}
                  class:is-drop-target={overId === t.id && dragId !== t.id}
                  style="border-color: {toneOf(t.tone).bd}; animation-delay: {i * 60}ms;"
                  draggable="true"
                  aria-label="Open {t.name} workflow"
                  onclick={() => openTeam(t)}
                  ondragstart={(e) => onDragStart(e, t.id)}
                  ondragover={onDragOver}
                  ondragenter={() => overId = t.id}
                  ondragleave={() => { if (overId === t.id) overId = null; }}
                  ondrop={(e) => onDrop(e, t.id)}
                  ondragend={() => { dragId = null; overId = null; }}>
            <div class="team-head">
              <span class="team-ico" style="background: {toneOf(t.tone).bg}; color: {toneOf(t.tone).fg};">
                <Icon name={t.icon} size={14} />
              </span>
              <span class="team-name">{t.name}</span>
              <span class="team-status">
                <span class="team-dot"
                      style="background: {t.status === 'warn' ? 'var(--status-warn)' : 'var(--lifeos-green)'}; box-shadow: {t.status === 'online' ? `0 0 8px ${t.status === 'warn' ? 'var(--status-warn)' : 'var(--lifeos-green)'}` : 'none'};"></span>
              </span>
              <span class="team-grip" aria-hidden="true"><Icon name="grip-vertical" size={12} /></span>
            </div>
            <div class="team-meta">{t.meta}</div>
            <div class="team-foot">
              <span class="team-counter" style="color: {toneOf(t.tone).fg};">{t.counter}</span>
              <span class="team-cta">Open <Icon name="arrow-right" size={11} /></span>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <div class="canvas-cols">
      <div class="col-card">
        <div class="col-head"><h3>Activity feed</h3><button class="link-btn" onclick={() => comingSoon("View all activity")}>View all</button></div>
        <ul class="activity-list">
          {#each d.activity as a, i (i)}
            <li class="activity-row">
              <span class="activity-ico" style="background: {toneOf(a.tone).bg}; color: {toneOf(a.tone).fg};">
                <Icon name={a.icon} size={14} />
              </span>
              <span class="activity-body">
                <span class="activity-title">{a.title}</span>
                <span class="activity-meta">{a.meta}</span>
              </span>
              <span class="activity-time">{a.time}</span>
            </li>
          {/each}
        </ul>
      </div>
      <div class="col-card">
        <div class="col-head"><h3>Today's agenda</h3><button class="link-btn" onclick={() => comingSoon("Sync agenda")}>Sync</button></div>
        <ul class="agenda-list">
          {#each d.agenda as a, i (i)}
            <li class="agenda-row">
              <span class="agenda-time">{a.time}</span>
              <span class="agenda-bar" style="background: {toneOf(a.tone).fg};"></span>
              <span class="agenda-body">
                <span class="agenda-title">{a.title}</span>
                <span class="agenda-tag" style="background: {toneOf(a.tone).bg}; color: {toneOf(a.tone).fg}; border: 1px solid {toneOf(a.tone).bd};">{a.tag}</span>
              </span>
            </li>
          {/each}
        </ul>
        <div class="ai-suggest" role="status" aria-live="polite">
          <span class="ai-ico" aria-hidden="true"><Icon name="sparkles" size={14} /></span>
          <div><strong>LifeOS suggests:</strong> move standup to 2:30 to clear a 60-min focus block.</div>
          <button class="link-btn cyan" onclick={() => comingSoon("Apply LifeOS suggestion")}>Apply</button>
        </div>
      </div>
    </div>
  </div>
{/if}
