<script lang="ts">
  import Icon, { type IconName } from "../Icon.svelte";
  import { getOpenApp, type AppId } from "./appsContext";
  import Sidebar from "./Sidebar.svelte";
  import Statusbar from "./Statusbar.svelte";
  import Toolbar from "./Toolbar.svelte";

  const openApp = getOpenApp();

  interface HomeItem {
    id: AppId;
    icon: IconName;
    label: string;
    sub: string;
    classified?: boolean;
  }

  const items: HomeItem[] = [
    { id: "about", icon: "person", label: "About Me", sub: "who I am" },
    { id: "experience", icon: "list", label: "Experience", sub: "where I've been" },
    { id: "projects", icon: "wrench", label: "Projects", sub: "what I've built" },
    { id: "blog", icon: "pencil", label: "Blog", sub: "things I wrote" },
    { id: "mystery", icon: "lock", label: "Mystery", sub: "in development", classified: true },
    { id: "readme", icon: "document", label: "README.md", sub: "start here" },
    { id: "contact", icon: "envelope", label: "Contact", sub: "reach out" },
  ];

  let selectedId = $state<AppId | null>(null);
  const selected = $derived(selectedId ? items.find((item) => item.id === selectedId) : null);

  function handleBackgroundClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains("dol-grid") || target.classList.contains("dol-body")) {
      selectedId = null;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dol" onclick={handleBackgroundClick}>
  <Toolbar path="/home/taggart" />
  <div class="dol-body">
    <Sidebar active="home" />
    <div class="dol-grid">
      {#each items as item (item.id)}
        <button
          class={"dol-item" +
            (item.classified ? " classified" : "") +
            (selectedId === item.id ? " sel" : "")}
          onclick={() => (selectedId = item.id)}
          ondblclick={() => openApp(item.id)}
        >
          <div class="dol-ico"><Icon name={item.icon} /></div>
          <div class="dol-name">{item.label}</div>
          <div class="dol-sub mono">{item.sub}</div>
        </button>
      {/each}
    </div>
  </div>
  <Statusbar
    count={items.length}
    hint={selected
      ? `"${selected.label}" — double-click to open`
      : "Double-click any item to open · single-click to select"}
  />
</div>
