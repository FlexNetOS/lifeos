<script>
  // LifeOS — FilesView SFC (Svelte port of FilesView.vue)
  // Two-column files browser: folder tree on the left, recent files list on the right.
  // Workspace-aware: reads window.LIFEOS_DATA.files[workspaceId] (work | personal).
  // Folder click filters the recent list; clicking a recent file shows an info toast.
  import { useLifeos } from "@/stores/lifeos-native";
  import { useToasts } from "@/stores/toasts-native";
  import { createNav } from "@/lib/svelte-nav.js";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { router as appRouter } from "@/router";
  import Icon from "./Icon.svelte";

  let { router = appRouter } = $props();

  const lifeos = useLifeos();
  const toasts = useToasts();
  let nav = $derived(createNav(router));
  const lifeosState = bindStore(lifeos, ["activeSub"]);

  let workspaceId = $derived(lifeosState.activeSub?.workspaceId || "");

  let files = $derived.by(() => {
    const ws = workspaceId;
    return globalThis.LIFEOS_DATA?.files?.[ws] || { folders: [], recent: [] };
  });

  let folderCount = $derived(files.folders.length);
  let recentCount = $derived(files.recent.length);

  // null = show all; string = folderId
  let activeFolder = $state(null);

  let visibleRecent = $derived.by(() => {
    const id = activeFolder;
    if (!id) return files.recent;
    return files.recent.filter((r) => r.folderId === id);
  });

  const selectFolder = (folderId) => {
    activeFolder = activeFolder === folderId ? null : folderId;
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

  // Vue: @keydown.enter="openFile(file)" + @keydown.space.prevent="openFile(file)"
  const onRecentRowKeydown = (e, file) => {
    if (e.key === "Enter") openFile(file);
    else if (e.key === " ") { e.preventDefault(); openFile(file); }
  };

  const backToDashboard = () => nav.clearSub();
</script>

<div class="canvas files-canvas" role="region" aria-label="Files">
  {#if !files.folders.length && !files.recent.length}
    <div class="sub-empty">
      <Icon name="folder" size={20} />
      <p>No files indexed yet. Ask LifeOS to scan your workspace.</p>
    </div>
  {:else}
    <div class="files-main">
      <header class="lights-head">
        <div>
          <div class="canvas-eyebrow">
            {workspaceId === "work" ? "Work" : "Personal"} · Files
          </div>
          <h1>Files</h1>
          <p class="lights-summary">{folderCount} folders · {recentCount} recent</p>
        </div>
        <button class="lights-back" type="button" onclick={backToDashboard} aria-label="Back to dashboard">
          <Icon name="arrow-left" size={14} /> Dashboard
        </button>
      </header>

      <div class="files-body">
        <!-- Folder tree -->
        <!-- svelte-ignore a11y_no_redundant_roles -->
        <!-- Explicit role="navigation" is queried by the spec suite and mirrors the Vue DOM. -->
        <nav class="files-folder-nav" role="navigation" aria-label="File folders">
          <div class="files-folder-head">Folders</div>
          {#each files.folders as folder (folder.id)}
            <button
              class="files-folder-row"
              class:files-folder-row--active={activeFolder === folder.id}
              type="button"
              aria-pressed={activeFolder === folder.id}
              aria-label={`${folder.label}, ${folder.count} files`}
              onclick={() => selectFolder(folder.id)}
            >
              <span class="files-folder-icon" aria-hidden="true">
                <Icon name={folder.icon} size={15} />
              </span>
              <span class="files-folder-label">{folder.label}</span>
              <span class="files-folder-count" aria-hidden="true">{folder.count}</span>
            </button>
          {/each}
          {#if activeFolder !== null}
            <button
              class="files-folder-row files-folder-row--clear"
              type="button"
              onclick={() => activeFolder = null}
              aria-label="Show all files"
            >
              <span class="files-folder-icon" aria-hidden="true">
                <Icon name="folder-open" size={15} />
              </span>
              <span class="files-folder-label">All files</span>
            </button>
          {/if}
        </nav>

        <!-- Recent files list -->
        <section class="files-recent" aria-label="Recent files">
          <div class="files-recent-head">
            {activeFolder ? files.folders.find(f => f.id === activeFolder)?.label : "Recent"}
            <span class="files-recent-count">{visibleRecent.length}</span>
          </div>
          {#if visibleRecent.length === 0}
            <div class="files-recent-empty">
              <Icon name="file" size={16} />
              <span>No files in this folder.</span>
            </div>
          {:else}
            <ul class="files-recent-list" role="list">
              {#each visibleRecent as file (file.id)}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
                <!-- Keyboard-activatable row (click + Enter/Space + tabindex) is the Vue
                     original's intentional interaction contract, asserted by the specs. -->
                <li
                  class="files-recent-row"
                  role="listitem"
                  aria-label={`${file.label}, ${file.kind}, ${file.size}`}
                  tabindex="0"
                  onclick={() => openFile(file)}
                  onkeydown={(e) => onRecentRowKeydown(e, file)}
                >
                  <span class="files-recent-icon" aria-hidden="true">
                    <Icon name={kindIcon(file.kind)} size={14} />
                  </span>
                  <span class="files-recent-body">
                    <span class="files-recent-label">{file.label}</span>
                    <span class="files-recent-path">{file.path}</span>
                  </span>
                  <span class="files-recent-modified" aria-hidden="true">{file.modified}</span>
                  <span class="files-recent-size" aria-hidden="true">{file.size}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    </div>
  {/if}
</div>
