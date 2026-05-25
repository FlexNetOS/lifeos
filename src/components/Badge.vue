<script setup>
// LifeOS — Badge SFC
// Mirrors the React kit's Badge / Pill / StatusDot primitives.

defineProps({
  count: { type: Number, default: null },
  tone: { type: String, default: "ok" },          // info | warn | err | ok | purple | cyan | green | neutral
  pulse: { type: Boolean, default: false },
  dot: { type: Boolean, default: false },
  variant: { type: String, default: "count" },     // count | pill
});
</script>

<template>
  <span v-if="dot"
        class="status-dot"
        :class="{ pulse }"
        :style="{
          background: tone === 'warn' ? 'var(--status-warn)'
                    : tone === 'err'  ? 'var(--status-err)'
                                      : 'var(--lifeos-green)'
        }"
        aria-hidden="true" />
  <span v-else-if="variant === 'pill'"
        class="pill"
        :class="`tone-${tone || 'ok'}`">
    <slot />
  </span>
  <span v-else-if="count != null"
        class="count"
        :class="[`tone-${tone || 'err'}`, { 'pulse-ring': pulse }]">
    {{ count > 99 ? "99+" : count }}
  </span>
</template>
