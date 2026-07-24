<script>
  // LifeOS — MenuRow SFC (Svelte port of MenuRow.vue)
  // Renders a section item inside the workspace panel.
  import Icon from "./Icon.svelte";
  import Badge from "./Badge.svelte";

  let { item, collapsed = false, onclick } = $props();

  function activate() {
    onclick?.(item);
  }

  function onRowKeydown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  }
</script>

<div class="menu-row" class:active={item.active} class:collapsed
     data-figma-component="Sidebar Companion/Menu row"
     title={collapsed ? item.label : undefined}
     role="button"
     tabindex="0"
     onclick={activate}
     onkeydown={onRowKeydown}>
  <span class="lead">
    <Icon name={item.icon || "circle"} size={16} />
    {#if item.status}
      <span class="lead-status">
        <Badge dot tone={item.status === "warn" ? "warn" : "ok"} />
      </span>
    {/if}
    {#if collapsed && item.badge}
      <Badge {...item.badge} />
    {/if}
  </span>
  {#if !collapsed}
    <span class="body">
      <span class="label">{item.label}</span>
      {#if item.meta}<span class="meta">{item.meta}</span>{/if}
    </span>
    {#if item.badge}<span class="trail"><Badge {...item.badge} /></span>{/if}
    {#if item.shortcut}<kbd class="kbd">{item.shortcut}</kbd>{/if}
  {/if}
</div>
