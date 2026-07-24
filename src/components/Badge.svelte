<script>
  // LifeOS — Badge SFC (Svelte port of Badge.vue)
  // Mirrors the React kit's Badge / Pill / StatusDot primitives.
  let {
    count = null,
    tone = "ok",             // info | warn | err | ok | purple | cyan | green | neutral
    pulse = false,
    dot = false,
    variant = "count",        // count | pill
    children,
  } = $props();

  let dotBg = $derived(
    tone === "warn" ? "var(--status-warn)" : tone === "err" ? "var(--status-err)" : "var(--lifeos-green)",
  );
</script>

{#if dot}
  <span class="status-dot" class:pulse style="background: {dotBg};" aria-hidden="true"></span>
{:else if variant === "pill"}
  <span class="pill tone-{tone || 'ok'}">{@render children?.()}</span>
{:else if count != null}
  <span class="count tone-{tone || 'err'}" class:pulse-ring={pulse}>{count > 99 ? "99+" : count}</span>
{/if}
