<script setup>
// LifeOS — KeyboardHelp SFC
// Triggered by pressing `?` anywhere outside inputs. Shows a centered two-column
// shortcut reference. Dismiss via `?`, `Escape`, or clicking the backdrop.

import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";

const helpOpen = ref(false);
const dialogRef = ref(null);

const open = async () => {
  helpOpen.value = true;
  await nextTick();
  dialogRef.value?.focus();
};

const close = () => { helpOpen.value = false; };

const toggle = () => { helpOpen.value ? close() : open(); };

const onGlobalKey = (e) => {
  // Let inputs handle their own keys
  const tag = e.target?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;

  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    toggle();
    return;
  }
  if (e.key === "Escape" && helpOpen.value) {
    e.preventDefault();
    close();
  }
};

const onBackdropMousedown = (e) => {
  if (e.target === e.currentTarget) close();
};

onMounted(() => document.addEventListener("keydown", onGlobalKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onGlobalKey));

// Shortcut data — grouped for the two-column layout.
const GROUPS = [
  {
    label: "Global",
    items: [
      { keys: ["⌘K", "Ctrl+K"], desc: "Open command palette" },
      { keys: ["?"],             desc: "Show keyboard shortcuts" },
      { keys: ["Esc"],           desc: "Close overlay or dialog" },
      { keys: ["⌘,", "Ctrl+,"], desc: "Open settings" },
    ],
  },
  {
    label: "Navigation",
    items: [
      { keys: ["1–6"],    desc: "Jump to workspace 1–6" },
      { keys: ["g", "s"], desc: "Go to settings", seq: true },
      { keys: ["g", "d"], desc: "Go to dashboard", seq: true },
    ],
  },
  {
    label: "Lights",
    items: [
      { keys: ["←", "→"], desc: "Cycle scene" },
      { keys: ["Space"],   desc: "Toggle focused light" },
      { keys: ["Tab"],     desc: "Move focus" },
    ],
  },
  {
    label: "Command palette",
    items: [
      { keys: ["↑", "↓"], desc: "Navigate results" },
      { keys: ["Enter"],   desc: "Open selected" },
      { keys: ["Esc"],     desc: "Close palette" },
    ],
  },
];
</script>

<template>
  <Teleport to="body">
    <div v-if="helpOpen"
         class="khelp-overlay"
         @mousedown="onBackdropMousedown">
      <div ref="dialogRef"
           class="khelp-panel"
           role="dialog"
           aria-modal="true"
           aria-labelledby="khelp-heading"
           tabindex="-1">
        <header class="khelp-header">
          <h2 id="khelp-heading" class="khelp-title">Keyboard shortcuts</h2>
          <button class="khelp-close"
                  aria-label="Close keyboard shortcuts"
                  @click="close">
            <kbd class="kbd">Esc</kbd>
          </button>
        </header>

        <div class="khelp-body">
          <div v-for="group in GROUPS" :key="group.label" class="khelp-group">
            <div class="khelp-group-label">{{ group.label }}</div>
            <div v-for="(item, i) in group.items" :key="i" class="khelp-row">
              <span class="khelp-keys">
                <template v-if="item.seq">
                  <template v-for="(k, ki) in item.keys" :key="ki">
                    <kbd class="kbd">{{ k }}</kbd>
                    <span v-if="ki < item.keys.length - 1" class="khelp-then" aria-hidden="true"> then </span>
                  </template>
                </template>
                <template v-else>
                  <template v-for="(k, ki) in item.keys" :key="ki">
                    <kbd class="kbd">{{ k }}</kbd>
                    <span v-if="ki < item.keys.length - 1" class="khelp-sep" aria-hidden="true">·</span>
                  </template>
                </template>
              </span>
              <span class="khelp-desc">{{ item.desc }}</span>
            </div>
          </div>
        </div>

        <footer class="khelp-footer">
          Press <kbd class="kbd">?</kbd> or <kbd class="kbd">Esc</kbd> to close
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.khelp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: 24px;
}

.khelp-panel {
  background: var(--bg-1);
  border: 1px solid var(--bg-4);
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, .6);
  width: 100%;
  max-width: 720px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  outline: none;
}

.khelp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--bg-3);
  flex-shrink: 0;
}

.khelp-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-1);
  letter-spacing: .01em;
}

.khelp-close {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.khelp-body {
  overflow-y: auto;
  padding: 20px 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px 32px;
  flex: 1;
  min-height: 0;
}

.khelp-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.khelp-group-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--fg-3);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--bg-3);
}

.khelp-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.khelp-keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-width: 100px;
}

.khelp-sep {
  font-size: 10px;
  color: var(--fg-3);
}

.khelp-then {
  font-size: 10px;
  color: var(--fg-3);
}

.khelp-desc {
  font-size: 12px;
  color: var(--fg-2);
  flex: 1;
}

.khelp-footer {
  padding: 12px 24px;
  border-top: 1px solid var(--bg-3);
  font-size: 11px;
  color: var(--fg-3);
  text-align: center;
  flex-shrink: 0;
}
</style>
