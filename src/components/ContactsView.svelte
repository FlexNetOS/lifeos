<script>
  // LifeOS — ContactsView SFC (Svelte port of ContactsView.vue)
  // Work → Contacts AND Personal → Contacts subsection, plus the rail-footer
  // aggregator entry (activeId === "contacts" && !activeSub).
  // Canvas pattern: 1fr 320px on desktop, 1fr below 960 px.
  // Static-first, token-only, no new deps.

  import { useLifeos } from "@/stores/lifeos.js";
  import { createNav } from "@/lib/svelte-nav.js";
  import { bindStore } from "@/lib/pinia-bridge.svelte.js";
  import { useToasts } from "@/stores/toasts.js";
  import { router as appRouter } from "@/router";
  import Icon from "./Icon.svelte";

  let { router = appRouter } = $props();

  const lifeos  = useLifeos();
  const nav     = createNav(router);
  const toasts  = useToasts();
  const lifeosState = bindStore(lifeos, ["activeId"]);

  // ---------- Data ----------
  let raw = $derived(globalThis.LIFEOS_DATA?.contacts || { work: [], personal: [] });

  // Determine context: aggregator (contacts rail-footer) vs workspace sub.
  // When activeId === "contacts" there is no activeSub; show both workspaces merged.
  let isAggregator = $derived(lifeosState.activeId === "contacts");

  // Build the displayed list before filter.
  // Each contact gets an optional _workspace badge for aggregator context.
  let allContacts = $derived.by(() => {
    if (isAggregator) {
      return [
        ...raw.work.map((c) => ({ ...c, _workspace: "Work" })),
        ...raw.personal.map((c) => ({ ...c, _workspace: "Personal" })),
      ];
    }
    // Workspace sub: pick by activeId
    if (lifeosState.activeId === "work") return raw.work.map((c) => ({ ...c }));
    if (lifeosState.activeId === "personal") return raw.personal.map((c) => ({ ...c }));
    // Fallback: show everything
    return [
      ...raw.work.map((c) => ({ ...c, _workspace: "Work" })),
      ...raw.personal.map((c) => ({ ...c, _workspace: "Personal" })),
    ];
  });

  // ---------- Local star overrides ----------
  // Keyed by contact id. undefined = use original value from data.
  const starOverrides = $state({});

  const isStarred = (c) =>
    starOverrides[c.id] !== undefined ? starOverrides[c.id] : c.starred;

  const toggleStar = (c) => {
    starOverrides[c.id] = !isStarred(c);
  };

  // ---------- Filter ----------
  // Chips: All | Starred | Recent | (Work | Personal — aggregator only)
  let activeFilter = $state("all");

  let filterChips = $derived.by(() => {
    const base = ["all", "starred", "recent"];
    if (isAggregator) return [...base, "work", "personal"];
    return base;
  });

  let filteredContacts = $derived.by(() => {
    const list = allContacts;
    const f = activeFilter;
    if (f === "starred")  return list.filter((c) => isStarred(c));
    if (f === "recent")   return list.filter((c) => isRecent(c.lastSeen));
    if (f === "work")     return list.filter((c) => c._workspace === "Work");
    if (f === "personal") return list.filter((c) => c._workspace === "Personal");
    return list;
  });

  // "recent" = seen within the last day (heuristic on the lastSeen string)
  const isRecent = (lastSeen) => {
    if (!lastSeen) return false;
    return /ago|just now/.test(lastSeen) && !(/w ago|mo ago|d ago/.test(lastSeen));
  };

  // ---------- Stats ----------
  let count   = $derived(allContacts.length);
  let starred = $derived(allContacts.filter((c) => isStarred(c)).length);

  // ---------- Frequent card (right rail) ----------
  // Top 5: starred first, then by lastSeen recency proxy (sort order in array).
  let frequentContacts = $derived.by(() => {
    const list = [...allContacts];
    list.sort((a, b) => {
      const aS = isStarred(a) ? 0 : 1;
      const bS = isStarred(b) ? 0 : 1;
      return aS - bS;
    });
    return list.slice(0, 5);
  });

  // ---------- Avatar ----------
  const TONE = globalThis.TONE || {};
  const toneStyle = (tone) => {
    const t = TONE[tone] || {};
    return `background: ${t.bg || "var(--bg-3)"}; color: ${t.fg || "var(--fg-1)"};`;
  };

  const initials = (name) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase();

  // ---------- Navigation ----------
  const backToDashboard = () => nav.clearSub();

  // ---------- Row click ----------
  const openContact = (c) => {
    toasts.info(`Opening conversation with ${c.name} — coming soon`);
  };

  const onRowKeydown = (e, c) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openContact(c);
    }
  };

  // ---------- Quick actions ----------
  const newContact = () => {
    toasts.info("New contact — coming soon");
  };
  const importCsv = () => {
    toasts.info("Import CSV — coming soon");
  };
  const syncFrom = () => {
    toasts.info("Sync from external source — coming soon");
  };

  // ---------- Label helpers ----------
  const chipLabel = (f) => {
    if (f === "all")      return "All";
    if (f === "starred")  return "Starred";
    if (f === "recent")   return "Recent";
    if (f === "work")     return "Work";
    if (f === "personal") return "Personal";
    return f;
  };

  let eyebrow = $derived.by(() => {
    if (isAggregator) return "All workspaces · Contacts";
    if (lifeosState.activeId === "work") return "Work · Contacts";
    if (lifeosState.activeId === "personal") return "Personal · Contacts";
    return "Contacts";
  });
</script>

