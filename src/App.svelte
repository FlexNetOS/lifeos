<script>
  // LifeOS — App SFC (root shell), Svelte port of App.vue — phases 1+2 of the
  // blueprint-mandated Vue→Svelte migration (blueprint invariant 4: Tauri/Svelte
  // Glass). See [[tasks/blueprint-glass-svelte-migration]].
  //
  // Phase 2 replaced the phase-1 `data-view-pane` placeholders with the real
  // ported view panes and overlays — the <main> branch chain below now mirrors
  // App.vue 1:1 (same branch order, same discriminators, including the
  // OpenPencil mounting gate `activeSub.item?.view === 'open-pencil'`).
  //
  // This component is NOT wired into src/main.ts or src/router/index.ts yet:
  // the Vue App stays the sole mounted app until the Svelte tree passes parity
  // review and is explicitly cut over in phase 3 (never remove Vue
  // functionality before its Svelte replacement is proven — see CLAUDE.md).
  //
  // The auth gate is the only top-level branch: Login covers the viewport until
  // the auth store reports `signed_in`. loadStatus() runs once on mount so the
  // gate reflects the backend (no account → signup; account but no session →
  // welcome-back signin).
  import { onMount } from "svelte";
  import { useLifeos } from "@/stores/lifeos.js";
  import { useAuth } from "@/stores/auth";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { router as appRouter } from "@/router";
  import Sidebar from "./components/Sidebar.svelte";
  import Workspace from "./components/Workspace.svelte";
  import Dashboard from "./components/Dashboard.svelte";
  import SubsectionView from "./components/SubsectionView.svelte";
  import N8nFlowView from "./components/N8nFlowView.svelte";
  import OpenPencilEditor from "./components/OpenPencilEditor.svelte";
  import LightsView from "./components/LightsView.svelte";
  import CalendarView from "./components/CalendarView.svelte";
  import FilesView from "./components/FilesView.svelte";
  import HealthView from "./components/HealthView.svelte";
  import IoTView from "./components/IoTView.svelte";
  import ContactsView from "./components/ContactsView.svelte";
  import SettingsView from "./components/SettingsView.svelte";
  import AIAvatar from "./components/AIAvatar.svelte";
  import CommandPalette from "./components/CommandPalette.svelte";
  import KeyboardHelp from "./components/KeyboardHelp.svelte";
  import ToastContainer from "./components/ToastContainer.svelte";
  import NotificationsDrawer from "./components/NotificationsDrawer.svelte";
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
        <SettingsView />
      {:else if lifeosState.activeId === "contacts" && !lifeosState.activeSub}
        <ContactsView {router} />
      {:else if !lifeosState.activeSub}
        <Dashboard {router} />
      {:else if lifeosState.activeSub.item?.view === "open-pencil"}
        <OpenPencilEditor sub={lifeosState.activeSub} {router} />
      {:else if lifeosState.activeSub.item?.view === "n8n-flow"}
        <N8nFlowView />
      {:else if lifeosState.activeSub.item?.view === "lights"}
        <LightsView {router} />
      {:else if lifeosState.activeSub.item?.view === "calendar"}
        <CalendarView {router} />
      {:else if lifeosState.activeSub.item?.view === "files"}
        <FilesView {router} />
      {:else if lifeosState.activeSub.item?.view === "health"}
        <HealthView {router} />
      {:else if lifeosState.activeSub.item?.view === "iot"}
        <IoTView {router} />
      {:else if lifeosState.activeSub.item?.view === "contacts"}
        <ContactsView {router} />
      {:else}
        <SubsectionView />
      {/if}
    </main>
    <AIAvatar />
    <CommandPalette {router} />
    <KeyboardHelp />
    <NotificationsDrawer />
    <ToastContainer />
  </div>
{/if}
