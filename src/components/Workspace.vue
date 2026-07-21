<script setup>
// LifeOS — Workspace SFC
// Secondary side panel. Renders ALL sections of the active workspace.
// Sections + items are reorderable via native HTML5 drag-and-drop.
// Each section gets an "Add item" button; the workspace gets an "Add section" button.

import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useNav } from "@/lib/nav.js";
import { resolveWorkspace } from "@/lib/resolve.js";
import Icon from "./Icon.vue";
import MenuRow from "./MenuRow.vue";

const lifeos = useLifeos();
const nav = useNav();

// Base workspace (no overlays applied yet)
const baseWs = computed(() => resolveWorkspace(lifeos.activeId));

// Apply per-workspace overlays from the store: extraSections, sectionOrder, extraItems, itemOrder.
const ws = computed(() => {
  const b = baseWs.value;
  if (!b) return null;
  const wsId = lifeos.activeId;
  let sections = (b.sections || []).slice();

  // Append user-added sections
  const xs = lifeos.extraSections[wsId] || [];
  sections = sections.concat(xs);

  // Reorder sections per overlay
  const so = lifeos.sectionOrder[wsId];
  if (so?.length) {
    const by = {};
    sections.forEach(s => (by[s.title] = s));
    const ordered = so.map(t => by[t]).filter(Boolean);
    const missing = sections.filter(s => !so.includes(s.title));
    sections = ordered.concat(missing);
  }

  // For each section, merge extra items + apply item order
  const itemOrder = lifeos.itemOrder[wsId] || {};
  const itemExtras = lifeos.extraItems[wsId] || {};
  sections = sections.map(s => {
    let items = (s.items || []).slice();
    const xi = itemExtras[s.title] || [];
    items = items.concat(xi);
    const order = itemOrder[s.title];
    if (order?.length) {
      const by = {};
      items.forEach(it => (by[it.label] = it));
      const r = order.map(l => by[l]).filter(Boolean);
      const missing = items.filter(it => !order.includes(it.label));
      items = r.concat(missing);
    }
    return { ...s, items };
  });
  return { ...b, sections };
});

const currentSection = computed(() =>
  ws.value?.sections?.find(s => s.title === lifeos.currentSection) || ws.value?.sections?.[0]);

// Section selector dropdown
const open = ref(false);
const selRef = ref(null);
const onMouse = (e) => {
  if (open.value && selRef.value && !selRef.value.contains(e.target)) open.value = false;
};
const onKey = (e) => { if (e.key === "Escape") open.value = false; };
onMounted(() => { document.addEventListener("mousedown", onMouse); document.addEventListener("keydown", onKey); });
onBeforeUnmount(() => { document.removeEventListener("mousedown", onMouse); document.removeEventListener("keydown", onKey); });

const jumpToSection = (title) => {
  nav.pickSection(title);
  open.value = false;
  nextTick(() => {
    const el = document.querySelector(`[data-section-anchor="${CSS.escape(title)}"]`);
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      el.classList.add("flash-highlight");
      setTimeout(() => el.classList.remove("flash-highlight"), 1400);
    }
  });
};

// Consume pre-expand requests (team-card → flow row)
watch(() => lifeos.pendingExpand, async (key) => {
  if (!key) return;
  await nextTick();
  const el = document.querySelector(`[data-expand-key="${CSS.escape(key)}"]`);
  if (el) {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash-highlight");
    setTimeout(() => el.classList.remove("flash-highlight"), 1400);
  }
  lifeos.consumeExpand();
});

// ===== Collapse / expand per section ============================
const collapsedSections = ref(new Set());
const isCollapsed = (title) => collapsedSections.value.has(title);
const toggleCollapsed = (title) => {
  const s = new Set(collapsedSections.value);
  if (s.has(title)) s.delete(title); else s.add(title);
  collapsedSections.value = s;
};

// ===== Drag-and-drop ============================================
const drag = ref({ kind: null, payload: null, overSection: null, overItem: null });

const startSectionDrag = (e, title) => {
  drag.value = { kind: "section", payload: title, overSection: null, overItem: null };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", `section:${title}`);
};
const startItemDrag = (e, sectionTitle, item) => {
  drag.value = { kind: "item", payload: { sectionTitle, label: item.label }, overSection: null, overItem: null };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", `item:${sectionTitle}/${item.label}`);
  e.stopPropagation();
};
const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
const onSectionDragEnter = (title) => { if (drag.value.kind === "section") drag.value.overSection = title; };
const onItemDragEnter = (sectionTitle, label) => {
  if (drag.value.kind === "item") drag.value.overItem = { sectionTitle, label };
};
const endDrag = () => { drag.value = { kind: null, payload: null, overSection: null, overItem: null }; };

