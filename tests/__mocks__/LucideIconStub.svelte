<script>
  // Vitest-only stub backing lucide-svelte.js — mirrors lucide-vue.js's stub
  // component (a generic <svg data-test="lucide-icon" />) but as a real .svelte
  // file, since Svelte components (unlike Vue's defineComponent) can't be built
  // as a plain inline JS object — they have to go through the compiler.
  let { size = 16 } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-test="lucide-icon"></svg>
