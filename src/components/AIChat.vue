<script setup>
// LifeOS — AIChat SFC
// Lightweight popup chat panel anchored to the AI avatar. Prototype-grade:
// keeps a local message log + canned reply. Wire to real LifeOS via store later.

import { ref, nextTick, onMounted, onBeforeUnmount, computed } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();

const props = defineProps({
  anchor: { type: Object, required: true }, // { x, y }
});
defineEmits(["close"]);

// Position the chat above-and-left of the avatar.
const PANEL_W = 360, PANEL_H = 420;
const panelStyle = computed(() => {
  const x = Math.max(16, Math.min(window.innerWidth  - PANEL_W - 16, props.anchor.x - PANEL_W + 76));
  const y = Math.max(16, props.anchor.y - PANEL_H - 12);
  return { left: x + "px", top: y + "px", width: PANEL_W + "px", height: PANEL_H + "px" };
});

const messages = computed(() => lifeos.aiMessages);
const draft = ref("");
const scroller = ref(null);

// Multi-modal input state
const micOn = ref(false);
const camOn = ref(false);
const moreOpen = ref(false);
const moreRef = ref(null);
const fileInput = ref(null);
const attachments = ref([]);

const ATTACH_META = {
  screen:  { icon: "monitor",  label: "Screen share" },
  image:   { icon: "image",    label: "Image" },
  audio:   { icon: "music",    label: "Audio clip" },
  link:    { icon: "link",     label: "Link" },
  agent:   { icon: "users-2",  label: "Agent hand-off" },
  command: { icon: "terminal", label: "Slash command" },
  file:    { icon: "file",     label: "File" },
};
const addAttach = (kind) => {
  attachments.value.push({ ...ATTACH_META[kind], kind });
  moreOpen.value = false;
};
const pickFile = () => fileInput.value?.click();
const onFiles = (e) => {
  const files = e.target.files || [];
  for (const f of files) attachments.value.push({ icon: "file", label: f.name, kind: "file" });
  e.target.value = "";
};

// Close "more" menu on outside click / Escape
const onDocMouse = (e) => { if (moreOpen.value && moreRef.value && !moreRef.value.contains(e.target)) moreOpen.value = false; };
const onDocKey   = (e) => { if (e.key === "Escape") moreOpen.value = false; };
onMounted(() => { document.addEventListener("mousedown", onDocMouse); document.addEventListener("keydown", onDocKey); });
onBeforeUnmount(() => { document.removeEventListener("mousedown", onDocMouse); document.removeEventListener("keydown", onDocKey); });

const send = async () => {
  const text = draft.value.trim();
  if (!text && attachments.value.length === 0) return;
  const attachLabel = attachments.value.length
    ? ` · ${attachments.value.length} attachment${attachments.value.length === 1 ? "" : "s"}`
    : "";
  lifeos.sendAiMessage((text || "(no message)") + attachLabel, { source: "chat" });
  draft.value = "";
  attachments.value = [];
  await nextTick();
  scroller.value?.scrollTo({ top: 1e9, behavior: "smooth" });
};

const handleKey = (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
};

onMounted(async () => {
  await nextTick();
  scroller.value?.scrollTo({ top: 1e9 });
});
</script>

<template>
  <div class="ai-chat" :style="panelStyle" role="dialog" aria-label="LifeOS AI chat">
    <header class="ai-chat-head">
      <span class="ai-chat-id">
        <span class="ai-chat-dot" />
        <strong>LifeOS</strong>
        <span class="ai-chat-meta">online · context: {{ lifeos.workspace?.title || 'overview' }}</span>
      </span>
      <button class="ai-chat-close" @click="$emit('close')" aria-label="Close chat">
        <Icon name="x" :size="14" />
      </button>
    </header>
    <div class="ai-chat-log" ref="scroller">
      <div v-for="(m, i) in messages" :key="i" :class="['ai-chat-msg', m.role]">
        <span class="ai-chat-bubble">{{ m.text }}</span>
      </div>
    </div>
    <form class="ai-chat-input" @submit.prevent="send">
      <div class="ai-chat-tools" role="toolbar" aria-label="Input modalities">
        <button type="button" class="ai-chat-tool" :class="{ active: micOn }" :aria-pressed="micOn"
                @click="micOn = !micOn" title="Voice · push-to-talk" aria-label="Toggle mic">
          <Icon :name="micOn ? 'mic' : 'mic-off'" :size="14" />
        </button>
        <button type="button" class="ai-chat-tool" :class="{ active: camOn }" :aria-pressed="camOn"
                @click="camOn = !camOn" title="Video · share what you see" aria-label="Toggle camera">
          <Icon :name="camOn ? 'video' : 'video-off'" :size="14" />
        </button>
        <button type="button" class="ai-chat-tool" @click="pickFile" title="Upload file or folder" aria-label="Upload">
          <Icon name="folder-up" :size="14" />
        </button>
        <input type="file" multiple ref="fileInput" hidden @change="onFiles" />
        <div class="ai-chat-tool-more" ref="moreRef">
          <button type="button" class="ai-chat-tool" :class="{ active: moreOpen }" :aria-expanded="moreOpen"
                  @click="moreOpen = !moreOpen" title="More inputs" aria-label="More inputs">
            <Icon name="plus" :size="14" />
          </button>
          <div v-if="moreOpen" class="ai-chat-more-menu" role="menu">
            <button type="button" @click="addAttach('screen')" role="menuitem"><Icon name="monitor" :size="13" /> Share screen</button>
            <button type="button" @click="addAttach('image')"  role="menuitem"><Icon name="image" :size="13" /> Image</button>
            <button type="button" @click="addAttach('audio')"  role="menuitem"><Icon name="music" :size="13" /> Audio clip</button>
            <button type="button" @click="addAttach('link')"   role="menuitem"><Icon name="link" :size="13" /> Paste link</button>
            <button type="button" @click="addAttach('agent')"  role="menuitem"><Icon name="users-2" :size="13" /> Hand-off to agent</button>
            <button type="button" @click="addAttach('command')"role="menuitem"><Icon name="terminal" :size="13" /> Slash command</button>
          </div>
        </div>
      </div>
      <div class="ai-chat-row">
        <input v-model="draft"
               @keydown="handleKey"
               placeholder="Ask LifeOS anything · ↵ to send"
               aria-label="Message LifeOS"
               autocomplete="off" />
        <button type="submit" class="ai-chat-send" aria-label="Send" :disabled="!draft.trim() && attachments.length === 0">
          <Icon name="send" :size="14" />
        </button>
      </div>
      <ul v-if="attachments.length" class="ai-chat-attachments" aria-label="Pending attachments">
        <li v-for="(a, i) in attachments" :key="i">
          <Icon :name="a.icon" :size="11" />
          <span>{{ a.label }}</span>
          <button type="button" class="ai-chat-attach-x" @click="attachments.splice(i, 1)" aria-label="Remove attachment"><Icon name="x" :size="10" /></button>
        </li>
      </ul>
    </form>
  </div>
</template>
