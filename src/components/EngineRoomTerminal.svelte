<script>
  import { onMount, onDestroy } from "svelte";
  import Icon from "./Icon.svelte";

  let sessionId = $state("");
  let output = $state("");
  let input = $state("");
  let connected = $state(false);
  let redbSeq = $state(null);
  let terminalEl = $state(null);
  let stopOutput = null;
  let stopExit = null;

  const tauri = () => (typeof window === "undefined" ? null : window.__TAURI__);
  const invoke = () => tauri()?.core?.invoke || null;

  const append = (bytes) => {
    output += new TextDecoder().decode(new Uint8Array(bytes));
    queueMicrotask(() => {
      if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
    });
  };

  const start = async () => {
    const call = invoke();
    if (!call) return;
    sessionId = await call("terminal_spawn", { cols: 100, rows: 30 });
    connected = true;
  };

  const send = async () => {
    const call = invoke();
    if (!call || !sessionId || !input) return;
    const bytes = Array.from(new TextEncoder().encode(`${input}\n`));
    await call("terminal_write", { sessionId, bytes });
    input = "";
  };

  const onKeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  onMount(async () => {
    const events = tauri()?.event;
    if (events) {
      stopOutput = await events.listen("lifeos:terminal-output", (event) => {
        if (event.payload?.sessionId === sessionId) append(event.payload.bytes || []);
      });
      stopExit = await events.listen("lifeos:terminal-exit", (event) => {
        if (event.payload?.sessionId === sessionId) connected = false;
      });
    }
    if (invoke()) {
      const projection = await invoke()("redb_projection_read").catch(() => null);
      redbSeq = projection?.localSeq ?? null;
    }
    await start();
  });

  onDestroy(async () => {
    stopOutput?.();
    stopExit?.();
    if (sessionId && invoke()) {
      await invoke()("terminal_close", { sessionId }).catch(() => {});
    }
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

  <pre class="terminal-output" bind:this={terminalEl} aria-live="polite">{output || "Waiting for the Engine Room…"}</pre>
  <form class="terminal-input" onsubmit={(event) => { event.preventDefault(); send(); }}>
    <Icon name="chevron-right" size={15} />
    <textarea bind:value={input} onkeydown={onKeydown} aria-label="Engine Room command"
      placeholder={connected ? "Enter a command" : "Terminal is available in the Tauri shell"}
      disabled={!connected} rows="1"></textarea>
    <button type="submit" disabled={!connected || !input.trim()} aria-label="Send command">
      <Icon name="corner-down-left" size={15} />
    </button>
  </form>
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
  .terminal-output { flex: 1; min-height: 260px; overflow: auto; margin: 0; padding: 18px; border: 1px solid var(--bg-3); border-radius: var(--radius-lg); background: #08090d; color: var(--fg-2); font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
  .terminal-input { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--bg-3); border-radius: var(--radius-md); background: var(--bg-1); color: var(--lifeos-cyan); }
  textarea { flex: 1; resize: none; border: 0; outline: 0; background: transparent; color: var(--fg-1); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  button { border: 0; background: transparent; color: var(--fg-3); cursor: pointer; }
  button:not(:disabled):hover { color: var(--lifeos-cyan); }
  button:disabled { opacity: .4; cursor: default; }
</style>
