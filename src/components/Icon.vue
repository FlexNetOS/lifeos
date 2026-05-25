<script setup>
// LifeOS — Icon SFC
import { computed } from "vue";
import { icons } from "@/lib/icons";

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 },
  strokeWidth: { type: Number, default: 1.75 },
});

const Comp = computed(() => icons[props.name] || null);
</script>

<template>
  <component :is="Comp"
             v-if="Comp"
             :size="size"
             :stroke-width="strokeWidth"
             aria-hidden="true" />
  <span v-else
        :style="{ display: 'inline-block', width: size + 'px', height: size + 'px' }"
        aria-hidden="true" />
</template>
