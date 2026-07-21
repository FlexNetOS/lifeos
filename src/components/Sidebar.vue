<script setup>
// LifeOS — Sidebar SFC
// Primary rail: logo toggle + workspace switcher dropdown + rail icons + footer cluster.
// Navigation goes through the Pinia store (pickWorkspace). When vue-router is present,
// the router subscribes to store changes and reflects them in the URL — see router/index.ts.

import { computed, ref, reactive, onMounted, onBeforeUnmount } from "vue";
import { useLifeos } from "@/stores/lifeos.js";
import { useNav } from "@/lib/nav.js";
import Icon from "./Icon.vue";

const lifeos = useLifeos();
const nav = useNav();

const rail        = computed(() => (window).LIFEOS_DATA?.rail        || []);
const railFooter  = computed(() => (window).LIFEOS_DATA?.railFooter  || []);

const isActive = (id) => lifeos.activeId === id;
const pick = (id) => {
  // Settings routes to /settings, everything else to /workspace/:id — useNav handles both.
  nav.pickWorkspace(id);
};

// ---------------------------------------------------------------
// Net Control popover (globe icon under the logo)
// Built-in browser + full network stack: WAN/LAN, DNS, Proxy, VPN,
// IPv4/IPv6 routes, SSH sessions, APIs, MAC, security posture.
// ---------------------------------------------------------------
const switcherOpen = ref(false);
const switcherRef = ref(null);
const triggerRef = ref(null);
const menuPos = ref({ top: 0, left: 0 });
const netTab = ref("browse");          // browse | network | tunnels | security
const addressBar = ref("https://");
const browseEngines = ["LifeOS", "Chromium", "WebKit", "Gecko", "Tor"];
const browseEngine = ref("Chromium");
const net = reactive({
  wan:    { up: true,  ip4: "73.118.4.221", ip6: "2601:646:8200:e9c0::1f3a", up_mbps: 940, dn_mbps: 1180, ping: 8 },
  lan:    { up: true,  ssid: "lifeos-mesh-5G", clients: 24, gateway: "10.0.0.1" },
  dns:    { primary: "1.1.1.1", secondary: "9.9.9.9", doh: true },
  mac:    "B8:27:EB:5A:4F:1C",
});
const tunnels = reactive({
  vpn:    { on: true,  region: "fra-1", protocol: "WireGuard" },
  proxy:  { on: false, host: "127.0.0.1:8118", type: "SOCKS5" },
  ssh:    [
    { host: "prod-edge-01",    user: "alex", up: true  },
    { host: "build-runner-03", user: "ci",   up: true  },
    { host: "lab-pi-7",        user: "root", up: false },
  ],
  apis:   [
    { name: "OpenAI",     up: true,  rps: 12 },
    { name: "Anthropic",  up: true,  rps: 4  },
    { name: "Home-Assist", up: true, rps: 2  },
    { name: "Tauri Sync", up: false, rps: 0  },
  ],
});
const security = reactive({
  firewall: true,
  killSwitch: true,
  ipv6Leak: false,
  webrtcLeak: false,
});
const positionMenu = () => {
  const el = triggerRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  menuPos.value = { top: r.top, left: r.right + 8 };
};
const toggleSwitcher = () => {
  switcherOpen.value = !switcherOpen.value;
  if (switcherOpen.value) positionMenu();
};
const onDocMouse = (e) => {
  if (!switcherOpen.value) return;
  const inTrigger = switcherRef.value && switcherRef.value.contains(e.target);
  const inMenu = e.target.closest && e.target.closest('.net-ctl');
  if (!inTrigger && !inMenu) switcherOpen.value = false;
};
const onDocKey = (e) => { if (e.key === "Escape") switcherOpen.value = false; };
const onWinResize = () => { if (switcherOpen.value) positionMenu(); };
onMounted(() => {
  document.addEventListener("mousedown", onDocMouse);
  document.addEventListener("keydown", onDocKey);
  window.addEventListener("resize", onWinResize);
  window.addEventListener("scroll", onWinResize, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocMouse);
  document.removeEventListener("keydown", onDocKey);
  window.removeEventListener("resize", onWinResize);
  window.removeEventListener("scroll", onWinResize, true);
});
</script>

