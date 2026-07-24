<script>
  // LifeOS — Icon SFC (Svelte port of Icon.vue)
  // Vue's v-if/v-else root pair auto-forwards fallthrough attrs (class/style) to
  // whichever branch renders — Workspace.vue relies on this for the chevron
  // rotate transform (`<Icon class="ws-selector-chev" :style="{...}" />`).
  // Svelte doesn't auto-forward, so `...rest` is captured and spread explicitly
  // onto both branches to keep that behavior identical.
  import { icons } from "@/lib/icons-svelte.js";

  let { name, size = 16, strokeWidth = 1.75, ...rest } = $props();

  let Comp = $derived(icons[name] || null);
</script>

{#if Comp}
  <Comp {size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />
{:else}
  <span style="display: inline-block; width: {size}px; height: {size}px;" aria-hidden="true" {...rest}></span>
{/if}