<div class="canvas contacts-canvas" role="region" aria-label="Contacts">

  <header class="lights-head">
    <div>
      <div class="canvas-eyebrow">{eyebrow}</div>
      <h1>Contacts</h1>
      <p class="lights-summary">{count} people · {starred} starred</p>
    </div>
    {#if !isAggregator}
      <button
        class="lights-back"
        type="button"
        onclick={backToDashboard}
        aria-label="Back to dashboard"
      >
        <Icon name="arrow-left" size={14} /> Dashboard
      </button>
    {/if}
  </header>

  <!-- Empty state -->
  {#if !allContacts.length}
    <div class="sub-empty">
      <Icon name="users" size={20} />
      <p>No contacts yet · Import or add one to get started.</p>
    </div>
  {:else}
    <div class="contacts-body">
      <!-- ====== LEFT MAIN ====== -->
      <div class="contacts-main">

        <!-- Filter chips -->
        <div class="contacts-chips" role="radiogroup" aria-label="Filter contacts">
          {#each filterChips as f (f)}
            <button
              class="contacts-chip"
              class:active={activeFilter === f}
              role="radio"
              aria-checked={activeFilter === f}
              onclick={() => activeFilter = f}
            >{chipLabel(f)}</button>
          {/each}
        </div>

        <!-- Contact list -->
        <!-- svelte-ignore a11y_no_redundant_roles -->
        <ul
          class="contacts-list"
          role="list"
          aria-label="Contacts"
        >
          {#each filteredContacts as c (c.id)}
            <!-- svelte-ignore a11y_no_redundant_roles, a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
            <li
              class="contacts-row"
              role="listitem"
              aria-label={`${c.name}, ${c.role}${c.organisation ? ', ' + c.organisation : ''}. ${c.channel === 'mail' ? 'Email: ' + c.email : c.channel === 'phone' ? 'Phone: ' + c.phone : 'Message: ' + c.email}. Last seen ${c.lastSeen}.`}
              onclick={() => openContact(c)}
              tabindex="0"
              onkeydown={(e) => onRowKeydown(e, c)}
            >
              <!-- Avatar -->
              <span
                class="contacts-avatar"
                style={toneStyle(c.avatarTone)}
                aria-hidden="true"
              >{initials(c.name)}</span>

              <!-- Name + role -->
              <span class="contacts-info">
                <span class="contacts-name">{c.name}</span>
                <span class="contacts-sub">
                  {c.role}{c.organisation ? ' · ' + c.organisation : ''}
                </span>
              </span>

              <!-- Workspace badge (aggregator only) -->
              {#if c._workspace}
                <span
                  class={`contacts-ws-badge ${c._workspace === 'Work' ? 'contacts-ws-badge--work' : 'contacts-ws-badge--personal'}`}
                >{c._workspace}</span>
              {/if}

              <!-- Channel icon -->
              <span class="contacts-channel" aria-hidden="true">
                <Icon name={c.channel} size={13} />
              </span>

              <!-- Last seen -->
              <span class="contacts-lastseen">{c.lastSeen}</span>

              <!-- Star button -->
              <button
                class="contacts-star"
                type="button"
                aria-pressed={isStarred(c)}
                aria-label={isStarred(c) ? 'Unstar ' + c.name : 'Star ' + c.name}
                class:contacts-star--on={isStarred(c)}
                onclick={(e) => { e.stopPropagation(); toggleStar(c); }}
              >
                <Icon name="star" size={13} />
              </button>
            </li>
          {/each}
        </ul>

        <!-- Empty filter state -->
        {#if filteredContacts.length === 0 && allContacts.length > 0}
          <div class="sub-empty">
            <Icon name="users" size={16} />
            <p>No contacts match this filter.</p>
          </div>
        {/if}

      </div>

      <!-- ====== RIGHT RAIL ====== -->
      <!-- svelte-ignore a11y_no_redundant_roles -->
      <section class="contacts-rail" role="region" aria-label="Contacts quick actions">

        <!-- Quick actions -->
        <div class="contacts-rail-card">
          <p class="contacts-rail-title">Quick actions</p>
          <div class="contacts-actions">
            <button class="contacts-action-btn" type="button" onclick={newContact}>
              <Icon name="user-plus" size={13} aria-hidden="true" /> New contact
            </button>
            <button class="contacts-action-btn" type="button" onclick={importCsv}>
              <Icon name="upload" size={13} aria-hidden="true" /> Import CSV
            </button>
            <button class="contacts-action-btn" type="button" onclick={syncFrom}>
              <Icon name="refresh-cw" size={13} aria-hidden="true" /> Sync from...
            </button>
          </div>
        </div>

        <!-- Frequent -->
        <div class="contacts-rail-card">
          <p class="contacts-rail-title">Frequent</p>
          <!-- svelte-ignore a11y_no_redundant_roles -->
          <ul class="contacts-frequent-list" role="list" aria-label="Frequent contacts">
            {#each frequentContacts as c (c.id)}
              <!-- svelte-ignore a11y_no_redundant_roles -->
              <li
                class="contacts-frequent-row"
                role="listitem"
              >
                <span
                  class="contacts-avatar contacts-avatar--sm"
                  style={toneStyle(c.avatarTone)}
                  aria-hidden="true"
                >{initials(c.name)}</span>
                <span class="contacts-frequent-info">
                  <span class="contacts-name">{c.name}</span>
                  <span class="contacts-sub">{c.lastSeen}</span>
                </span>
                {#if isStarred(c)}
                  <Icon
                    name="star"
                    size={11}
                    class="contacts-frequent-star"
                    aria-hidden="true"
                  />
                {/if}
              </li>
            {/each}
          </ul>
        </div>

      </section>
    </div>
  {/if}

</div>