<template>
  <aside class="rail" data-figma-reference="5:49#icon-rail">
    <button :class="['rail-brand', { collapsed: lifeos.wsCollapsed }]"
            :title="lifeos.wsCollapsed ? 'Open LifeOS workspace panel' : 'Close LifeOS workspace panel'"
            aria-label="Toggle LifeOS workspace panel"
            @click="lifeos.toggleWs()">
      <img src="/lifeos-mark-256.png" alt="" />
    </button>

    <button class="rail-ai-toggle"
            :class="{ off: lifeos.aiAvatarHidden }"
            :title="lifeos.aiAvatarHidden ? 'Show AI avatar' : 'Hide AI avatar'"
            :aria-label="lifeos.aiAvatarHidden ? 'Show AI avatar' : 'Hide AI avatar'"
            :aria-pressed="!lifeos.aiAvatarHidden"
            @click="lifeos.toggleAiAvatarHidden()">
      <Icon :name="lifeos.aiAvatarHidden ? 'bot-off' : 'bot'" :size="13" />
    </button>

    <div class="rail-switcher" ref="switcherRef">
      <button ref="triggerRef"
              :class="['rail-switcher-trigger', { open: switcherOpen }]"
              :aria-expanded="switcherOpen"
              aria-haspopup="dialog"
              aria-label="Net Control — browser &amp; network"
              title="Net Control — browser, WAN/LAN, DNS, VPN, SSH, APIs"
              @click="toggleSwitcher">
        <Icon name="globe" :size="14" />
        <span class="rail-switcher-link" :class="{ on: net.wan.up }" aria-hidden="true" />
      </button>

      <Teleport to="body">
      <div v-if="switcherOpen" class="rail-switcher-menu net-ctl" role="dialog" aria-label="Net Control"
           :style="{ top: menuPos.top + 'px', left: menuPos.left + 'px' }">
        <header class="net-ctl-head">
          <div class="net-ctl-eyebrow">
            <span class="net-ctl-pulse" :class="{ on: net.wan.up }" />
            Net Control
            <span class="net-ctl-host">{{ net.lan.ssid }}</span>
          </div>
          <div class="net-ctl-tabs" role="tablist">
            <button v-for="t in ['browse','network','tunnels','security']" :key="t"
                    :class="['net-ctl-tab', { active: netTab === t }]"
                    role="tab"
                    :aria-selected="netTab === t"
                    @click="netTab = t">{{ t }}</button>
          </div>
        </header>

        <!-- BROWSE — built-in browser, "any browser that works" -->
        <section v-if="netTab === 'browse'" class="net-ctl-body">
          <div class="net-addr">
            <Icon name="lock" :size="11" />
            <input v-model="addressBar" placeholder="Search or paste URL — works in any engine"
                   spellcheck="false" autocomplete="off" />
            <button class="net-go" type="button" @click="addressBar = 'https://'">Go</button>
          </div>
          <div class="net-engine-row">
            <span class="net-label">Engine</span>
            <div class="net-engine-chips">
              <button v-for="e in browseEngines" :key="e"
                      :class="['net-chip', { active: browseEngine === e }]"
                      @click="browseEngine = e">{{ e }}</button>
            </div>
          </div>
          <div class="net-grid-2">
            <div class="net-tile"><span class="net-tile-k">Tabs</span><span class="net-tile-v">7</span></div>
            <div class="net-tile"><span class="net-tile-k">Profiles</span><span class="net-tile-v">3</span></div>
            <div class="net-tile"><span class="net-tile-k">Cache</span><span class="net-tile-v">182 MB</span></div>
            <div class="net-tile"><span class="net-tile-k">Cookies</span><span class="net-tile-v">412</span></div>
          </div>
          <div class="net-actions">
            <button class="net-act"><Icon name="external-link" :size="12" /> Open window</button>
            <button class="net-act"><Icon name="incognito" :size="12" /> Private</button>
            <button class="net-act"><Icon name="trash-2" :size="12" /> Clear</button>
          </div>
        </section>

        <!-- NETWORK — WAN, LAN, IPv4/IPv6, DNS, MAC, routes -->
        <section v-if="netTab === 'network'" class="net-ctl-body">
          <div class="net-row">
            <span class="net-row-k"><span class="net-dot" :class="{ on: net.wan.up }" /> WAN</span>
            <span class="net-row-v">{{ net.wan.dn_mbps }}↓ / {{ net.wan.up_mbps }}↑ Mbps · {{ net.wan.ping }} ms</span>
          </div>
          <div class="net-kv-grid">
            <div><span class="net-k">IPv4</span><span class="net-v mono">{{ net.wan.ip4 }}</span></div>
            <div><span class="net-k">IPv6</span><span class="net-v mono">{{ net.wan.ip6 }}</span></div>
            <div><span class="net-k">MAC</span><span class="net-v mono">{{ net.mac }}</span></div>
            <div><span class="net-k">Gateway</span><span class="net-v mono">{{ net.lan.gateway }}</span></div>
          </div>
          <div class="net-row">
            <span class="net-row-k"><span class="net-dot" :class="{ on: net.lan.up }" /> LAN</span>
            <span class="net-row-v">{{ net.lan.clients }} devices · {{ net.lan.ssid }}</span>
          </div>
          <div class="net-row">
            <span class="net-row-k"><Icon name="server" :size="11" /> DNS</span>
            <span class="net-row-v mono">{{ net.dns.primary }} · {{ net.dns.secondary }}</span>
            <span :class="['net-pill', { on: net.dns.doh }]">DoH</span>
          </div>
          <div class="net-actions">
            <button class="net-act"><Icon name="route" :size="12" /> Routes</button>
            <button class="net-act"><Icon name="refresh-cw" :size="12" /> Renew DHCP</button>
            <button class="net-act"><Icon name="activity" :size="12" /> Trace</button>
          </div>
        </section>

        <!-- TUNNELS — VPN, Proxy, SSH sessions, API endpoints -->
        <section v-if="netTab === 'tunnels'" class="net-ctl-body">
          <div class="net-toggle-row">
            <div class="net-toggle">
              <span class="net-row-k"><Icon name="shield" :size="11" /> VPN</span>
              <span class="net-row-v">{{ tunnels.vpn.protocol }} · {{ tunnels.vpn.region }}</span>
              <button :class="['net-sw', { on: tunnels.vpn.on }]" @click="tunnels.vpn.on = !tunnels.vpn.on"
                      :aria-pressed="tunnels.vpn.on" aria-label="Toggle VPN"><span /></button>
            </div>
            <div class="net-toggle">
              <span class="net-row-k"><Icon name="git-branch" :size="11" /> Proxy</span>
              <span class="net-row-v mono">{{ tunnels.proxy.type }} · {{ tunnels.proxy.host }}</span>
              <button :class="['net-sw', { on: tunnels.proxy.on }]" @click="tunnels.proxy.on = !tunnels.proxy.on"
                      :aria-pressed="tunnels.proxy.on" aria-label="Toggle Proxy"><span /></button>
            </div>
          </div>
          <div class="net-sub">SSH sessions</div>
          <ul class="net-list">
            <li v-for="s in tunnels.ssh" :key="s.host">
              <span class="net-dot" :class="{ on: s.up }" />
              <span class="mono">{{ s.user }}@{{ s.host }}</span>
              <span class="net-list-tail">{{ s.up ? 'connected' : 'idle' }}</span>
            </li>
          </ul>
          <div class="net-sub">API endpoints</div>
          <ul class="net-list">
            <li v-for="a in tunnels.apis" :key="a.name">
              <span class="net-dot" :class="{ on: a.up }" />
              <span>{{ a.name }}</span>
              <span class="net-list-tail mono">{{ a.rps }} rps</span>
            </li>
          </ul>
        </section>

        <!-- SECURITY -->
        <section v-if="netTab === 'security'" class="net-ctl-body">
          <div class="net-toggle">
            <span class="net-row-k"><Icon name="shield-check" :size="11" /> Firewall</span>
            <span class="net-row-v">Inbound blocked · 47 rules</span>
            <button :class="['net-sw', { on: security.firewall }]" @click="security.firewall = !security.firewall"
                    :aria-pressed="security.firewall"><span /></button>
          </div>
          <div class="net-toggle">
            <span class="net-row-k"><Icon name="zap-off" :size="11" /> Kill switch</span>
            <span class="net-row-v">Block traffic if VPN drops</span>
            <button :class="['net-sw', { on: security.killSwitch }]" @click="security.killSwitch = !security.killSwitch"
                    :aria-pressed="security.killSwitch"><span /></button>
          </div>
          <div class="net-leak-grid">
            <div :class="['net-leak', { warn: security.ipv6Leak }]">
              <span class="net-leak-k">IPv6 leak</span>
              <span class="net-leak-v">{{ security.ipv6Leak ? 'detected' : 'none' }}</span>
            </div>
            <div :class="['net-leak', { warn: security.webrtcLeak }]">
              <span class="net-leak-k">WebRTC leak</span>
              <span class="net-leak-v">{{ security.webrtcLeak ? 'detected' : 'none' }}</span>
            </div>
            <div class="net-leak">
              <span class="net-leak-k">TLS posture</span>
              <span class="net-leak-v">1.3 only</span>
            </div>
            <div class="net-leak">
              <span class="net-leak-k">Last scan</span>
              <span class="net-leak-v">2 min ago</span>
            </div>
          </div>
          <div class="net-actions">
            <button class="net-act"><Icon name="scan-line" :size="12" /> Re-scan</button>
            <button class="net-act"><Icon name="file-text" :size="12" /> Audit log</button>
          </div>
        </section>
      </div>
      </Teleport>
    </div>

    <nav class="rail-list" aria-label="Workspaces">
      <button v-for="item in rail" :key="item.id"
              :class="['rail-btn', { active: isActive(item.id) }]"
              :title="item.tooltip || item.label"
              :aria-label="item.tooltip || item.label"
              :aria-current="isActive(item.id) ? 'page' : undefined"
              @click="pick(item.id)">
        <Icon :name="item.icon" :size="16" />
        <span v-if="item.status" class="rail-status">
          <span class="status-dot" :style="{ background: item.status === 'warn' ? 'var(--status-warn)' : 'var(--lifeos-green)' }" />
        </span>
        <span v-if="item.badge" :class="['rail-badge', `tone-${item.badge.tone || 'err'}`]">
          {{ item.badge.count > 99 ? '99+' : item.badge.count }}
        </span>
      </button>
    </nav>

    <div class="rail-footer" aria-label="Persistent global icons">
      <button v-for="item in railFooter" :key="item.id"
              :class="['rail-btn', { active: item.id === 'notify' ? lifeos.notificationsDrawerOpen : isActive(item.id) }]"
              :title="item.tooltip || item.label"
              :aria-label="item.tooltip || item.label"
              :aria-current="item.id !== 'notify' && isActive(item.id) ? 'page' : undefined"
              :aria-expanded="item.id === 'notify' ? lifeos.notificationsDrawerOpen : undefined"
              @click="item.id === 'notify' ? lifeos.toggleNotificationsDrawer() : pick(item.id)">
        <Icon :name="item.icon" :size="16" />
        <span v-if="item.id === 'notify' && lifeos.unreadNotificationCount > 0"
              :class="['rail-badge', 'tone-err']">
          {{ lifeos.unreadNotificationCount > 99 ? '99+' : lifeos.unreadNotificationCount }}
        </span>
        <span v-else-if="item.id !== 'notify' && item.badge" :class="['rail-badge', `tone-${item.badge.tone || 'err'}`]">
          {{ item.badge.count > 99 ? '99+' : item.badge.count }}
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* Globe trigger — link dot in corner reflects WAN status */
.rail-switcher-trigger { position: relative; }
.rail-switcher-link {
  position: absolute; right: 3px; bottom: 3px;
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--status-err);
  box-shadow: 0 0 0 1.5px var(--bg-1);
}
.rail-switcher-link.on { background: var(--lifeos-green); box-shadow: 0 0 0 1.5px var(--bg-1), 0 0 6px var(--tint-green-glow-hi); }

