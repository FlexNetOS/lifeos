<script setup>
// LifeOS — AIAvatar SFC
// Floating, draggable robot avatar that toggles the AI chat. Hidden if
// lifeos.aiAvatarHidden is true. Position persists in the store.

import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import Icon from "./Icon.vue";
import AIChat from "./AIChat.vue";

const lifeos = useLifeos();

// Default position: bottom-right with 24px margin.
const x = ref(0);
const y = ref(0);
const placeAtDefault = () => {
  const w = window.innerWidth, h = window.innerHeight;
  x.value = lifeos.avatarPos?.x ?? (w - 76 - 24);
  y.value = lifeos.avatarPos?.y ?? (h - 76 - 24);
};
onMounted(placeAtDefault);

const drag = ref({ active: false, dx: 0, dy: 0, moved: false });

const onPointerDown = (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  drag.value = { active: true, dx: e.clientX - x.value, dy: e.clientY - y.value, moved: false };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
};
const onPointerMove = (e) => {
  if (!drag.value.active) return;
  const nx = Math.max(8, Math.min(window.innerWidth  - 76 - 8, e.clientX - drag.value.dx));
  const ny = Math.max(8, Math.min(window.innerHeight - 76 - 8, e.clientY - drag.value.dy));
  if (Math.abs(nx - x.value) > 2 || Math.abs(ny - y.value) > 2) drag.value.moved = true;
  x.value = nx;
  y.value = ny;
};
const onPointerUp = () => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  if (drag.value.moved) lifeos.setAvatarPos(x.value, y.value);
  // If no drag happened, treat as click → toggle chat.
  if (!drag.value.moved) lifeos.toggleAiChat();
  drag.value = { active: false, dx: 0, dy: 0, moved: false };
};

const onResize = () => {
  // Keep avatar inside the viewport if window shrinks.
  if (x.value > window.innerWidth  - 76 - 8) x.value = Math.max(8, window.innerWidth  - 76 - 8);
  if (y.value > window.innerHeight - 76 - 8) y.value = Math.max(8, window.innerHeight - 76 - 8);
};
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
</script>

<template>
  <div v-if="!lifeos.aiAvatarHidden">
    <button class="ai-avatar"
            :class="{ dragging: drag.active, 'chat-open': lifeos.aiChatOpen }"
            :style="{ left: x + 'px', top: y + 'px' }"
            @pointerdown="onPointerDown"
            :aria-label="lifeos.aiChatOpen ? 'Close AI chat' : 'Open AI chat'"
            :aria-pressed="lifeos.aiChatOpen"
            title="Click to chat · drag to move">
      <Icon :name="lifeos.aiChatOpen ? 'x' : 'bot'" :size="22" />
      <span class="ai-avatar-pulse" aria-hidden="true" />
    </button>
    <AIChat v-if="lifeos.aiChatOpen"
            :anchor="{ x, y }"
            @close="lifeos.closeAiChat()" />
  </div>
</template>
