<script>
  // LifeOS — CommandPalette SFC (Svelte port of CommandPalette.vue, Phase 4 #2)
  // Cmd-K / Ctrl-K opens a fuzzy-search across all workspaces, sections, items, and teams.
  // Selection routes via createNav (svelte-nav) so the URL stays in sync (Phase 4 #1
  // contract) — see svelte-nav.js for why useNav() can't be used outside a Vue tree.
  // Ported from design-system-reference/lifeos_app_react/CommandPalette.jsx via CommandPalette.vue.

  import { onMount, onDestroy, tick } from "svelte";
  import { useLifeos } from "@/stores/lifeos.js";
  import { createNav } from "@/lib/svelte-nav.js";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { router as appRouter } from "@/router";
  import Icon from "./Icon.svelte";

  let { router = appRouter } = $props();

  const lifeos = useLifeos();
  const nav = createNav(router);
  // Reactive reads: cmdkOpen drives the overlay + the open-watch below. cmdkSeed is
  // deliberately read straight off the store (non-reactively) inside the open effect,
  // mirroring Vue's watch(() => lifeos.cmdkOpen, ...) which does NOT re-fire when only
  // the seed changes (e.g. openCmdk() called again while already open).
  const lifeosState = bindStore(lifeos, ["cmdkOpen"]);

  let q = $state("");
  let active = $state(0);
  let inputEl = $state(null);
  let listEl = $state(null);

  // Lightweight scoring: exact > prefix > substring > char-sequence. No external lib.
  function scoreMatch(query, target) {
    if (!query) return 0;
    const qq = query.toLowerCase();
    const tt = String(target || "").toLowerCase();
    if (!tt) return 0;
    if (tt === qq) return 1000;
    if (tt.startsWith(qq)) return 500 + (qq.length / tt.length) * 100;
    const idx = tt.indexOf(qq);
    if (idx >= 0) return 250 - idx;
    let ti = 0, hits = 0, lastIdx = -1, runs = 0;
    for (let qi = 0; qi < qq.length; qi++) {
      const ch = qq[qi];
      let found = -1;
      for (let i = ti; i < tt.length; i++) {
        if (tt[i] === ch) { found = i; break; }
      }
      if (found < 0) return 0;
      if (found === lastIdx + 1) runs++;
      lastIdx = found;
      ti = found + 1;
      hits++;
    }
    return hits === qq.length ? 50 + runs * 5 : 0;
  }

  function indexAll() {
    const D = globalThis.LIFEOS_DATA;
    if (!D) return [];
    const out = [];
    (D.rail || []).concat(D.railFooter || []).forEach((r) => {
      const ws = r.id === "settings" ? D.profile : D.workspaces?.[r.id];
      if (!ws) {
        out.push({ kind: "workspace", id: r.id, icon: r.icon, label: r.tooltip?.split(" (")[0] || r.id, hint: r.tooltip || "", route: { workspaceId: r.id } });
        return;
      }
      out.push({ kind: "workspace", id: r.id, icon: r.icon, label: ws.title, hint: r.tooltip || "", route: { workspaceId: r.id } });
      (ws.sections || []).forEach((s) => {
        out.push({ kind: "section", id: `${r.id}/${s.title}`, icon: s.items?.[0]?.icon || "list", label: s.title, hint: ws.title, route: { workspaceId: r.id, sectionTitle: s.title } });
        (s.items || []).forEach((item) => {
          out.push({
            kind: "item",
            id: `${r.id}/${s.title}/${item.label}`,
            icon: item.icon || "circle",
            label: item.label,
            hint: `${ws.title} · ${s.title}${item.meta ? " · " + item.meta : ""}`,
            route: { workspaceId: r.id, sectionTitle: s.title, item },
          });
        });
      });
    });
    (D.dashboardCanvas?.teams || []).forEach((t) => {
      out.push({ kind: "team", id: `team/${t.id}`, icon: t.icon, label: t.name, hint: `Agent team · ${t.meta || ""}`, route: { team: t } });
    });
    return out;
  }

  const KIND_LABEL = { workspace: "Workspace", section: "Section", item: "Item", team: "Team" };
  const KIND_TONE  = { workspace: "cyan",      section: "purple",  item: "neutral", team: "green" };

  let corpus = $state([]);
  let results = $derived.by(() => {
    if (!q.trim()) {
      const wsItems = corpus.filter((r) => r.kind === "workspace").slice(0, 8);
      const teams = corpus.filter((r) => r.kind === "team");
      return [...wsItems, ...teams];
    }
    const scored = corpus.map((r) => {
      const s = Math.max(
        scoreMatch(q, r.label) * 1.2,
        scoreMatch(q, r.hint || "") * 0.6,
      );
      return { r, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 60);
    return scored.map((x) => x.r);
  });

  const pick = (r) => {
    lifeos.closeCmdk();
    if (r.kind === "team") {
      nav.jumpToTeam(r.route.team, 0);
      return;
    }
    const { workspaceId, sectionTitle, item } = r.route;
    if (sectionTitle && item) {
      nav.pickWorkspace(workspaceId);
      nav.pickSection(sectionTitle);
      nav.pickSub(item, sectionTitle);
    } else if (sectionTitle) {
      nav.pickWorkspace(workspaceId);
      nav.pickSection(sectionTitle);
    } else {
      nav.pickWorkspace(workspaceId);
    }
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(active + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) pick(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      lifeos.closeCmdk();
    }
  };

  // Vue: watch(() => lifeos.cmdkOpen, async (open) => { ... })
  $effect(() => {
    const open = lifeosState.cmdkOpen;
    if (open) {
      corpus = indexAll();
      q = lifeos.cmdkSeed || "";
      active = 0;
      tick().then(() => {
        inputEl?.focus();
      });
    }
  });

  // Vue: watch(q, () => { active.value = 0; })
  $effect(() => {
    void q;
    active = 0;
  });

  // Vue: watch(active, async () => { ...scroll active row into view... })
  $effect(() => {
    void active;
    tick().then(() => {
      if (!listEl) return;
      const el = listEl.querySelector(`[data-row-idx="${active}"]`);
      if (el?.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    });
  });

  // Global ⌘K / Ctrl-K shortcut
  const onGlobalKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      lifeos.toggleCmdk();
    }
  };
  onMount(() => document.addEventListener("keydown", onGlobalKey));
  onDestroy(() => document.removeEventListener("keydown", onGlobalKey));

  const onOverlayMousedown = (e) => {
    if (e.target === e.currentTarget) lifeos.closeCmdk();
  };

  // Teleport-to-body equivalent (Vue's <Teleport to="body">) — same action as Sidebar.svelte.
  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.parentNode?.removeChild(node); } };
  }
