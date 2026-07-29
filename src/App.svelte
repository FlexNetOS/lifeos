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
  // This component is the mounted Glass root from src/main.ts. Navigation still
  // uses the shared router/store contract so the Svelte shell preserves the
  // existing route and persistence behavior while Vue artifacts are retired.
  //
  // The auth gate is the only top-level branch: Login covers the viewport until
  // the auth store reports `signed_in`. loadStatus() runs once on mount so the
  // gate reflects the backend (no account → signup; account but no session →
  // welcome-back signin).
  import { onMount } from "svelte";
  import { invoke as tauriCoreInvoke } from "@tauri-apps/api/core";
  import { useLifeos } from "@/stores/lifeos-native";
  import { useAuth } from "@/stores/auth";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { deriveSwarmStatus } from "@/lib/swarm-status";
  import { router as appRouter } from "@/router";
  import Sidebar from "./components/Sidebar.svelte";
  import Workspace from "./components/Workspace.svelte";
  import Dashboard from "./components/Dashboard.svelte";
  import SubsectionView from "./components/SubsectionView.svelte";
  import N8nFlowView from "./components/N8nFlowView.svelte";
  import OpenPencilEditor from "./components/OpenPencilEditor.svelte";
  import EngineRoomTerminal from "./components/EngineRoomTerminal.svelte";
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

  let redbProjection = $state(null);
  let swarmStatus = $derived(deriveSwarmStatus(redbProjection));

  const tauriInvoke = () =>
    typeof window === "undefined" ? null : window.__TAURI__?.core?.invoke || tauriCoreInvoke;
  const engineRoomProbeRequested =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("probe") === "engine-room";
  let engineRoomProbe = $state(
    import.meta.env.VITE_LIFEOS_ENGINE_PROBE === "1" || engineRoomProbeRequested,
  );

  onMount(() => {
    const invoke = tauriInvoke();
    if (!invoke) return;

    // This is the causal Glass readiness receipt: it is emitted only after
    // Svelte has mounted the root component and is written through the
    // authenticated owner, so a launcher/process snapshot cannot masquerade
    // as a mounted LifeOS UI.
    void invoke("redb_state_write", {
      key: "glass.ui.ready",
      value: JSON.stringify({
        schemaVersion: "lifeos.glass-ui-ready.v1",
        state: "ready",
        mountedAt: Date.now(),
        surface: document.documentElement.dataset.surface ?? "workstation",
        identity: "lifeos-glass",
      }),
    }).catch(() => {});

    let afterSeq = 0;
    let initialized = false;
    let syncing = false;
    let uiReadyPublished = false;
    let disposed = false;
    const waitBeforeRetry = () => new Promise((resolve) => window.setTimeout(resolve, 250));
    const watchProjection = async () => {
      if (syncing) return;
      syncing = true;
      try {
        while (!disposed) {
          try {
            // Hydrate from the owner-published mmap on first mount. A reopened
            // Glass must render the current snapshot even when no new event was
            // appended while it was offline.
            if (!initialized) {
              redbProjection = await invoke("redb_projection_read");
              afterSeq = redbProjection?.localSeq || 0;
              initialized = true;
            }
            const updatedAt = Number(redbProjection?.entries?.["swarm.updatedAt"]);
            if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > 5_000) {
              await invoke("redb_swarm_heartbeat");
            }
            if (!uiReadyPublished) {
              await invoke("redb_ui_ready");
              uiReadyPublished = true;
            }

            // `redb_events_read` is an authenticated UDS watch: the owner
            // blocks until a commit arrives. Keep one connection in flight;
            // starting interval-driven watches would accumulate owner sockets.
            const events = await invoke("redb_events_read", { afterSeq });
            if (disposed) return;
            if (events.length) {
              afterSeq = Math.max(afterSeq, ...events.map((event) => event.seq));
              redbProjection = await invoke("redb_projection_read");
            } else {
              // Test doubles and an owner restart may return immediately; do
              // not spin while allowing the next iteration to reconnect.
              await waitBeforeRetry();
            }
          } catch {
            // A reconnect, gap, or checksum failure must restart from a fresh
            // owner-published snapshot instead of advancing a stale cursor.
            initialized = false;
            afterSeq = 0;
            redbProjection = null;
            uiReadyPublished = false;
            if (!disposed) await waitBeforeRetry();
          }
        }
      } finally {
        syncing = false;
      }
    };

    void watchProjection();
    return () => {
      disposed = true;
    };
  });

  onMount(() => {
    auth.loadStatus();
  });
</script>

{#key engineRoomProbe}
  {#if engineRoomProbe}
    <EngineRoomTerminal probe={true} />
  {:else if !authState.isSignedIn}
    <Login />
  {:else}
    <div class="shell" class:ws-collapsed={lifeosState.wsCollapsed}>
    <Sidebar {router} {redbProjection} {swarmStatus} />
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
      {:else if lifeosState.activeSub.item?.view === "terminal"}
        <EngineRoomTerminal />
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
{/key}
