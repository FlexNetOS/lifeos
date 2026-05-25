<script setup>
// LifeOS — FilesView SFC
// Two-column files browser: folder tree on the left, recent files list on the right.
// Workspace-aware: reads window.LIFEOS_DATA.files[workspaceId] (work | personal).
// Folder click filters the recent list; clicking a recent file shows an info toast.

import { ref, computed } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useToasts } from "@/stores/toasts.js";
import { useNav } from "@/lib/nav.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const toasts = useToasts();
const nav = useNav();

const workspaceId = computed(() => lifeos.activeSub?.workspaceId || "");

const files = computed(() => {
  const ws = workspaceId.value;
  return (window).LIFEOS_DATA?.files?.[ws] || { folders: [], recent: [] };
});

const folderCount = computed(() => files.value.folders.length);
const recentCount = computed(() => files.value.recent.length);

// null = show all; string = folderId
const activeFolder = ref(null);

const visibleRecent = computed(() => {
  const id = activeFolder.value;
  if (!id) return files.value.recent;
  return files.value.recent.filter((r) => r.folderId === id);
});

const selectFolder = (folderId) => {
  activeFolder.value = activeFolder.value === folderId ? null : folderId;
};

const kindIcon = (kind) => {
  const map = {
    vue:  "file-code",
    ts:   "file-code",
    js:   "file-code",
    rs:   "file-code",
    css:  "file-code",
    html: "file-code",
    md:   "file-text",
    toml: "file-text",
    json: "file-json-2",
    png:  "image",
    pdf:  "file-text",
  };
  return map[kind] || "file";
};

const openFile = (file) => {
  toasts.info(`Opening ${file.label} — coming in the editor`);
};

const backToDashboard = () => nav.clearSub();
</script>

<template>
  <div class="canvas files-canvas" role="region" aria-label="Files">
    <div v-if="!files.folders.length && !files.recent.length" class="sub-empty">
      <Icon name="folder" :size="20" />
      <p>No files indexed yet. Ask LifeOS to scan your workspace.</p>
    </div>

    <div v-else class="files-main">
      <header class="lights-head">
        <div>
          <div class="canvas-eyebrow">
            {{ workspaceId === "work" ? "Work" : "Personal" }} · Files
          </div>
          <h1>Files</h1>
          <p class="lights-summary">{{ folderCount }} folders · {{ recentCount }} recent</p>
        </div>
        <button class="lights-back" type="button" @click="backToDashboard" aria-label="Back to dashboard">
          <Icon name="arrow-left" :size="14" /> Dashboard
        </button>
      </header>

      <div class="files-body">
        <!-- Folder tree -->
        <nav class="files-folder-nav" role="navigation" aria-label="File folders">
          <div class="files-folder-head">Folders</div>
          <button
            v-for="folder in files.folders"
            :key="folder.id"
            :class="['files-folder-row', { 'files-folder-row--active': activeFolder === folder.id }]"
            type="button"
            :aria-pressed="activeFolder === folder.id"
            :aria-label="`${folder.label}, ${folder.count} files`"
            @click="selectFolder(folder.id)"
          >
            <span class="files-folder-icon" aria-hidden="true">
              <Icon :name="folder.icon" :size="15" />
            </span>
            <span class="files-folder-label">{{ folder.label }}</span>
            <span class="files-folder-count" aria-hidden="true">{{ folder.count }}</span>
          </button>
          <button
            v-if="activeFolder !== null"
            class="files-folder-row files-folder-row--clear"
            type="button"
            @click="activeFolder = null"
            aria-label="Show all files"
          >
            <span class="files-folder-icon" aria-hidden="true">
              <Icon name="folder-open" :size="15" />
            </span>
            <span class="files-folder-label">All files</span>
          </button>
        </nav>

        <!-- Recent files list -->
        <section class="files-recent" aria-label="Recent files">
          <div class="files-recent-head">
            {{ activeFolder ? files.folders.find(f => f.id === activeFolder)?.label : "Recent" }}
            <span class="files-recent-count">{{ visibleRecent.length }}</span>
          </div>
          <div v-if="visibleRecent.length === 0" class="files-recent-empty">
            <Icon name="file" :size="16" />
            <span>No files in this folder.</span>
          </div>
          <ul v-else class="files-recent-list" role="list">
            <li
              v-for="file in visibleRecent"
              :key="file.id"
              class="files-recent-row"
              role="listitem"
              :aria-label="`${file.label}, ${file.kind}, ${file.size}`"
              tabindex="0"
              @click="openFile(file)"
              @keydown.enter="openFile(file)"
              @keydown.space.prevent="openFile(file)"
            >
              <span class="files-recent-icon" aria-hidden="true">
                <Icon :name="kindIcon(file.kind)" :size="14" />
              </span>
              <span class="files-recent-body">
                <span class="files-recent-label">{{ file.label }}</span>
                <span class="files-recent-path">{{ file.path }}</span>
              </span>
              <span class="files-recent-modified" aria-hidden="true">{{ file.modified }}</span>
              <span class="files-recent-size" aria-hidden="true">{{ file.size }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
