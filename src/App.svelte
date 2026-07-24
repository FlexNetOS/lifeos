<script>
  // LifeOS — App SFC (root shell), Svelte port of App.vue — Phase 1 of the
  // blueprint-mandated Vue→Svelte migration (blueprint invariant 4: Tauri/Svelte
  // Glass). See [[tasks/blueprint-glass-svelte-migration]].
  //
  // Scope discipline: this phase ports the SHELL ONLY (App/Sidebar/Workspace) —
  // not the workspace view panes it mounts in <main> (Dashboard, SubsectionView,
  // N8nFlowView, OpenPencilEditor, LightsView, CalendarView, FilesView, HealthView,
  // IoTView, ContactsView, SettingsView) or the overlay layer (AIAvatar/AIChat,
  // CommandPalette, KeyboardHelp, NotificationsDrawer, ToastContainer) — those are
  // phase 2. The <main> v-else-if chain below is preserved EXACTLY (same branch
  // order, same discriminators, including the OpenPencil gate
  // `activeSub.item?.view === 'open-pencil'`) so the gate logic itself is
  // provably identical to App.vue's; each not-yet-ported branch renders a
  // `data-view-pane`-tagged placeholder instead of the real view component.
  // The AI avatar slot is similarly a placeholder — see phase2_backlog.
  //
  // This component is NOT wired into src/main.ts or src/router/index.ts yet:
  // the Vue App stays the sole mounted app until its Svelte replacement is
  // proven by tests and explicitly cut over (never remove Vue functionality
  // before its Svelte replacement is proven — see CLAUDE.md).
  import { onMount } from "svelte";
  import { useLifeos } from "@/stores/lifeos.js";
  import { useAuth } from "@/stores/auth";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { router as appRouter } from "@/router";
  import Sidebar from "./components/Sidebar.svelte";
  import Workspace from "./components/Workspace.svelte";
  import Login from "./views/Login.svelte";

  let { router = appRouter } = $props();

  const lifeos = useLifeos();
  const auth = useAuth();
  const authState = bindStore(auth, ["isSignedIn"]);
  const lifeosState = bindStore(lifeos, ["wsCollapsed", "activeId", "activeSub"]);

  onMount(() => {
    auth.loadStatus();
  });
</script>

{#if !authState.isSignedIn}
  <Login />
{:else}
  <div class="shell" class:ws-collapsed={lifeosState.wsCollapsed}>
    <Sidebar {router} />
    <Workspace {router} />
    <main class="main" id="main" tabindex="-1">
      {#if lifeosState.activeId === "settings" && !lifeosState.activeSub}
        <div class="view-pane-placeholder" data-view-pane="settings"></div>
      {:else if lifeosState.activeId === "contacts" && !lifeosState.activeSub}
        <div class="view-pane-placeholder" data-view-pane="contacts"></div>
      {:else if !lifeosState.activeSub}
        <div class="view-pane-placeholder" data-view-pane="dashboard"></div>
      {:else if lifeosState.activeSub.item?.view === "open-pencil"}
        <div class="view-pane-placeholder" data-view-pane="open-pencil"></div>
      {:else if lifeosState.activeSub.item?.view === "n8n-flow"}
        <div class="view-pane-placeholder" data-view-pane="n8n-flow"></div>
      {:else if lifeosState.activeSub.item?.view === "lights"}
        <div class="view-pane-placeholder" data-view-pane="lights"></div>
      {:else if lifeosState.activeSub.item?.view === "calendar"}
        <div class="view-pane-placeholder" data-view-pane="calendar"></div>
      {:else if lifeosState.activeSub.item?.view === "files"}
        <div class="view-pane-placeholder" data-view-pane="files"></div>
      {:else if lifeosState.activeSub.item?.view === "health"}
        <div class="view-pane-placeholder" data-view-pane="health"></div>
      {:else if lifeosState.activeSub.item?.view === "iot"}
        <div class="view-pane-placeholder" data-view-pane="iot"></div>
      {:else if lifeosState.activeSub.item?.view === "contacts"}
        <div class="view-pane-placeholder" data-view-pane="contacts-sub"></div>
      {:else}
        <div class="view-pane-placeholder" data-view-pane="subsection"></div>
      {/if}
    </main>
    <div class="ai-avatar-placeholder" data-region="ai-avatar" aria-hidden="true"></div>
  </div>
{/if}