/* Net Control panel */
.rail-switcher-menu.net-ctl {
  position: fixed;
  top: 0; left: 0;
  width: 360px;
  padding: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-1);
  z-index: 1000;
}
.net-ctl-head {
  padding: 12px 14px 0;
  border-bottom: 1px solid var(--bg-3);
  background:
    radial-gradient(120% 80% at 0% 0%, var(--tint-cyan-soft), transparent 60%),
    linear-gradient(180deg, var(--tint-purple-faint), transparent);
}
.net-ctl-eyebrow {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; color: var(--fg-2);
}
.net-ctl-host {
  margin-left: auto;
  font-family: ui-monospace, monospace;
  font-weight: 500; font-size: 10px; letter-spacing: 0;
  text-transform: none;
  color: var(--fg-3);
}
.net-ctl-pulse {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--status-err);
}
.net-ctl-pulse.on {
  background: var(--lifeos-green);
  box-shadow: 0 0 0 0 var(--tint-green-glow-mid);
  animation: net-pulse 1.8s infinite;
}
@keyframes net-pulse {
  0%   { box-shadow: 0 0 0 0 var(--tint-green-glow-outer); }
  70%  { box-shadow: 0 0 0 7px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.net-ctl-tabs { display: flex; gap: 2px; margin: 10px -4px 0; }
.net-ctl-tab {
  flex: 1;
  padding: 8px 6px;
  background: transparent;
  border: 0;
  border-bottom: 1.5px solid transparent;
  font: inherit; font-size: 11px; font-weight: 500;
  color: var(--fg-3);
  text-transform: capitalize;
  cursor: pointer;
  transition: color .15s, border-color .15s;
}
.net-ctl-tab:hover { color: var(--fg-1); }
.net-ctl-tab.active { color: var(--lifeos-cyan); border-bottom-color: var(--lifeos-cyan); }

.net-ctl-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }

/* BROWSE */
.net-addr {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--bg-0);
  border: 1px solid var(--bg-3);
  border-radius: 8px;
  color: var(--fg-4);
}
.net-addr input {
  flex: 1; min-width: 0;
  background: transparent; border: 0; outline: 0;
  font: inherit; font-size: 12px;
  color: var(--fg-1);
}
.net-addr input::placeholder { color: var(--fg-5, var(--fg-4)); }
.net-go {
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--tint-cyan-medium);
  border: 1px solid var(--tint-cyan-edge);
  color: var(--lifeos-cyan);
  font: inherit; font-size: 11px; font-weight: 600;
  cursor: pointer;
}
.net-engine-row { display: flex; align-items: center; gap: 10px; }
.net-label {
  font-size: 10px; font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; color: var(--fg-4);
  flex-shrink: 0;
}
.net-engine-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.net-chip {
  padding: 3px 8px;
  background: var(--bg-2); border: 1px solid var(--bg-3);
  border-radius: 999px;
  color: var(--fg-2);
  font: inherit; font-size: 11px;
  cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
}
.net-chip:hover { color: var(--fg-1); border-color: var(--bg-5); }
.net-chip.active {
  background: var(--tint-cyan-medium);
  border-color: var(--tint-cyan-strong);
  color: var(--lifeos-cyan);
}