const dropOnSection = (e, targetTitle) => {
  e.preventDefault();
  const d = drag.value;
  if (d.kind === "section") {
    const sections = (ws.value?.sections || []).map(s => s.title);
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
    const srcSec = ws.value.sections.find(s => s.title === d.payload.sectionTitle);
    const tgtSec = ws.value.sections.find(s => s.title === targetTitle);
    if (!srcSec || !tgtSec) return endDrag();
    const tgtLabels = tgtSec.items.map(i => i.label).filter(l => l !== d.payload.label).concat([d.payload.label]);
    lifeos.setItemOrder(lifeos.activeId, targetTitle, tgtLabels);
    const srcLabels = srcSec.items.map(i => i.label).filter(l => l !== d.payload.label);
    lifeos.setItemOrder(lifeos.activeId, d.payload.sectionTitle, srcLabels);
  }
  endDrag();
};
const dropOnItem = (e, sectionTitle, label) => {
  e.preventDefault(); e.stopPropagation();
  const d = drag.value;
  if (d.kind !== "item") return endDrag();
  if (d.payload.label === label && d.payload.sectionTitle === sectionTitle) return endDrag();
  const section = ws.value.sections.find(s => s.title === sectionTitle);
  if (!section) return endDrag();
  const labels = section.items.map(i => i.label);
  const targetIdx = labels.indexOf(label);
  // Remove dragged item from its source section first
  if (d.payload.sectionTitle !== sectionTitle) {
    const src = ws.value.sections.find(s => s.title === d.payload.sectionTitle);
    if (src) {
      const srcLabels = src.items.map(i => i.label).filter(l => l !== d.payload.label);
      lifeos.setItemOrder(lifeos.activeId, d.payload.sectionTitle, srcLabels);
    }
  }
  const next = labels.filter(l => l !== d.payload.label);
  next.splice(targetIdx, 0, d.payload.label);
  lifeos.setItemOrder(lifeos.activeId, sectionTitle, next);
  endDrag();
};

// ===== Creation =================================================
const addItem = (sectionTitle) => {
  const label = window.prompt(`New item in “${sectionTitle}” — name?`);
  if (!label) return;
  lifeos.addItem(lifeos.activeId, sectionTitle, { icon: "circle", label, meta: "Just added" });
};
const addSection = () => {
  const title = window.prompt(`New section in “${ws.value?.title}” — name?`);
  if (!title) return;
  lifeos.addSection(lifeos.activeId, title);
};

// Mini-workspace quick items
const quickItems = computed(() => (currentSection.value?.items || []).slice(0, 6));
const railEntry = computed(() => {
  const D = (window).LIFEOS_DATA;
  return D?.rail.find((r) => r.id === lifeos.activeId) || D?.railFooter.find((r) => r.id === lifeos.activeId);
});
</script>