</script>

{#if lifeosState.cmdkOpen}
  <div use:portal
       class="cmdk-overlay"
       role="dialog"
       aria-modal="true"
       aria-label="Command palette"
       tabindex="-1"
       onmousedown={onOverlayMousedown}>
    <div class="cmdk-panel" data-figma-reference="5:49#command-menu">
      <div class="cmdk-input-wrap">
        <Icon name="search" size={16} />
        <input bind:this={inputEl}
               bind:value={q}
               type="text"
               placeholder="Jump to workspace · section · item · team…"
               role="combobox"
               aria-label="Search LifeOS"
               aria-autocomplete="list"
               aria-expanded="true"
               aria-controls="cmdk-results"
               aria-activedescendant={results.length ? `cmdk-row-${active}` : undefined}
               onkeydown={onKey} />
        <kbd class="kbd">ESC</kbd>
      </div>
      <div bind:this={listEl} id="cmdk-results" class="cmdk-results" role="listbox" aria-label="Command results">
        {#if results.length === 0}
          <div class="cmdk-empty" role="option" aria-disabled="true" aria-selected="false">
            <Icon name="sparkles" size={14} /> No matches. Try a workspace, section, or team name.
          </div>
        {/if}
        {#each results as r, i (r.id)}
          <button id="cmdk-row-{i}"
                  data-row-idx={i}
                  class="cmdk-row"
                  class:active={i === active}
                  role="option"
                  aria-selected={i === active}
                  onmouseenter={() => active = i}
                  onclick={() => pick(r)}>
            <span class="cmdk-ico tone-{KIND_TONE[r.kind] || 'neutral'}">
              <Icon name={r.icon || "circle"} size={14} />
            </span>
            <span class="cmdk-body">
              <span class="cmdk-label">{r.label}</span>
              {#if r.hint}<span class="cmdk-hint">{r.hint}</span>{/if}
            </span>
            <span class="cmdk-kind">{KIND_LABEL[r.kind]}</span>
          </button>
        {/each}
      </div>
      <div class="cmdk-footer">
        <span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> navigate</span>
        <span><kbd class="kbd">↵</kbd> open</span>
        <span><kbd class="kbd">ESC</kbd> close</span>
        <span class="cmdk-count">{results.length} results</span>
      </div>
    </div>
  </div>
{/if}
