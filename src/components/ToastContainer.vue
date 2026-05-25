<script setup>
// LifeOS — ToastContainer SFC
// Global toast notification layer. Teleports to <body> and stacks at bottom-right,
// above the AI avatar bubble. Auto-dismisses after 3.5 s; hover pauses the timer.

import { useToasts } from "@/stores/toasts.js";
import Icon from "./Icon.vue";

const toasts = useToasts();

const VARIANT_ICON = {
  info:    "info",
  success: "check-circle",
  warn:    "alert-triangle",
  error:   "x-circle",
};

const VARIANT_ROLE = {
  info:    "status",
  success: "status",
  warn:    "alert",
  error:   "alert",
};
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
      <TransitionGroup name="toast" tag="div" class="toast-inner" move-class="toast-move">
        <div
          v-for="toast in toasts.items"
          :key="toast.id"
          :class="['toast-item', `toast-${toast.variant}`]"
          :role="VARIANT_ROLE[toast.variant]"
          @mouseenter="toasts.pauseTimer(toast.id)"
          @mouseleave="toasts.resumeTimer(toast.id)"
        >
          <span class="toast-icon" aria-hidden="true">
            <Icon :name="VARIANT_ICON[toast.variant]" :size="16" />
          </span>
          <span class="toast-message">{{ toast.message }}</span>
          <button
            class="toast-close"
            type="button"
            :aria-label="`Dismiss notification: ${toast.message}`"
            @click="toasts.dismiss(toast.id)"
          >
            <Icon name="x" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: 9100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
}

.toast-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-end;
}

.toast-item {
  pointer-events: all;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  width: 320px;
  padding: var(--space-3) var(--space-4);
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  border-left-width: 4px;
  font: 400 var(--text-md)/1.5 var(--font-sans);
  color: var(--text-primary);
}

/* Variant left-border accents */
.toast-info    { border-left-color: var(--lifeos-cyan); }
.toast-success { border-left-color: var(--lifeos-green); }
.toast-warn    { border-left-color: var(--status-warn); }
.toast-error   { border-left-color: var(--status-err); }

/* Variant icon colors */
.toast-info    .toast-icon { color: var(--lifeos-cyan); }
.toast-success .toast-icon { color: var(--lifeos-green); }
.toast-warn    .toast-icon { color: var(--status-warn); }
.toast-error   .toast-icon { color: var(--status-err); }

.toast-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-top: 1px;
}

.toast-message {
  flex: 1;
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  transition: color 0.15s, background 0.15s;
}

.toast-close:hover {
  color: var(--text-primary);
  background: var(--surface-card-hover);
}

.toast-close:focus-visible {
  outline: 2px solid var(--lifeos-cyan);
  outline-offset: 2px;
}

/* Slide-in from right + fade */
.toast-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
.toast-move {
  transition: transform 0.18s ease;
}
</style>
