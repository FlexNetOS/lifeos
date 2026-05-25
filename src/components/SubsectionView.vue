<script setup>
// LifeOS — SubsectionView SFC
// Renders the per-subsection dashboard on the main canvas.

import { computed } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { resolveWorkspace } from "@/lib/resolve.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const TONE = (window).TONE || {};

const sub = computed(() => lifeos.activeSub);
const ws = computed(() => sub.value ? resolveWorkspace(sub.value.workspaceId) : null);
const item = computed(() => sub.value?.item);

const childTone = (c) => {
  const t = c.status === "warn" ? "warn" : (c.status === "good" || c.status === "online") ? "ok" : "neutral";
  return TONE[t] || { bg: "var(--bg-3)", fg: "var(--fg-1)", bd: "var(--bg-4)" };
};

// Empty-state hints keyed by section title — pulled from data, not hardcoded per-component.
const SECTION_HINTS = {
  "Files":        "Show recent edits · Find old backups · Tag favorites",
  "Legal":        "Surface upcoming deadlines · Review unsigned docs · Check renewals",
  "Finance":      "Show spending trends · Flag overdue invoices · Project cash flow",
  "Sales":        "Show pipeline by stage · Surface stale leads · Draft follow-ups",
  "Marketing":    "Show campaign performance · Surface scheduled posts · Suggest next content",
  "Operations":   "Show system health · Flag open tickets · Review inventory alerts",
  "Contacts":     "Find people by role · Show recent conversations · Surface birthdays",
  "Analytics":    "Surface top KPIs · Show trend anomalies · Suggest an export",
  "Health":       "Show weekly activity · Surface sleep trends · Log today's metrics",
  "Wallet":       "Show recent transactions · Flag large charges · Summarize spending",
  "Social Media": "Show pending mentions · Draft a reply · Schedule a post",
  "Family":       "Show family schedule · Surface shared tasks · Check safe-zone status",
  "Photos":       "Show recent shots · Find a memory · Start a shared album",
  "Videos":       "Show new recordings · Review watchlist · Find a clip by date",
  "IoT":          "Show device status · Flag offline sensors · Run a connectivity check",
  "Appliances":   "Show appliance schedules · Surface maintenance alerts · Set a timer",
  "Energy":       "Show usage breakdown · Compare to last month · Set an eco target",
  "Network":      "Show connected devices · Surface bandwidth hogs · Run a speed test",
  "Knowledge":    "Search your notes · Surface recent insights · Ask what you've forgotten",
};

const emptyStateHint = computed(() => SECTION_HINTS[sub.value?.sectionTitle] || null);
</script>

<template>
  <div v-if="sub && item" class="canvas sub-canvas">
    <header class="sub-head">
      <button class="sub-back" title="Back to dashboard" aria-label="Back to dashboard" @click="lifeos.clearSub">
        <Icon name="arrow-left" :size="14" /> Dashboard
      </button>
      <div class="sub-breadcrumb">
        <span>{{ ws?.title }}</span>
        <Icon name="chevron-right" :size="12" />
        <span>{{ sub.sectionTitle }}</span>
        <Icon name="chevron-right" :size="12" />
        <strong>{{ item.label }}</strong>
      </div>
    </header>

    <section class="sub-hero">
      <div class="sub-hero-ico"><Icon :name="item.icon || 'circle'" :size="28" /></div>
      <div>
        <h1>{{ item.label }}</h1>
        <p v-if="item.meta" class="sub-hero-meta">{{ item.meta }}</p>
      </div>
      <span v-if="item.badge" :class="['sub-hero-badge', `tone-${item.badge.tone || 'err'}`]">
        {{ item.badge.count > 99 ? '99+' : item.badge.count }} new
      </span>
    </section>

    <div v-if="item.children && item.children.length" class="sub-children-grid">
      <div v-for="(c, i) in item.children" :key="i" class="sub-child-card"
           :style="{ borderColor: childTone(c).bd, animationDelay: i * 40 + 'ms' }">
        <div class="sub-child-dot"
             :style="{ background: childTone(c).fg, boxShadow: `0 0 8px ${childTone(c).fg}` }" />
        <div class="sub-child-body">
          <div class="sub-child-label">{{ c.label }}</div>
          <div v-if="c.meta" class="sub-child-meta">{{ c.meta }}</div>
        </div>
      </div>
    </div>
    <div v-else class="sub-empty">
      <Icon name="sparkles" :size="20" />
      <p>This subsection's dashboard isn't built out yet. Ask LifeOS what to surface here.</p>
      <p v-if="emptyStateHint" class="sub-empty-hint">What you can do here: {{ emptyStateHint }}</p>
    </div>
  </div>
</template>
