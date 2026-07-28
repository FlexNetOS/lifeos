<script>
  // LifeOS — Sidebar SFC (Svelte port of Sidebar.vue)
  // Primary rail: logo toggle + workspace switcher dropdown + rail icons + footer cluster.
  // Navigation goes through the native LifeOS store via svelte-nav's createNav().
  // The legacy nav.js composable remains only for the preview compatibility path.
  import { onMount, onDestroy } from "svelte";
  import { useLifeos } from "@/stores/lifeos-native";
  import { createNav } from "@/lib/svelte-nav.js";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { router as appRouter } from "@/router";
  import Icon from "./Icon.svelte";

  let { router = appRouter, redbProjection = null } = $props();

  const lifeos = useLifeos();
  let nav = $derived(createNav(router));
  const lifeosState = bindStore(lifeos, [
    "activeId",
    "wsCollapsed",
    "aiAvatarHidden",
    "notificationsDrawerOpen",
    "unreadNotificationCount",
  ]);

  let rail = $derived(globalThis.LIFEOS_DATA?.rail || []);
  let railFooter = $derived(globalThis.LIFEOS_DATA?.railFooter || []);

  const isActive = (id) => lifeosState.activeId === id;
  const pick = (id) => {
    // Settings routes to /settings, everything else to /workspace/:id — nav handles both.
    nav.pickWorkspace(id);
  };

  // ---------------------------------------------------------------
  // Net Control popover (globe icon under the logo)
  // Built-in browser + full network stack: WAN/LAN, DNS, Proxy, VPN,
  // IPv4/IPv6 routes, SSH sessions, APIs, MAC, security posture.
  // ---------------------------------------------------------------
  let switcherOpen = $state(false);
  let switcherEl = $state(null);
  let triggerEl = $state(null);
  let menuPos = $state({ top: 0, left: 0 });
  let netTab = $state("browse");          // browse | network | tunnels | security
  let addressBar = $state("https://");
  const browseEngines = ["LifeOS", "Chromium", "WebKit", "Gecko", "Tor"];
  let browseEngine = $state("Chromium");
  const net = $state({
    wan:    { up: true,  ip4: "73.118.4.221", ip6: "2601:646:8200:e9c0::1f3a", up_mbps: 940, dn_mbps: 1180, ping: 8 },
    lan:    { up: true,  ssid: "lifeos-mesh-5G", clients: 24, gateway: "10.0.0.1" },
    dns:    { primary: "1.1.1.1", secondary: "9.9.9.9", doh: true },
    mac:    "B8:27:EB:5A:4F:1C",
  });
  const tunnels = $state({
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
  const security = $state({
    firewall: true,
    killSwitch: true,
    ipv6Leak: false,
    webrtcLeak: false,
  });
  const positionMenu = () => {
    const el = triggerEl;
    if (!el) return;
    const r = el.getBoundingClientRect();
    menuPos = { top: r.top, left: r.right + 8 };
  };
  const toggleSwitcher = () => {
    switcherOpen = !switcherOpen;
    if (switcherOpen) positionMenu();
  };
  const onDocMouse = (e) => {
    if (!switcherOpen) return;
    const inTrigger = switcherEl && switcherEl.contains(e.target);
    const inMenu = e.target.closest && e.target.closest(".net-ctl");
    if (!inTrigger && !inMenu) switcherOpen = false;
  };
  const onDocKey = (e) => { if (e.key === "Escape") switcherOpen = false; };
  const onWinResize = () => { if (switcherOpen) positionMenu(); };
  onMount(() => {
    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onDocKey);
    window.addEventListener("resize", onWinResize);
    window.addEventListener("scroll", onWinResize, true);
  });
  onDestroy(() => {
    document.removeEventListener("mousedown", onDocMouse);
    document.removeEventListener("keydown", onDocKey);
    window.removeEventListener("resize", onWinResize);
    window.removeEventListener("scroll", onWinResize, true);
  });

  // Teleport-to-body equivalent for the Net Control popover (Vue's <Teleport to="body">).
  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.parentNode?.removeChild(node); } };
  }
