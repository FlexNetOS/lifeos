<script>
  // LifeOS — N8nFlowView SFC (Svelte port of N8nFlowView.vue)
  // Agent-team workflow visualization: SVG nodes + animated dashed edges.
  import { useLifeos } from "@/stores/lifeos-native";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { resolveWorkspace, flow } from "@/lib/resolve.js";
  import Icon from "./Icon.svelte";
  import SubsectionView from "./SubsectionView.svelte";

  const NODE_W = 180, NODE_H = 76, COL_GAP = 80, ROW_GAP = 28, PADDING = 30;

  const lifeos = useLifeos();
  const lifeosState = bindStore(lifeos, ["activeSub"]);
  let sub = $derived(lifeosState.activeSub);
  let item = $derived(sub?.item);
  let ws = $derived(resolveWorkspace(sub?.workspaceId));
  let f = $derived(flow(item?.flowId));

  let layout = $derived.by(() => {
    if (!f) return null;
    const nodes = f.nodes;
    const edges = f.edges;
    const incoming = {};
    nodes.forEach(n => { incoming[n.id] = 0; });
    edges.forEach(pair => { incoming[pair[1]] = (incoming[pair[1]] || 0) + 1; });
    const col = {};
    const queue = nodes.filter(n => incoming[n.id] === 0).map(n => n.id);
    queue.forEach(id => { col[id] = 0; });
    const inDeg = Object.assign({}, incoming);
    while (queue.length) {
      const cur = queue.shift();
      edges.filter(p => p[0] === cur).forEach(p => {
        const to = p[1];
        col[to] = Math.max(col[to] || 0, (col[cur] || 0) + 1);
        inDeg[to] -= 1;
        if (inDeg[to] === 0) queue.push(to);
      });
    }
    const byCol = {};
    nodes.forEach(n => {
      (byCol[col[n.id]] = byCol[col[n.id]] || []).push(n);
    });
    const placed = {};
    Object.keys(byCol).forEach(c => {
      byCol[+c].forEach((n, i) => {
        placed[n.id] = Object.assign({}, n, { col: +c, row: i, x: +c * (NODE_W + COL_GAP), y: i * (NODE_H + ROW_GAP) });
      });
    });
    const cols = Math.max.apply(null, Object.keys(byCol).map(Number)) + 1;
    const rows = Math.max.apply(null, Object.values(byCol).map(a => a.length));
    return {
      placed: placed,
      cols: cols,
      rows: rows,
      width: cols * NODE_W + (cols - 1) * COL_GAP,
      height: rows * NODE_H + (rows - 1) * ROW_GAP,
    };
  });

  let viewW = $derived(layout ? layout.width + PADDING * 2 : 0);
  let viewH = $derived(layout ? layout.height + PADDING * 2 : 0);

  const nodeRight = (id) => {
    const n = layout.placed[id];
    return { x: PADDING + n.x + NODE_W, y: PADDING + n.y + NODE_H / 2 };
  };
  const nodeLeft = (id) => {
    const n = layout.placed[id];
    return { x: PADDING + n.x, y: PADDING + n.y + NODE_H / 2 };
  };
  const edgePath = (from, to) => {
    const a = nodeRight(from), b = nodeLeft(to);
    const dx = Math.max(40, (b.x - a.x) * 0.5);
    return `M ${a.x},${a.y} C ${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  };

  let agentCount = $derived(f?.nodes.filter((n) => n.type === "agent").length || 0);
  let edgeCount = $derived(f?.edges.length || 0);
  let warnCount = $derived(f?.nodes.filter((n) => n.status === "warn").length || 0);
</script>

{#if !sub || !item || !f}
  <SubsectionView />
{:else}
  <div class="canvas sub-canvas flow-canvas">
    <header class="sub-head">
      <button class="sub-back" title="Back to dashboard" aria-label="Back to dashboard" onclick={() => lifeos.clearSub()}>
        <Icon name="arrow-left" size={14} /> Dashboard
      </button>
      <div class="sub-breadcrumb">
        <span>{ws?.title}</span>
        <Icon name="chevron-right" size={12} />
        <span>{sub.sectionTitle}</span>
        <Icon name="chevron-right" size={12} />
        <strong>{item.label}</strong>
      </div>
    </header>

    <section class="sub-hero flow-hero">
      <div class="sub-hero-ico"><Icon name={item.icon || "users-2"} size={28} /></div>
      <div>
        <h1>{f.title || item.label}</h1>
        {#if item.meta}<p class="sub-hero-meta">{item.meta}</p>{/if}
      </div>
      <div class="flow-stats">
        <div class="flow-stat"><span class="num">{agentCount}</span><span class="lbl">agents</span></div>
        <div class="flow-stat"><span class="num">{edgeCount}</span><span class="lbl">edges</span></div>
        <div class="flow-stat"><span class="num">{warnCount}</span><span class="lbl">attn</span></div>
      </div>
    </section>

    <div class="flow-canvas-wrap" role="img" aria-label="{f.title} workflow visualization">
      <svg class="flow-svg"
           viewBox="0 0 {viewW} {viewH}"
           width="100%"
           style="min-width: {viewW}px; height: {viewH}px;"
           xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrow-cyan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--lifeos-cyan)" />
          </marker>
          <linearGradient id="edge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="var(--lifeos-cyan)" stop-opacity="0.4" />
            <stop offset="100%" stop-color="var(--lifeos-cyan)" stop-opacity="1" />
          </linearGradient>
        </defs>
        {#each f.edges as e, i (`e${i}`)}
          <path d={edgePath(e[0], e[1])}
                fill="none" stroke="url(#edge-grad)" stroke-width="2"
                marker-end="url(#arrow-cyan)" stroke-dasharray="6 4" class="flow-edge">
            <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.6s" repeatCount="indefinite" />
          </path>
        {/each}
        {#each Object.values(layout.placed) as n (n.id)}
          <g transform="translate({PADDING + n.x},{PADDING + n.y})"
             class="flow-node flow-node--{n.type}">
            <rect x="0" y="0" width={NODE_W} height={NODE_H} rx="12" class="flow-node-bg" />
            <rect x="0" y="0" width={NODE_W} height={NODE_H} rx="12" class="flow-node-border" />
            {#if n.type !== "trigger" && n.type !== "output"}
              <circle cx={NODE_W - 14} cy="14" r="4"
                      fill={n.status === "warn" ? "var(--status-warn)" : "var(--lifeos-green)"}>
                {#if n.status === "online"}
                  <animate attributeName="opacity" values="1;.5;1" dur="1.6s" repeatCount="indefinite" />
                {/if}
              </circle>
            {/if}
            <foreignObject x="0" y="0" width={NODE_W} height={NODE_H}>
              <div xmlns="http://www.w3.org/1999/xhtml" class="flow-node-inner {n.type}">
                <span class="flow-node-ico"><Icon name={n.icon || "circle"} size={14} /></span>
                <div class="flow-node-text">
                  <div class="flow-node-label">{n.label}</div>
                  {#if n.note}<div class="flow-node-note">{n.note}</div>{/if}
                </div>
              </div>
            </foreignObject>
          </g>
        {/each}
      </svg>
    </div>

    <div class="flow-legend">
      <span><span class="flow-legend-dot" style="background: var(--lifeos-cyan)"></span> trigger</span>
      <span><span class="flow-legend-dot" style="background: var(--lifeos-purple)"></span> agent</span>
      <span><span class="flow-legend-dot" style="background: var(--lifeos-green)"></span> output</span>
      <span class="flow-legend-sep">·</span>
      <span><Icon name="circle" size={10} style="color: var(--lifeos-green)" /> online</span>
      <span><Icon name="circle" size={10} style="color: var(--status-warn)" /> needs attention</span>
    </div>
  </div>
{/if}
