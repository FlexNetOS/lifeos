<script>
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebglAddon } from "@xterm/addon-webgl";
  import { Channel } from "@tauri-apps/api/core";
  import "@xterm/xterm/css/xterm.css";
  import Icon from "./Icon.svelte";

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

  const tauri = () => (typeof window === "undefined" ? null : window.__TAURI__);
  const invoke = () => tauri()?.core?.invoke || null;

  const resizeTerminal = async () => {
    if (!terminal || !fitAddon) return;
    fitAddon.fit();
    const call = invoke();
    if (!call || !sessionId) return;
    await call("terminal_resize", {
      sessionId,
      cols: terminal.cols,
      rows: terminal.rows,
    }).catch(() => {});
  };

  const start = async () => {
    const call = invoke();
    if (!call) return;
    try {
      outputChannel = new Channel();
      outputChannel.onmessage = (bytes) => {
        terminal?.write(new Uint8Array(bytes));
      };
      sessionId = await call("terminal_spawn", {
        cols: terminal?.cols || 100,
        rows: terminal?.rows || 30,
        onOutput: outputChannel,
      });
      connected = true;
      await resizeTerminal();
    } catch {
      reconcileMessage = "Engine Room unavailable";
    }
  };

  const sendBytes = async (bytes) => {
    const call = invoke();
    if (!call || !sessionId || !bytes?.length) return;
    await call("terminal_write", { sessionId, bytes: Array.from(bytes) }).catch(() => {
      connected = false;
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
    terminal = new Terminal({
      cols: 100,
      rows: 30,
      cursorBlink: true,
      convertEol: true,
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
    let webgl2 = false;
    try {
      const canvas = document.createElement("canvas");
      webgl2 = !!canvas.getContext("webgl2");
    } catch {
      webgl2 = false;
    }
    if (webgl2) {
      terminal.loadAddon(new WebglAddon());
    }
    terminal.open(terminalEl);
    terminal.onData((data) => sendBytes(new TextEncoder().encode(data)));
    await resizeTerminal();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => resizeTerminal());
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
    if (invoke()) {
      await invoke()("terminal_replay_spool").catch(() => 0);
      const projection = await invoke()("redb_projection_read").catch(() => null);
      redbSeq = projection?.localSeq ?? null;
    }
    await start();
  });

  onDestroy(async () => {
    resizeObserver?.disconnect();
    stopExit?.();
    stopCaptureError?.();
    if (sessionId && invoke()) {
      await invoke()("terminal_close", { sessionId }).catch(() => {});
    }
    outputChannel = null;
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
  {#if !connected}<p class="terminal-hint"><Icon name="info" size={14} /> Terminal input is available in the Tauri shell.</p>{/if}
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