</script>

<aside class="rail" data-figma-component="Sidebar Companion/Icon rail">
  <button class="rail-brand" class:collapsed={lifeosState.wsCollapsed}
          data-figma-component="LifeOS Brand/App mark"
          title={lifeosState.wsCollapsed ? "Open LifeOS workspace panel" : "Close LifeOS workspace panel"}
          aria-label="Toggle LifeOS workspace panel"
          onclick={() => lifeos.toggleWs()}>
    <img src="/lifeos-mark-256.png" alt="" />
  </button>

  <button class="rail-ai-toggle" class:off={lifeosState.aiAvatarHidden}
          title={lifeosState.aiAvatarHidden ? "Show AI avatar" : "Hide AI avatar"}
          aria-label={lifeosState.aiAvatarHidden ? "Show AI avatar" : "Hide AI avatar"}
          aria-pressed={!lifeosState.aiAvatarHidden}
          onclick={() => lifeos.toggleAiAvatarHidden()}>
    <Icon name={lifeosState.aiAvatarHidden ? "bot-off" : "bot"} size={13} />
  </button>

  <div class="rail-switcher" bind:this={switcherEl}>
    <button bind:this={triggerEl}
            class="rail-switcher-trigger" class:open={switcherOpen}
            aria-expanded={switcherOpen}
            aria-haspopup="dialog"
            aria-label="Net Control — browser &amp; network"
            title="Net Control — browser, WAN/LAN, DNS, VPN, SSH, APIs"
            onclick={toggleSwitcher}>
      <Icon name="globe" size={14} />
      <span class="rail-switcher-link" class:on={net.wan.up} aria-hidden="true"></span>
    </button>

    {#if switcherOpen}
    <div use:portal class="rail-switcher-menu net-ctl" role="dialog" aria-label="Net Control"
         style="top: {menuPos.top}px; left: {menuPos.left}px;">
      <header class="net-ctl-head">
        <div class="net-ctl-eyebrow">
          <span class="net-ctl-pulse" class:on={net.wan.up}></span>
          Net Control
          <span class="net-ctl-host">{net.lan.ssid}</span>
        </div>
        <div class="net-ctl-tabs" role="tablist">
          {#each ["browse", "network", "tunnels", "security"] as t (t)}
            <button class="net-ctl-tab" class:active={netTab === t}
                    role="tab"
                    aria-selected={netTab === t}
                    onclick={() => netTab = t}>{t}</button>
          {/each}
        </div>
      </header>

      <!-- BROWSE — built-in browser, "any browser that works" -->
      {#if netTab === "browse"}
        <section class="net-ctl-body">
          <div class="net-addr">
            <Icon name="lock" size={11} />
            <input bind:value={addressBar} placeholder="Search or paste URL — works in any engine"
                   spellcheck="false" autocomplete="off" />
            <button class="net-go" type="button" onclick={() => addressBar = "https://"}>Go</button>
          </div>
          <div class="net-engine-row">
            <span class="net-label">Engine</span>
            <div class="net-engine-chips">
              {#each browseEngines as e (e)}
                <button class="net-chip" class:active={browseEngine === e}
                        onclick={() => browseEngine = e}>{e}</button>
              {/each}
            </div>
          </div>
          <div class="net-grid-2">
            <div class="net-tile"><span class="net-tile-k">Tabs</span><span class="net-tile-v">7</span></div>
            <div class="net-tile"><span class="net-tile-k">Profiles</span><span class="net-tile-v">3</span></div>
            <div class="net-tile"><span class="net-tile-k">Cache</span><span class="net-tile-v">182 MB</span></div>
            <div class="net-tile"><span class="net-tile-k">Cookies</span><span class="net-tile-v">412</span></div>
          </div>
          <div class="net-actions">
            <button class="net-act"><Icon name="external-link" size={12} /> Open window</button>
            <button class="net-act"><Icon name="incognito" size={12} /> Private</button>
            <button class="net-act"><Icon name="trash-2" size={12} /> Clear</button>
          </div>
        </section>
      {/if}

      <!-- NETWORK — WAN, LAN, IPv4/IPv6, DNS, MAC, routes -->
      {#if netTab === "network"}
        <section class="net-ctl-body">
          <div class="net-row">
            <span class="net-row-k"><span class="net-dot" class:on={net.wan.up}></span> WAN</span>
            <span class="net-row-v">{net.wan.dn_mbps}↓ / {net.wan.up_mbps}↑ Mbps · {net.wan.ping} ms</span>
          </div>
          <div class="net-kv-grid">
            <div><span class="net-k">IPv4</span><span class="net-v mono">{net.wan.ip4}</span></div>
            <div><span class="net-k">IPv6</span><span class="net-v mono">{net.wan.ip6}</span></div>
            <div><span class="net-k">MAC</span><span class="net-v mono">{net.mac}</span></div>
            <div><span class="net-k">Gateway</span><span class="net-v mono">{net.lan.gateway}</span></div>
          </div>
          <div class="net-row">
            <span class="net-row-k"><span class="net-dot" class:on={net.lan.up}></span> LAN</span>
            <span class="net-row-v">{net.lan.clients} devices · {net.lan.ssid}</span>
          </div>
          <div class="net-row">
            <span class="net-row-k"><Icon name="server" size={11} /> DNS</span>
            <span class="net-row-v mono">{net.dns.primary} · {net.dns.secondary}</span>
            <span class="net-pill" class:on={net.dns.doh}>DoH</span>
          </div>
          <div class="net-actions">
            <button class="net-act"><Icon name="route" size={12} /> Routes</button>
            <button class="net-act"><Icon name="refresh-cw" size={12} /> Renew DHCP</button>
            <button class="net-act"><Icon name="activity" size={12} /> Trace</button>
          </div>
        </section>
      {/if}

      <!-- TUNNELS — VPN, Proxy, SSH sessions, API endpoints -->
      {#if netTab === "tunnels"}
        <section class="net-ctl-body">
          <div class="net-toggle-row">
            <div class="net-toggle">
              <span class="net-row-k"><Icon name="shield" size={11} /> VPN</span>
              <span class="net-row-v">{tunnels.vpn.protocol} · {tunnels.vpn.region}</span>
              <button class="net-sw" class:on={tunnels.vpn.on} onclick={() => tunnels.vpn.on = !tunnels.vpn.on}
                      aria-pressed={tunnels.vpn.on} aria-label="Toggle VPN"><span></span></button>
            </div>
            <div class="net-toggle">
              <span class="net-row-k"><Icon name="git-branch" size={11} /> Proxy</span>
              <span class="net-row-v mono">{tunnels.proxy.type} · {tunnels.proxy.host}</span>
              <button class="net-sw" class:on={tunnels.proxy.on} onclick={() => tunnels.proxy.on = !tunnels.proxy.on}
                      aria-pressed={tunnels.proxy.on} aria-label="Toggle Proxy"><span></span></button>
            </div>
          </div>
          <div class="net-sub">SSH sessions</div>
          <ul class="net-list">
            {#each tunnels.ssh as s (s.host)}
              <li>
                <span class="net-dot" class:on={s.up}></span>
                <span class="mono">{s.user}@{s.host}</span>
                <span class="net-list-tail">{s.up ? "connected" : "idle"}</span>
              </li>
            {/each}
          </ul>
          <div class="net-sub">API endpoints</div>
          <ul class="net-list">
            {#each tunnels.apis as a (a.name)}
              <li>
                <span class="net-dot" class:on={a.up}></span>
                <span>{a.name}</span>
                <span class="net-list-tail mono">{a.rps} rps</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- SECURITY -->
      {#if netTab === "security"}
        <section class="net-ctl-body">
          <div class="net-toggle">
            <span class="net-row-k"><Icon name="shield-check" size={11} /> Firewall</span>
            <span class="net-row-v">Inbound blocked · 47 rules</span>
            <button class="net-sw" class:on={security.firewall} onclick={() => security.firewall = !security.firewall}
                    aria-pressed={security.firewall} aria-label="Toggle firewall"><span></span></button>
          </div>
          <div class="net-toggle">
            <span class="net-row-k"><Icon name="zap-off" size={11} /> Kill switch</span>
            <span class="net-row-v">Block traffic if VPN drops</span>
            <button class="net-sw" class:on={security.killSwitch} onclick={() => security.killSwitch = !security.killSwitch}
                    aria-pressed={security.killSwitch} aria-label="Toggle kill switch"><span></span></button>
          </div>
          <div class="net-leak-grid">
            <div class="net-leak" class:warn={security.ipv6Leak}>
              <span class="net-leak-k">IPv6 leak</span>
              <span class="net-leak-v">{security.ipv6Leak ? "detected" : "none"}</span>
            </div>
            <div class="net-leak" class:warn={security.webrtcLeak}>
              <span class="net-leak-k">WebRTC leak</span>
              <span class="net-leak-v">{security.webrtcLeak ? "detected" : "none"}</span>
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
            <button class="net-act"><Icon name="scan-line" size={12} /> Re-scan</button>
            <button class="net-act"><Icon name="file-text" size={12} /> Audit log</button>
          </div>
        </section>
      {/if}
    </div>
    {/if}
  </div>

  <nav class="rail-list" aria-label="Workspaces"
       data-figma-component="LifeOS Product Identity/Navigation triad">
    {#each rail as item (item.id)}
      <button class="rail-btn" class:active={isActive(item.id)}
              title={item.tooltip || item.label}
              aria-label={item.tooltip || item.label}
              aria-current={isActive(item.id) ? "page" : undefined}
              onclick={() => pick(item.id)}>
        <Icon name={item.icon} size={16} />
        {#if item.status}
          <span class="rail-status">
            <span class="status-dot" style="background: {item.status === 'warn' ? 'var(--status-warn)' : 'var(--lifeos-green)'};"></span>
          </span>
        {/if}
        {#if item.badge}
          <span class="rail-badge tone-{item.badge.tone || 'err'}">
            {item.badge.count > 99 ? "99+" : item.badge.count}
          </span>
        {/if}
      </button>
    {/each}
  </nav>

  <div class="rail-footer" aria-label="Persistent global icons">
    {#each railFooter as item (item.id)}
      <button class="rail-btn"
              class:active={item.id === "notify" ? lifeosState.notificationsDrawerOpen : isActive(item.id)}
              title={item.tooltip || item.label}
              aria-label={item.tooltip || item.label}
              aria-current={item.id !== "notify" && isActive(item.id) ? "page" : undefined}
              aria-expanded={item.id === "notify" ? lifeosState.notificationsDrawerOpen : undefined}
              onclick={() => item.id === "notify" ? lifeos.toggleNotificationsDrawer() : pick(item.id)}>
        <Icon name={item.icon} size={16} />
        {#if item.id === "notify" && lifeosState.unreadNotificationCount > 0}
          <span class="rail-badge tone-err">
            {lifeosState.unreadNotificationCount > 99 ? "99+" : lifeosState.unreadNotificationCount}
          </span>
        {:else if item.id !== "notify" && item.badge}
          <span class="rail-badge tone-{item.badge.tone || 'err'}">
            {item.badge.count > 99 ? "99+" : item.badge.count}
          </span>
        {/if}
      </button>
    {/each}
  </div>
  {#if redbProjection}
    <div class="rail-owner-status" title="Owner-published redb projection">
      <span class:degraded={redbProjection.degraded}></span>
      <small>{redbProjection.localSeq}</small>
    </div>
  {/if}
</aside>

<style>
/* Globe trigger — link dot in corner reflects WAN status */
.rail-switcher-trigger { position: relative; }
.rail-owner-status {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 8px 0 2px; color: var(--fg-4); font-size: 9px;
}
.rail-owner-status span {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--lifeos-green); box-shadow: 0 0 5px var(--tint-green-glow-hi);
}
.rail-owner-status span.degraded { background: var(--status-warn); box-shadow: none; }
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
