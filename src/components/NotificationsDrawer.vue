<script setup>
// LifeOS — NotificationsDrawer SFC
// Persistent notification inbox, opened from the bell icon in the rail footer.
// Teleported to body. Not a true modal (no focus trap, aria-modal="false") —
// user can keep working while the drawer is visible.

import { computed, watch, ref, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const closeRef = ref(null);

// All notifications from the global, minus dismissed ones.
const visible = computed(() => {
  const all = (window).LIFEOS_DATA?.notifications || [];
  const dismissed = lifeos.dismissedNotificationIds;
  return all.filter((n) => !dismissed.includes(n.id));
});

const unreadCount = computed(() =>
  visible.value.filter(
    (n) => n.unread && !lifeos.readNotificationIds.includes(n.id),
  ).length,
);

function isRead(n) {
  return !n.unread || lifeos.readNotificationIds.includes(n.id);
}

function onDismiss(id) {
  lifeos.dismissNotification(id);
}

function onMarkAllRead() {
  lifeos.markAllNotificationsRead();
}

function onClose() {
  lifeos.closeNotificationsDrawer();
}

// Move focus to the close button when the drawer opens.
watch(
  () => lifeos.notificationsDrawerOpen,
  (open) => {
    if (open) {
      nextTick(() => {
        closeRef.value?.focus();
      });
    }
  },
);

// ESC closes the drawer.
function onKeydown(e) {
  if (e.key === "Escape" && lifeos.notificationsDrawerOpen) {
    lifeos.closeNotificationsDrawer();
  }
}

// Backdrop click closes (click on the overlay area outside the panel).
function onBackdropClick(e) {
  if (e.target === e.currentTarget) {
    lifeos.closeNotificationsDrawer();
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="lifeos.notificationsDrawerOpen"
      class="notif-backdrop"
      aria-hidden="true"
      @click="onBackdropClick"
    >
      <div
        class="notif-drawer"
        data-figma-reference="5:49#temporary-panels"
        role="dialog"
        aria-modal="false"
        aria-labelledby="notif-title"
      >
        <!-- Header -->
        <header class="notif-header">
          <div class="notif-header-left">
            <h2 id="notif-title" class="notif-heading">Notifications</h2>
            <span v-if="unreadCount > 0" class="notif-unread-chip" :aria-label="`${unreadCount} unread`">
              {{ unreadCount }}
            </span>
          </div>
          <div class="notif-header-actions">
            <button
              class="notif-action-btn"
              :disabled="unreadCount === 0"
              aria-label="Mark all notifications as read"
              @click="onMarkAllRead"
            >
              Mark all as read
            </button>
            <button
              ref="closeRef"
              class="notif-close-btn"
              aria-label="Close notifications"
              @click="onClose"
            >
              <Icon name="x" :size="16" />
            </button>
          </div>
        </header>

        <!-- Body -->
        <div class="notif-body">
          <!-- Empty state -->
          <div v-if="visible.length === 0" class="notif-empty">
            <Icon name="sparkles" :size="24" />
            <span>All caught up.</span>
          </div>

          <!-- Notification list -->
          <ul v-else role="list" aria-label="Notifications" class="notif-list">
            <li
              v-for="n in visible"
              :key="n.id"
              role="listitem"
              :class="['notif-item', { 'notif-item--unread': !isRead(n) }]"
            >
              <span
                class="notif-icon-wrap"
                :class="`tone-bg-${n.tone}`"
                aria-hidden="true"
              >
                <Icon :name="n.icon" :size="14" />
              </span>
              <div class="notif-content">
                <p class="notif-title">{{ n.title }}</p>
                <p class="notif-body-text">{{ n.body }}</p>
                <p class="notif-meta mono">{{ n.source }} · {{ n.ts }}</p>
              </div>
              <button
                class="notif-dismiss-btn"
                :aria-label="`Dismiss: ${n.title}`"
                @click="onDismiss(n.id)"
              >
                <Icon name="x" :size="12" />
              </button>
            </li>
          </ul>
        </div>

        <!-- Footer -->
        <footer class="notif-footer mono">
          {{ visible.length }} notification{{ visible.length !== 1 ? 's' : '' }} · {{ unreadCount }} unread
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Backdrop — click-to-close, not a blocking overlay */
.notif-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  pointer-events: none; /* let clicks pass through except on the drawer */
}

/* The drawer panel */
.notif-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 360px;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
  border-left: 1px solid var(--bg-3);
  box-shadow: var(--shadow-xl);
  pointer-events: all;
  transform: translateX(0);
  animation: notif-slide-in var(--duration-standard, 200ms) var(--ease-out, ease-out);
}

@keyframes notif-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}

