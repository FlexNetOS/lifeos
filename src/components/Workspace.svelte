<script>
  // LifeOS — Workspace SFC (Svelte port of Workspace.vue)
  // Secondary side panel. Renders ALL sections of the active workspace.
  // Sections + items are reorderable via native HTML5 drag-and-drop.
  // Each section gets an "Add item" button; the workspace gets an "Add section" button.
  import { onMount, onDestroy, tick } from "svelte";
  import { useLifeos } from "@/stores/lifeos-native";
  import { createNav } from "@/lib/svelte-nav.js";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { resolveWorkspace } from "@/lib/resolve.js";
  import { router as appRouter } from "@/router";
  import Icon from "./Icon.svelte";
  import MenuRow from "./MenuRow.svelte";

  let { router = appRouter } = $props();

  const lifeos = useLifeos();
  const nav = createNav(router);
  const lifeosState = bindStore(lifeos, [
    "activeId",
    "wsCollapsed",
    "extraSections",
    "sectionOrder",
    "itemOrder",
    "extraItems",
    "currentSection",
    "pendingExpand",
    "activeSub",
  ]);

  // Base workspace (no overlays applied yet)
  let baseWs = $derived(resolveWorkspace(lifeosState.activeId));

  // Apply per-workspace overlays from the store: extraSections, sectionOrder, extraItems, itemOrder.
  let ws = $derived.by(() => {
    const b = baseWs;
    if (!b) return null;
    const wsId = lifeosState.activeId;
    let sections = (b.sections || []).slice();

    // Append user-added sections
    const xs = lifeosState.extraSections[wsId] || [];
    sections = sections.concat(xs);

    // Reorder sections per overlay
    const so = lifeosState.sectionOrder[wsId];
    if (so?.length) {
      const by = {};
      sections.forEach((s) => (by[s.title] = s));
      const ordered = so.map((t) => by[t]).filter(Boolean);
      const missing = sections.filter((s) => !so.includes(s.title));
      sections = ordered.concat(missing);
    }

    // For each section, merge extra items + apply item order
    const itemOrder = lifeosState.itemOrder[wsId] || {};
    const itemExtras = lifeosState.extraItems[wsId] || {};
    sections = sections.map((s) => {
      let items = (s.items || []).slice();
      const xi = itemExtras[s.title] || [];
      items = items.concat(xi);
      const order = itemOrder[s.title];
      if (order?.length) {
        const by = {};
        items.forEach((it) => (by[it.label] = it));
        const r = order.map((l) => by[l]).filter(Boolean);
        const missing = items.filter((it) => !order.includes(it.label));
        items = r.concat(missing);
      }
      return { ...s, items };
    });
    return { ...b, sections };
  });

  let currentSection = $derived(
    ws?.sections?.find((s) => s.title === lifeosState.currentSection) || ws?.sections?.[0],
  );

  // Section selector dropdown
  let open = $state(false);
  let selEl = $state(null);
  const onMouse = (e) => {
    if (open && selEl && !selEl.contains(e.target)) open = false;
  };
  const onKey = (e) => { if (e.key === "Escape") open = false; };
  onMount(() => {
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
  });
  onDestroy(() => {
    document.removeEventListener("mousedown", onMouse);
    document.removeEventListener("keydown", onKey);
  });

  const jumpToSection = async (title) => {
    nav.pickSection(title);
    open = false;
    await tick();
    const el = document.querySelector(`[data-section-anchor="${CSS.escape(title)}"]`);
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      el.classList.add("flash-highlight");
      setTimeout(() => el.classList.remove("flash-highlight"), 1400);
    }
  };

  // Consume pre-expand requests (team-card → flow row)
  $effect(() => {
    const key = lifeosState.pendingExpand;
    if (!key) return;
    tick().then(() => {
      const el = document.querySelector(`[data-expand-key="${CSS.escape(key)}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("flash-highlight");
        setTimeout(() => el.classList.remove("flash-highlight"), 1400);
      }
      lifeos.consumeExpand();
    });
  });

  // ===== Collapse / expand per section ============================
  let collapsedSections = $state(new Set());
  const isCollapsed = (title) => collapsedSections.has(title);
  const toggleCollapsed = (title) => {
    const s = new Set(collapsedSections);
    if (s.has(title)) s.delete(title); else s.add(title);
    collapsedSections = s;
  };
  const onSectionTitleKeydown = (e, title) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCollapsed(title);
    }
  };

  // ===== Drag-and-drop ============================================
  let drag = $state({ kind: null, payload: null, overSection: null, overItem: null });

  const startSectionDrag = (e, title) => {
    drag = { kind: "section", payload: title, overSection: null, overItem: null };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `section:${title}`);
  };
  const startItemDrag = (e, sectionTitle, item) => {
    drag = { kind: "item", payload: { sectionTitle, label: item.label }, overSection: null, overItem: null };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `item:${sectionTitle}/${item.label}`);
    e.stopPropagation();
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onSectionDragEnter = (title) => { if (drag.kind === "section") drag.overSection = title; };
  const onItemDragEnter = (sectionTitle, label) => {
    if (drag.kind === "item") drag.overItem = { sectionTitle, label };
  };
  const endDrag = () => { drag = { kind: null, payload: null, overSection: null, overItem: null }; };

  const dropOnSection = (e, targetTitle) => {
    e.preventDefault();
    const d = drag;
    if (d.kind === "section") {
      const sections = (ws?.sections || []).map((s) => s.title);
      const from = sections.indexOf(d.payload);
      const to   = sections.indexOf(targetTitle);
      if (from < 0 || to < 0 || from === to) return endDrag();
      const next = sections.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      lifeos.setSectionOrder(lifeos.activeId, next);
    } else if (d.kind === "item") {
      // Cross-section move: pop from source list (via reorder overlay) and append to target.
      // For prototype: just snap the item label to the end of the target section's order.
      const srcSec = ws.sections.find((s) => s.title === d.payload.sectionTitle);
      const tgtSec = ws.sections.find((s) => s.title === targetTitle);
      if (!srcSec || !tgtSec) return endDrag();
      const tgtLabels = tgtSec.items.map((i) => i.label).filter((l) => l !== d.payload.label).concat([d.payload.label]);
      lifeos.setItemOrder(lifeos.activeId, targetTitle, tgtLabels);
      const srcLabels = srcSec.items.map((i) => i.label).filter((l) => l !== d.payload.label);
      lifeos.setItemOrder(lifeos.activeId, d.payload.sectionTitle, srcLabels);
    }
    endDrag();
  };
  const dropOnItem = (e, sectionTitle, label) => {
    e.preventDefault(); e.stopPropagation();
    const d = drag;
    if (d.kind !== "item") return endDrag();
    if (d.payload.label === label && d.payload.sectionTitle === sectionTitle) return endDrag();
    const section = ws.sections.find((s) => s.title === sectionTitle);
    if (!section) return endDrag();
    const labels = section.items.map((i) => i.label);
    const targetIdx = labels.indexOf(label);
    // Remove dragged item from its source section first
    if (d.payload.sectionTitle !== sectionTitle) {
      const src = ws.sections.find((s) => s.title === d.payload.sectionTitle);
      if (src) {
        const srcLabels = src.items.map((i) => i.label).filter((l) => l !== d.payload.label);
        lifeos.setItemOrder(lifeos.activeId, d.payload.sectionTitle, srcLabels);
      }
    }
    const next = labels.filter((l) => l !== d.payload.label);
    next.splice(targetIdx, 0, d.payload.label);
    lifeos.setItemOrder(lifeos.activeId, sectionTitle, next);
    endDrag();
  };

  // ===== Creation =================================================
  const addItem = (sectionTitle) => {
    const label = window.prompt(`New item in "${sectionTitle}" — name?`);
    if (!label) return;
    lifeos.addItem(lifeos.activeId, sectionTitle, { icon: "circle", label, meta: "Just added" });
  };
  const addSection = () => {
    const title = window.prompt(`New section in "${ws?.title}" — name?`);
    if (!title) return;
    lifeos.addSection(lifeos.activeId, title);
  };

  // Mini-workspace quick items
  let quickItems = $derived((currentSection?.items || []).slice(0, 6));
  let railEntry = $derived.by(() => {
    const D = globalThis.LIFEOS_DATA;
    return D?.rail.find((r) => r.id === lifeosState.activeId) || D?.railFooter.find((r) => r.id === lifeosState.activeId);
  });
</script>

{#if lifeosState.wsCollapsed}
  <section class="workspace mini" data-figma-component="Sidebar Companion/Detail panel/Collapsed" aria-label="{ws?.title} quick access">
    <button class="mini-id" title="Open {ws?.title}" aria-label="Open {ws?.title}" onclick={() => lifeos.toggleWs()}>
      <Icon name={railEntry?.icon || "layers"} size={16} />
    </button>
    <div class="mini-actions">
      <button class="mini-btn" title="Search · ⌘K" aria-label="Search" onclick={() => lifeos.toggleWs()}><Icon name="search" size={14} /></button>
      <button class="mini-btn primary" title="New in {ws?.title}" aria-label="New in {ws?.title}"><Icon name="plus" size={14} /></button>
      <button class="mini-btn" title="Ask LifeOS" aria-label="Ask LifeOS"><Icon name="sparkles" size={14} /></button>
    </div>
    {#if currentSection}
      <div class="mini-sep" aria-hidden="true"></div>
      <div class="mini-section-label" title={currentSection.title}>
        {currentSection.title.split(" ").map((w) => w[0]).join("").slice(0, 2)}
      </div>
      <nav class="mini-list">
        {#each quickItems as item, i (i)}
          <button class="mini-row" class:active={item.active}
                  title="{item.label}{item.meta ? ' · ' + item.meta : ''}"
                  aria-label={item.label}
                  onclick={() => lifeos.toggleWs()}>
            <span class="mini-row-ico">
              <Icon name={item.icon || "circle"} size={14} />
              {#if item.status}
                <span class="mini-row-status" style="background: {item.status === 'warn' ? 'var(--status-warn)' : 'var(--lifeos-green)'};"></span>
              {/if}
            </span>
            {#if item.badge}
              <span class="mini-row-badge tone-{item.badge.tone || 'err'}">
                {item.badge.count > 99 ? "99+" : item.badge.count}
              </span>
            {/if}
          </button>
        {/each}
      </nav>
    {/if}
    <button class="mini-expand" title="Open workspace panel" aria-label="Open workspace panel" onclick={() => lifeos.toggleWs()}>
      <Icon name="chevrons-right" size={14} />
    </button>
  </section>
{:else}
  <section class="workspace" data-figma-component="Sidebar Companion/Detail panel" data-workspace={lifeosState.activeId} aria-label="{ws?.title || 'Workspace'} panel">
    <header class="ws-head">
      <div class="ws-selector" bind:this={selEl}>
        <button class="ws-selector-trigger" class:open
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label="{ws?.title} — switch section"
                onclick={() => open = !open}>
          <span class="ws-selector-ws">{ws?.title}</span>
          <span class="ws-selector-sep">·</span>
          <h2>{currentSection?.title || "—"}</h2>
          <Icon name="chevron-down" size={14} class="ws-selector-chev"
                style="transform: {open ? 'rotate(180deg)' : 'rotate(0)'}; transition: transform .2s;" />
        </button>
        {#if open}
          <div class="ws-selector-menu" role="listbox">
            <div class="ws-selector-eyebrow">{ws?.title} — sections</div>
            {#each (ws?.sections || []) as s (s.title)}
              <button class="ws-selector-option" class:active={s.title === currentSection?.title}
                      role="option"
                      aria-selected={s.title === currentSection?.title}
                      onclick={() => jumpToSection(s.title)}>
                <span class="opt-ico"><Icon name={s.items?.[0]?.icon || "circle"} size={14} /></span>
                <span class="opt-label">{s.title}</span>
                <span class="opt-count">{s.items?.length || 0}</span>
                {#if s.title === currentSection?.title}
                  <Icon name="check" size={12} class="opt-check" />
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="ws-collapse" title="Close workspace panel" aria-label="Close workspace panel" onclick={() => lifeos.toggleWs()}>
        <Icon name="chevron-left" size={14} />
      </button>
    </header>

    <div class="ws-body">
      {#if ws?.synced}
        <div class="ws-synced-banner">
          <Icon name="link" size={11} />
          <span>Synced view — aggregated from your workspaces</span>
        </div>
      {/if}
      <div class="ws-search">
        <Icon name="search" size={14} />
        <!-- Hand off to the command palette (Phase 4 #2). Native focus opens CmdK. -->
        <input placeholder="Search {ws?.title?.toLowerCase() || ''}…"
               aria-label="Search this workspace"
               readonly
               onfocus={(e) => { e.target.blur(); lifeos.openCmdk(""); }}
               onclick={() => lifeos.openCmdk("")}
               onkeydown={() => lifeos.openCmdk("")} />
        <kbd class="kbd">⌘K</kbd>
      </div>

      {#each (ws?.sections || []) as section (section.title)}
        <div class="ws-section"
             class:is-drop-target={drag.overSection === section.title && drag.kind === "section"}
             class:is-collapsed={isCollapsed(section.title)}
             data-section-anchor={section.title}
             role="group"
             aria-label="{section.title} section"
             draggable="true"
             ondragstart={(e) => startSectionDrag(e, section.title)}
             ondragover={onDragOver}
             ondragenter={() => onSectionDragEnter(section.title)}
             ondrop={(e) => dropOnSection(e, section.title)}
             ondragend={endDrag}>
          <div class="ws-section-title" role="button"
               aria-expanded={!isCollapsed(section.title)}
               tabindex="0"
               onclick={() => toggleCollapsed(section.title)}
               onkeydown={(e) => onSectionTitleKeydown(e, section.title)}>
            <span class="ws-section-grip" aria-hidden="true"><Icon name="grip-vertical" size={11} /></span>
            <span class="ws-section-name">{section.title}</span>
            <span class="ws-section-count">{section.items?.length || 0}</span>
            <Icon name="chevron-down" size={12}
                  class="ws-section-chev"
                  style="transform: {isCollapsed(section.title) ? 'rotate(-90deg)' : 'rotate(0)'}; transition: transform .18s;" />
          </div>
          {#if !isCollapsed(section.title)}
            {#each section.items as item, i (`${section.title}-${item.label}-${i}`)}
              <div data-expand-key="{section.title}-{i}"
                   class="draggable-item"
                   class:is-drop-target={drag.kind === "item" && drag.overItem?.sectionTitle === section.title && drag.overItem?.label === item.label}
                   role="group"
                   draggable="true"
                   ondragstart={(e) => startItemDrag(e, section.title, item)}
                   ondragover={(e) => { e.stopPropagation(); onDragOver(e); }}
                   ondragenter={(e) => { e.stopPropagation(); onItemDragEnter(section.title, item.label); }}
                   ondrop={(e) => { e.stopPropagation(); dropOnItem(e, section.title, item.label); }}
                   ondragend={(e) => { e.stopPropagation(); endDrag(); }}>
                <MenuRow item={{ ...item, active: lifeosState.activeSub?.sectionTitle === section.title && lifeosState.activeSub?.item?.label === item.label }}
                         onclick={() => nav.pickSub(item, section.title)} />
                {#if item._origin}
                  <div class="origin-tag" aria-hidden="true">
                    <Icon name="link" size={10} /> {item._origin.workspaceTitle}
                  </div>
                {/if}
              </div>
            {/each}
            <button class="ws-add-row" onclick={() => addItem(section.title)} title="Add to {section.title}">
              <Icon name="plus" size={13} />
              <span>Add to {section.title}</span>
            </button>
          {/if}
        </div>
      {/each}

      <button class="ws-add-section" onclick={addSection} title="Add a section to {ws?.title}">
        <Icon name="plus" size={14} />
        <span>New section</span>
      </button>
    </div>
  </section>
{/if}
