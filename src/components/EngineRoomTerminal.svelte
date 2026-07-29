<script>
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { ImageAddon } from "@xterm/addon-image";
  import {
    KittyUnicodePlaceholderAddon,
    KittyUnicodePlaceholderStream,
  } from "../lib/kitty-unicode-placeholders.js";
  import { Channel, invoke as tauriCoreInvoke } from "@tauri-apps/api/core";
  import "@xterm/xterm/css/xterm.css";
  import Icon from "./Icon.svelte";

  let { probe = false } = $props();

  let sessionId = $state("");
  let connected = $state(false);
  let redbSeq = $state(null);
  let reconcileMessage = $state("");
  let terminalEl = $state(null);
  let terminal = null;
  let fitAddon = null;
  let resizeObserver = null;
  let stopExit = null;
  let stopCaptureError = null;
  let outputChannel = null;
  let probeSent = false;
  let probeOutput = "";
  let probeClosed = false;
  let probeAttempts = 0;
  let resizeFrame = null;
  let kittyPlaceholderStream = null;
  let kittyPlaceholderAddon = null;

  const tauri = () => (typeof window === "undefined" ? null : window.__TAURI__);
  const invoke = () => tauri()?.core?.invoke || tauriCoreInvoke;

  // Mirrors GLASS_VT_PROFILE in src-tauri/src/lib.rs. The backend is the source
  // of truth; this is only the browser-preview fallback, and
  // scripts/verify-terminal-capability.mjs asserts the two stay identical.
  const GLASS_VT_FALLBACK = {
    kittyKeyboard: true,
    kittyGraphics: true,
    kittyUnicodePlaceholders: true,
    sixel: true,
    iip: true,
  };

  const fetchCapabilities = async () => {
    const call = invoke();
    if (!call) return GLASS_VT_FALLBACK;
    return (await call("terminal_capabilities").catch(() => null)) || GLASS_VT_FALLBACK;
  };

  // Image protocols size their output from the PTY's pixel geometry, so the
  // rendered screen box has to travel with every cols/rows update.
  const screenPixels = () => {
    const screen = terminalEl?.querySelector(".xterm-screen");
    if (!screen) return { pixelWidth: 0, pixelHeight: 0 };
    const ratio = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    return {
      pixelWidth: Math.round(screen.clientWidth * ratio),
      pixelHeight: Math.round(screen.clientHeight * ratio),
    };
  };

  const recordProbeError = (error) => {
    if (!probe) return;
    const call = invoke();
    void call?.("redb_state_write", {
      key: "lifeos.engine-room.error",
      value: JSON.stringify({
        schemaVersion: "lifeos.engine-room-error.v1",
        observedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    });
  };

  const resizeTerminal = async () => {
    if (!terminal || !fitAddon) return;
    fitAddon.fit();
    const call = invoke();
    if (!call || !sessionId) return;
    await call("terminal_resize", {
      sessionId,
      cols: terminal.cols,
      rows: terminal.rows,
      ...screenPixels(),
    }).catch(() => {});
  };

  const scheduleResize = () => {
    if (typeof requestAnimationFrame === "undefined") {
      void resizeTerminal();
      return;
    }
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      void resizeTerminal();
    });
  };

  const start = async () => {
    const call = invoke();
    if (!call) return;
    try {
      if (probe) {
        void call("redb_state_write", {
          key: "lifeos.engine-room.component-start",
          value: JSON.stringify({
            schemaVersion: "lifeos.engine-room-component-start.v1",
            observedAt: Date.now(),
            probe,
          }),
        });
      }
      outputChannel = new Channel();
      // One streaming decoder for the whole session: a multi-byte UTF-8 sequence
      // split across two channel frames would otherwise decode to replacement
      // characters. The terminal itself is fed raw bytes and is unaffected.
      const probeDecoder = new TextDecoder("utf-8");
      outputChannel.onmessage = (bytes) => {
        const frame = new Uint8Array(bytes);
        const text = probeDecoder.decode(frame, { stream: true });
        const rendererFrame = kittyPlaceholderStream?.feed(frame) || frame;
        terminal?.write(rendererFrame);
        if (probe && !probeClosed) {
          probeOutput = `${probeOutput}${text}`.slice(-16_384);
          if (probeOutput.includes("LIFEOS_ENGINE_PROBE_DONE")) {
            probeClosed = true;
            const owner = invoke();
            void owner?.("redb_state_write", {
              key: "lifeos.engine-room.ready",
              value: JSON.stringify({
                schemaVersion: "lifeos.engine-room-ready.v1",
                state: "ready",
                observedAt: Date.now(),
                sessionId,
                argv: [
                  "yzx",
                  "enter",
                  "--session",
                  "<database-derived>",
                ],
                nushellMarker: probeOutput.includes("LIFEOS_NUSHELL_PROBE"),
                outputTail: probeOutput.slice(-2_048),
              }),
            }).finally(() => {
              window.setTimeout(() => {
                void owner?.("terminal_close", { sessionId });
              }, 500);
            });
          }
        }
      };
      const spawnedSessionId = await call("terminal_spawn", {
        cols: terminal?.cols || 100,
        rows: terminal?.rows || 30,
        ...screenPixels(),
        onOutput: outputChannel,
      });
      sessionId = spawnedSessionId;
      connected = true;
      if (probe) {
        void call("redb_state_write", {
          key: "lifeos.engine-room.component-spawned",
          value: JSON.stringify({
            schemaVersion: "lifeos.engine-room-component-spawned.v1",
            observedAt: Date.now(),
            sessionId: spawnedSessionId,
          }),
        });
      }
      if (probe && !probeSent) {
        probeSent = true;
        probeAttempts = 15;
        void call("redb_state_write", {
          key: "lifeos.engine-room.probe-scheduled",
          value: JSON.stringify({
            schemaVersion: "lifeos.engine-room-probe-scheduled.v1",
            observedAt: Date.now(),
            sessionId: spawnedSessionId,
          }),
        });
        void call("terminal_probe", { sessionId: spawnedSessionId })
          .then((verified) => {
            if (!verified) return;
            void call("redb_state_write", {
              key: "lifeos.engine-room.ready",
              value: JSON.stringify({
                schemaVersion: "lifeos.engine-room-ready.v1",
                state: "ready",
                observedAt: Date.now(),
                sessionId: spawnedSessionId,
                argv: ["yzx", "enter", "--session", "<database-derived>"],
                nushellMarker: true,
                source: "zellij-pane",
              }),
            });
          })
          .catch((error) => {
            recordProbeError(error);
          });
      }
      await resizeTerminal();
    } catch (error) {
      reconcileMessage = "Engine Room unavailable";
      recordProbeError(error);
    }
  };

  const sendBytes = async (bytes, targetSessionId = sessionId) => {
    const call = invoke();
    if (!call || !targetSessionId || !bytes?.length) return;
    await call("terminal_write", { sessionId: targetSessionId, bytes: Array.from(bytes) }).catch((error) => {
      connected = false;
      recordProbeError(error);
    });
  };

  const reconcile = async () => {
    const call = invoke();
    if (!call) return;
    reconcileMessage = "Reconciling…";
    const receipt = await call("envctl_drain", { maxBatch: 500 }).catch((error) => ({ error }));
    if (receipt?.error) {
      reconcileMessage = "envctl unavailable";
      return;
    }
    await call("envctl_return_projection").catch(() => null);
    reconcileMessage = `Committed ${receipt.committed?.length || 0} record(s) · generation ${receipt.generation}`;
  };

  onMount(async () => {
    try {
      const caps = await fetchCapabilities();
      terminal = new Terminal({
      cols: 100,
      rows: 30,
      cursorBlink: true,
      // The PTY carries a real terminal stream: Zellij emits its own CRLF and
      // absolute cursor positioning. Rewriting LF would corrupt that surface.
      convertEol: false,
      // Required by the image addon.
      allowProposedApi: true,
      kittyKeyboard: caps.kittyKeyboard !== false,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      theme: {
        background: "#08090d",
        foreground: "#d9e1ea",
        cursor: "#00d4ff",
        selectionBackground: "rgba(0, 212, 255, 0.25)",
      },
    });
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    try {
      terminal.loadAddon(
        new ImageAddon({
          sixelSupport: caps.sixel !== false,
          iipSupport: caps.iip !== false,
          kittySupport: caps.kittyGraphics !== false,
        }),
      );
    } catch {
      // Images are an enhancement; a failed addon must not take the pane down.
      // Yazi falls back to Chafa ASCII when no protocol renders.
    }
    if (caps.kittyUnicodePlaceholders) {
      kittyPlaceholderStream = new KittyUnicodePlaceholderStream();
      kittyPlaceholderAddon = new KittyUnicodePlaceholderAddon();
      terminal.loadAddon(kittyPlaceholderAddon);
    }
    let webgl2 = false;
    try {
      const canvas = document.createElement("canvas");
      webgl2 = !!canvas.getContext("webgl2");
    } catch {
      webgl2 = false;
    }
    if (webgl2) {
      try {
        terminal.loadAddon(new WebglAddon());
      } catch {
        // WebGL is an optional renderer; xterm's DOM renderer remains the
        // authoritative byte-preserving fallback for the PTY surface.
      }
    }
    terminal.open(terminalEl);
    terminal.onData((data) => sendBytes(new TextEncoder().encode(data)));
    // `onBinary` carries 8-bit payloads (mouse reports and similar) as a string
    // of raw char codes. Encoding it as UTF-8 would corrupt any byte >= 0x80.
    terminal.onBinary((data) =>
      sendBytes(Uint8Array.from(data, (char) => char.charCodeAt(0) & 0xff)),
    );
    await resizeTerminal();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(terminalEl);
    }

    const events = tauri()?.event;
    if (events) {
      stopExit = await events.listen("lifeos:terminal-exit", (event) => {
        if (event.payload?.sessionId === sessionId) connected = false;
      });
      stopCaptureError = await events.listen("lifeos:terminal-capture-error", (event) => {
        if (event.payload?.sessionId === sessionId) {
          reconcileMessage = "Terminal capture unavailable — output paused";
          connected = false;
        }
      });
    }
    await start();
      if (invoke()) {
        await invoke()("terminal_replay_spool").catch(() => 0);
        const projection = await invoke()("redb_projection_read").catch(() => null);
        redbSeq = projection?.localSeq ?? null;
      }
    } catch (error) {
      reconcileMessage = "Engine Room unavailable";
      recordProbeError(error);
    }
  });

  onDestroy(async () => {
    resizeObserver?.disconnect();
    if (resizeFrame !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
    stopExit?.();
    stopCaptureError?.();
    if (sessionId && invoke()) {
      await invoke()("terminal_close", { sessionId }).catch(() => {});
    }
    outputChannel = null;
    kittyPlaceholderStream = null;
    kittyPlaceholderAddon = null;
    terminal?.dispose();
  });
</script>

<section class="engine-room" aria-label="Yazelix Engine Room">
  <header class="engine-room-head">
    <div>
      <span class="eyebrow">ENGINE ROOM</span>
      <h1>Yazelix</h1>
      <p><code>yzx enter</code> · repository-backed terminal</p>
      {#if redbSeq !== null}<p class="redb-status">redb projection · generation {redbSeq}</p>{/if}
    </div>
    <span class:online={connected} class="status">{connected ? "connected" : "browser preview"}</span>
  </header>

  <div class="reconcile-bar">
    <span>{reconcileMessage || "redb owner → envctl → PostgreSQL/RuVector"}</span>
    <button type="button" onclick={reconcile} disabled={!connected}>Reconcile</button>
  </div>

  <div class="terminal-output" bind:this={terminalEl} role="application" aria-label="Yazelix terminal"></div>
  {#if !connected}<p class="terminal-hint"><Icon name="info" size={14} /> Terminal input is available in the Yazelix Nushell Engine Room.</p>{/if}
</section>

<style>
  .engine-room { height: 100%; display: flex; flex-direction: column; padding: 28px; gap: 18px; background: var(--bg-0); color: var(--fg-1); }
  .engine-room-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--bg-3); padding-bottom: 18px; }
  .eyebrow { color: var(--lifeos-cyan); font-size: 10px; letter-spacing: .16em; }
  h1 { margin: 6px 0 2px; font-size: 24px; font-weight: 500; }
  p { color: var(--fg-3); margin: 0; font-size: 12px; }
  code { color: var(--lifeos-green); }
  .status { color: var(--fg-3); font-size: 11px; }
  .status.online { color: var(--lifeos-green); }
  .terminal-output { flex: 1; min-height: 260px; overflow: hidden; margin: 0; padding: 10px; border: 1px solid var(--bg-3); border-radius: var(--radius-lg); background: #08090d; }
  .reconcile-bar { display: flex; justify-content: space-between; align-items: center; color: var(--fg-3); font-size: 11px; }
  .reconcile-bar button { border: 1px solid var(--bg-3); border-radius: var(--radius-md); padding: 6px 10px; }
  .terminal-hint { display: flex; align-items: center; gap: 6px; color: var(--fg-3); font-size: 11px; }
  button { border: 0; background: transparent; color: var(--fg-3); cursor: pointer; }
  button:not(:disabled):hover { color: var(--lifeos-cyan); }
  button:disabled { opacity: .4; cursor: default; }
</style>