.net-grid-2 {
  display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px;
}
.net-tile {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 10px;
  background: var(--bg-2); border: 1px solid var(--bg-3);
  border-radius: 8px;
}
.net-tile-k { font-size: 10px; color: var(--fg-4); text-transform: uppercase; letter-spacing: .06em; }
.net-tile-v { font-size: 13px; font-weight: 600; color: var(--fg-1); }

.net-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.net-act {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 10px;
  background: var(--bg-2); border: 1px solid var(--bg-3);
  border-radius: 7px;
  color: var(--fg-2);
  font: inherit; font-size: 11px; font-weight: 500;
  cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
}
.net-act:hover { background: var(--bg-3); color: var(--fg-0); border-color: var(--bg-5); }

/* NETWORK rows */
.net-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--bg-2);
}
.net-row:last-of-type { border-bottom: 0; }
.net-row-k {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600;
  color: var(--fg-2);
  min-width: 70px;
}
.net-row-v { flex: 1; font-size: 11px; color: var(--fg-3); }
.net-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--status-err);
  flex-shrink: 0;
}
.net-dot.on { background: var(--lifeos-green); }

.net-kv-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px;
  padding: 4px 0;
}
.net-kv-grid > div { display: flex; flex-direction: column; gap: 1px; }
.net-k { font-size: 10px; color: var(--fg-4); text-transform: uppercase; letter-spacing: .05em; }
.net-v { font-size: 11px; color: var(--fg-1); }