/* Header */
.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--bg-3);
  flex-shrink: 0;
}

.notif-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notif-heading {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-0);
  margin: 0;
}

.notif-unread-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--lifeos-cyan);
  color: var(--text-on-brand, #000);
  font-size: 10px;
  font-weight: 700;
}

.notif-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notif-action-btn {
  padding: 4px 10px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--bg-4);
  color: var(--fg-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.notif-action-btn:hover:not(:disabled) {
  background: var(--bg-2);
  color: var(--fg-0);
  border-color: var(--bg-5);
}
.notif-action-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.notif-close-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--bg-4);
  color: var(--fg-2);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.notif-close-btn:hover {
  background: var(--bg-2);
  color: var(--fg-0);
  border-color: var(--bg-5);
}

/* Body — scrollable list */
.notif-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* Empty state */
.notif-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  min-height: 200px;
  color: var(--fg-3);
  font-size: 13px;
}
.notif-empty .lucide,
.notif-empty svg {
  color: var(--fg-3);
}

/* Notification list */
.notif-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* Notification item */
.notif-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--bg-2);
  position: relative;
  transition: background 0.12s;
}
.notif-item:last-child {
  border-bottom: 0;
}
.notif-item:hover {
  background: var(--bg-2);
}

/* Unread — 2px left accent stripe (cyan) */
.notif-item--unread::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--lifeos-cyan);
  border-radius: 0 1px 1px 0;
}

/* Icon wrapper tinted by tone */
.notif-icon-wrap {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  margin-top: 1px;
}
.tone-bg-cyan   { background: var(--tint-cyan-medium,   rgba(0,212,255,.14));   color: var(--lifeos-cyan); }
.tone-bg-purple { background: var(--tint-purple-medium, rgba(155,123,255,.14)); color: var(--lifeos-purple); }
.tone-bg-green  { background: var(--tint-green-medium,  rgba(0,230,118,.14));   color: var(--lifeos-green); }
.tone-bg-warn   { background: rgba(255,176,32,.14);                              color: var(--status-warn); }
.tone-bg-err    { background: rgba(255,77,106,.14);                              color: var(--status-err); }
.tone-bg-ok     { background: var(--tint-green-medium,  rgba(0,230,118,.14));   color: var(--lifeos-green); }

/* Content */
.notif-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notif-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-0);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notif-body-text {
  font-size: 11px;
  color: var(--fg-3);
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.notif-meta {
  font-size: 10px;
  color: var(--fg-3);
  margin: 2px 0 0;
}

/* Dismiss button */
.notif-dismiss-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  background: transparent;
  border: 0;
  color: var(--fg-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
  margin-top: 1px;
}
.notif-item:hover .notif-dismiss-btn {
  opacity: 1;
}
.notif-dismiss-btn:hover {
  background: var(--bg-3);
  color: var(--fg-0);
}

/* Footer */
.notif-footer {
  flex-shrink: 0;
  padding: 10px 16px;
  border-top: 1px solid var(--bg-3);
  font-size: 10px;
  color: var(--fg-3);
}

.mono {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
</style>
