<script setup>
// LifeOS — MenuRow SFC
// Renders a section item inside the workspace panel.

import Icon from "./Icon.vue";
import Badge from "./Badge.vue";

defineProps({
  item: { type: Object, required: true },
  collapsed: { type: Boolean, default: false },
});

defineEmits(["click"]);
</script>

<template>
  <div :class="['menu-row', { active: item.active, collapsed }]"
       :title="collapsed ? item.label : undefined"
       role="button"
       tabindex="0"
       @click="$emit('click', item)"
       @keydown.enter.prevent="$emit('click', item)"
       @keydown.space.prevent="$emit('click', item)">
    <span class="lead">
      <Icon :name="item.icon || 'circle'" :size="16" />
      <span v-if="item.status" class="lead-status">
        <Badge dot :tone="item.status === 'warn' ? 'warn' : 'ok'" />
      </span>
      <Badge v-if="collapsed && item.badge" v-bind="item.badge" />
    </span>
    <template v-if="!collapsed">
      <span class="body">
        <span class="label">{{ item.label }}</span>
        <span v-if="item.meta" class="meta">{{ item.meta }}</span>
      </span>
      <span v-if="item.badge" class="trail"><Badge v-bind="item.badge" /></span>
      <kbd v-if="item.shortcut" class="kbd">{{ item.shortcut }}</kbd>
    </template>
  </div>
</template>
