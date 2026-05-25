<script setup>
// LifeOS — App SFC (root shell)
// The auth gate is the only top-level branch: Login covers the viewport until
// the auth store reports `signed_in`. loadStatus() runs once on mount so the
// gate reflects the backend (no account → signup; account but no session →
// welcome-back signin).

import { onMounted } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useAuth } from "@/stores/auth";
import Sidebar from "./components/Sidebar.vue";
import Workspace from "./components/Workspace.vue";
import Dashboard from "./components/Dashboard.vue";
import SubsectionView from "./components/SubsectionView.vue";
import N8nFlowView from "./components/N8nFlowView.vue";
import OpenPencilEditor from "./components/OpenPencilEditor.vue";
import LightsView from "./components/LightsView.vue";
import CalendarView from "./components/CalendarView.vue";
import FilesView from "./components/FilesView.vue";
import HealthView from "./components/HealthView.vue";
import IoTView from "./components/IoTView.vue";
import ContactsView from "./components/ContactsView.vue";
import SettingsView from "./components/SettingsView.vue";
import AIAvatar from "./components/AIAvatar.vue";
import CommandPalette from "./components/CommandPalette.vue";
import KeyboardHelp from "./components/KeyboardHelp.vue";
import ToastContainer from "./components/ToastContainer.vue";
import NotificationsDrawer from "./components/NotificationsDrawer.vue";
import Login from "./views/Login.vue";

const lifeos = useLifeos();
const auth = useAuth();

onMounted(() => {
  auth.loadStatus();
});
</script>

<template>
  <Login v-if="!auth.isSignedIn" />
  <div v-else :class="['shell', { 'ws-collapsed': lifeos.wsCollapsed }]">
    <Sidebar />
    <Workspace />
    <main class="main" id="main" tabindex="-1">
      <SettingsView       v-if="lifeos.activeId === 'settings' && !lifeos.activeSub" />
      <ContactsView       v-else-if="lifeos.activeId === 'contacts' && !lifeos.activeSub" />
      <Dashboard          v-else-if="!lifeos.activeSub" />
      <OpenPencilEditor   v-else-if="lifeos.activeSub.item?.view === 'open-pencil'" :sub="lifeos.activeSub" />
      <N8nFlowView        v-else-if="lifeos.activeSub.item?.view === 'n8n-flow'" />
      <LightsView         v-else-if="lifeos.activeSub.item?.view === 'lights'" />
      <CalendarView       v-else-if="lifeos.activeSub.item?.view === 'calendar'" />
      <FilesView          v-else-if="lifeos.activeSub.item?.view === 'files'" />
      <HealthView         v-else-if="lifeos.activeSub.item?.view === 'health'" />
      <IoTView            v-else-if="lifeos.activeSub.item?.view === 'iot'" />
      <ContactsView       v-else-if="lifeos.activeSub.item?.view === 'contacts'" />
      <SubsectionView     v-else />
    </main>
    <AIAvatar />
    <CommandPalette />
    <KeyboardHelp />
    <NotificationsDrawer />
    <ToastContainer />
  </div>
</template>
