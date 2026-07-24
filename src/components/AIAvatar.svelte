<script>
  // LifeOS — AIAvatar SFC (Svelte port of AIAvatar.vue)
  // Floating, draggable robot avatar that toggles the AI chat. Hidden if
  // lifeos.aiAvatarHidden is true. Position persists in the store.
  import { onMount, onDestroy } from "svelte";
  import { useLifeos } from "@/stores/lifeos.js";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import Icon from "./Icon.svelte";
  import AIChat from "./AIChat.svelte";

  const lifeos = useLifeos();
  const lifeosState = bindStore(lifeos, ["aiAvatarHidden", "aiChatOpen", "avatarPos"]);

  // Default position: bottom-right with 24px margin.
  let x = $state(0);
  let y = $state(0);
  const placeAtDefault = () => {
    const w = window.innerWidth, h = window.innerHeight;
    x = lifeos.avatarPos?.x ?? (w - 76 - 24);
    y = lifeos.avatarPos?.y ?? (h - 76 - 24);
  };
  onMount(placeAtDefault);

  let drag = $state({ active: false, dx: 0, dy: 0, moved: false });

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { active: true, dx: e.clientX - x, dy: e.clientY - y, moved: false };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };
  const onPointerMove = (e) => {
    if (!drag.active) return;
    const nx = Math.max(8, Math.min(window.innerWidth  - 76 - 8, e.clientX - drag.dx));
    const ny = Math.max(8, Math.min(window.innerHeight - 76 - 8, e.clientY - drag.dy));
    if (Math.abs(nx - x) > 2 || Math.abs(ny - y) > 2) drag.moved = true;
    x = nx;
    y = ny;
  };
  const onPointerUp = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    if (drag.moved) lifeos.setAvatarPos(x, y);
    // If no drag happened, treat as click → toggle chat.
    if (!drag.moved) lifeos.toggleAiChat();
    drag = { active: false, dx: 0, dy: 0, moved: false };
  };

  const onResize = () => {
    // Keep avatar inside the viewport if window shrinks.
    if (x > window.innerWidth  - 76 - 8) x = Math.max(8, window.innerWidth  - 76 - 8);
    if (y > window.innerHeight - 76 - 8) y = Math.max(8, window.innerHeight - 76 - 8);
  };
  onMount(() => window.addEventListener("resize", onResize));
  onDestroy(() => window.removeEventListener("resize", onResize));
</script>

{#if !lifeosState.aiAvatarHidden}
  <div>
    <button class="ai-avatar"
            class:dragging={drag.active}
            class:chat-open={lifeosState.aiChatOpen}
            style="left: {x}px; top: {y}px;"
            onpointerdown={onPointerDown}
            aria-label={lifeosState.aiChatOpen ? "Close AI chat" : "Open AI chat"}
            aria-pressed={lifeosState.aiChatOpen}
            title="Click to chat · drag to move">
      <Icon name={lifeosState.aiChatOpen ? "x" : "bot"} size={22} />
      <span class="ai-avatar-pulse" aria-hidden="true"></span>
    </button>
    {#if lifeosState.aiChatOpen}
      <AIChat anchor={{ x, y }}
              onclose={() => lifeos.closeAiChat()} />
    {/if}
  </div>
{/if}