.net-pill {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 9px; font-weight: 700; letter-spacing: .05em;
  background: var(--bg-3); color: var(--fg-3);
  text-transform: uppercase;
}
.net-pill.on {
  background: var(--tint-green-medium);
  color: var(--lifeos-green);
}

/* TUNNELS */
.net-toggle-row { display: flex; flex-direction: column; gap: 6px; }
.net-toggle {
  display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center;
  padding: 8px 10px;
  background: var(--bg-2); border: 1px solid var(--bg-3);
  border-radius: 8px;
}
.net-sw {
  width: 28px; height: 16px;
  border-radius: 999px;
  background: var(--bg-4); border: 1px solid var(--bg-5);
  position: relative; cursor: pointer;
  transition: background .15s, border-color .15s;
  padding: 0;
}
.net-sw > span {
  position: absolute; top: 1px; left: 1px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--fg-2);
  transition: transform .15s, background .15s;
}
.net-sw.on { background: var(--tint-green-edge); border-color: var(--lifeos-green); }
.net-sw.on > span { transform: translateX(12px); background: var(--lifeos-green); }

.net-sub {
  font-size: 10px; font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase; color: var(--fg-4);
  padding-top: 4px;
}
.net-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column;
  border: 1px solid var(--bg-3); border-radius: 8px;
  overflow: hidden;
}
.net-list li {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px;
  font-size: 11px;
  color: var(--fg-2);
  border-bottom: 1px solid var(--bg-3);
}
.net-list li:last-child { border-bottom: 0; }
.net-list-tail {
  margin-left: auto;
  font-size: 10px;
  color: var(--fg-4);
}

/* SECURITY */
.net-leak-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
}
.net-leak {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 10px;
  background: var(--bg-2);
  border: 1px solid var(--bg-3);
  border-radius: 8px;
}
.net-leak.warn { border-color: var(--tint-err-edge); background: var(--tint-err-soft); }
.net-leak-k { font-size: 10px; color: var(--fg-4); text-transform: uppercase; letter-spacing: .05em; }
.net-leak-v { font-size: 12px; font-weight: 600; color: var(--lifeos-green); }
.net-leak.warn .net-leak-v { color: var(--status-err); }
</style>