<template>
  <section v-if="lifeos.wsCollapsed" class="workspace mini" data-figma-reference="5:49#detail-panel" :aria-label="`${ws?.title} quick access`">
    <button class="mini-id" :title="`Open ${ws?.title}`" :aria-label="`Open ${ws?.title}`" @click="lifeos.toggleWs">
      <Icon :name="railEntry?.icon || 'layers'" :size="16" />
    </button>
    <div class="mini-actions">
      <button class="mini-btn" title="Search · ⌘K" aria-label="Search" @click="lifeos.toggleWs"><Icon name="search" :size="14" /></button>
      <button class="mini-btn primary" :title="`New in ${ws?.title}`" :aria-label="`New in ${ws?.title}`"><Icon name="plus" :size="14" /></button>
      <button class="mini-btn" title="Ask LifeOS" aria-label="Ask LifeOS"><Icon name="sparkles" :size="14" /></button>
    </div>
    <template v-if="currentSection">
      <div class="mini-sep" aria-hidden="true" />
      <div class="mini-section-label" :title="currentSection.title">
        {{ currentSection.title.split(' ').map(w => w[0]).join('').slice(0, 2) }}
      </div>
      <nav class="mini-list">
        <button v-for="(item, i) in quickItems" :key="i"
                :class="['mini-row', { active: item.active }]"
                :title="`${item.label}${item.meta ? ' · ' + item.meta : ''}`"
                :aria-label="item.label"
                @click="lifeos.toggleWs">
          <span class="mini-row-ico">
            <Icon :name="item.icon || 'circle'" :size="14" />
            <span v-if="item.status" class="mini-row-status"
                  :style="{ background: item.status === 'warn' ? 'var(--status-warn)' : 'var(--lifeos-green)' }" />
          </span>
          <span v-if="item.badge" :class="['mini-row-badge', `tone-${item.badge.tone || 'err'}`]">
            {{ item.badge.count > 99 ? '99+' : item.badge.count }}
          </span>
        </button>
      </nav>
    </template>
    <button class="mini-expand" title="Open workspace panel" aria-label="Open workspace panel" @click="lifeos.toggleWs">
      <Icon name="chevrons-right" :size="14" />
    </button>
  </section>

  <section v-else class="workspace" data-figma-reference="5:49#detail-panel" :data-workspace="lifeos.activeId" :aria-label="`${ws?.title || 'Workspace'} panel`">
    <header class="ws-head">
      <div class="ws-selector" ref="selRef">
        <button :class="['ws-selector-trigger', { open }]"
                :aria-expanded="open"
                aria-haspopup="listbox"
                :aria-label="`${ws?.title} — switch section`"
                @click="open = !open">
          <span class="ws-selector-ws">{{ ws?.title }}</span>
          <span class="ws-selector-sep">·</span>
          <h2>{{ currentSection?.title || '—' }}</h2>
          <Icon name="chevron-down" :size="14" class="ws-selector-chev"
                :style="{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }" />
        </button>
        <div v-if="open" class="ws-selector-menu" role="listbox">
          <div class="ws-selector-eyebrow">{{ ws?.title }} — sections</div>
          <button v-for="s in (ws?.sections || [])" :key="s.title"
                  :class="['ws-selector-option', { active: s.title === currentSection?.title }]"
                  role="option"
                  :aria-selected="s.title === currentSection?.title"
                  @click="jumpToSection(s.title)">
            <span class="opt-ico"><Icon :name="s.items?.[0]?.icon || 'circle'" :size="14" /></span>
            <span class="opt-label">{{ s.title }}</span>
            <span class="opt-count">{{ s.items?.length || 0 }}</span>
            <Icon v-if="s.title === currentSection?.title" name="check" :size="12" class="opt-check" />
          </button>
        </div>
      </div>
      <button class="ws-collapse" title="Close workspace panel" aria-label="Close workspace panel" @click="lifeos.toggleWs">
        <Icon name="chevron-left" :size="14" />
      </button>
    </header>

    <div class="ws-body">
      <div v-if="ws?.synced" class="ws-synced-banner">
        <Icon name="link" :size="11" />
        <span>Synced view — aggregated from your workspaces</span>
      </div>
      <div class="ws-search">
        <Icon name="search" :size="14" />
        <!-- Hand off to the command palette (Phase 4 #2). Native focus opens CmdK. -->
        <input :placeholder="`Search ${ws?.title?.toLowerCase() || ''}…`"
               aria-label="Search this workspace"
               readonly
               @focus="(e) => { e.target.blur(); lifeos.openCmdk(''); }"
               @click="lifeos.openCmdk('')"
               @keydown="lifeos.openCmdk('')" />
        <kbd class="kbd">⌘K</kbd>
      </div>

      <div v-for="section in (ws?.sections || [])" :key="section.title"
           class="ws-section"
           :class="{ 'is-drop-target': drag.overSection === section.title && drag.kind === 'section', 'is-collapsed': isCollapsed(section.title) }"
           :data-section-anchor="section.title"
           draggable="true"
           @dragstart="startSectionDrag($event, section.title)"
           @dragover="onDragOver"
           @dragenter="onSectionDragEnter(section.title)"
           @drop="dropOnSection($event, section.title)"
           @dragend="endDrag">
        <div class="ws-section-title" role="button"
             :aria-expanded="!isCollapsed(section.title)"
             tabindex="0"
             @click="toggleCollapsed(section.title)"
             @keydown.enter.prevent="toggleCollapsed(section.title)"
             @keydown.space.prevent="toggleCollapsed(section.title)">
          <span class="ws-section-grip" aria-hidden="true"><Icon name="grip-vertical" :size="11" /></span>
          <span class="ws-section-name">{{ section.title }}</span>
          <span class="ws-section-count">{{ section.items?.length || 0 }}</span>
          <Icon name="chevron-down" :size="12"
                class="ws-section-chev"
                :style="{ transform: isCollapsed(section.title) ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform .18s' }" />
        </div>
        <template v-if="!isCollapsed(section.title)">
          <template v-for="(item, i) in section.items" :key="`${section.title}-${item.label}-${i}`">
            <div :data-expand-key="`${section.title}-${i}`"
                 :class="['draggable-item', { 'is-drop-target': drag.kind === 'item' && drag.overItem?.sectionTitle === section.title && drag.overItem?.label === item.label }]"
                 draggable="true"
                 @dragstart="startItemDrag($event, section.title, item)"
                 @dragover.stop="onDragOver"
                 @dragenter.stop="onItemDragEnter(section.title, item.label)"
                 @drop.stop="dropOnItem($event, section.title, item.label)"
                 @dragend.stop="endDrag">
              <MenuRow :item="{ ...item, active: lifeos.activeSub?.sectionTitle === section.title && lifeos.activeSub?.item?.label === item.label }"
                       @click="nav.pickSub(item, section.title)" />
              <div v-if="item._origin" class="origin-tag" aria-hidden="true">
                <Icon name="link" :size="10" /> {{ item._origin.workspaceTitle }}
              </div>
            </div>
          </template>
          <button class="ws-add-row" @click="addItem(section.title)" :title="`Add to ${section.title}`">
            <Icon name="plus" :size="13" />
            <span>Add to {{ section.title }}</span>
          </button>
        </template>
      </div>

      <button class="ws-add-section" @click="addSection" :title="`Add a section to ${ws?.title}`">
        <Icon name="plus" :size="14" />
        <span>New section</span>
      </button>
    </div>
  </section>
</template>
