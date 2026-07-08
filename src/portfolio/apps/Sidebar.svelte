<script lang="ts">
  import Icon, { type IconName } from "../Icon.svelte";
  import { getOpenApp, type AppId } from "./appsContext";

  interface SidebarProps {
    active: AppId;
  }

  let { active }: SidebarProps = $props();

  const openApp = getOpenApp();

  const places: Array<{ id: AppId; icon: IconName; label: string }> = [
    { id: "home", icon: "house", label: "Home" },
    { id: "about", icon: "person", label: "About Me" },
    { id: "experience", icon: "list", label: "Experience" },
    { id: "projects", icon: "wrench", label: "Projects" },
    { id: "blog", icon: "pencil", label: "Blog" },
    { id: "mystery", icon: "lock", label: "Mystery" },
  ];
</script>

<aside class="sidebar">
  <div class="sb-section mono">PLACES</div>
  {#each places as place (place.id)}
    <button
      class={"sb-item" + (active === place.id ? " active" : "")}
      onclick={() => openApp(place.id)}
    >
      <span class="sb-icon"><Icon name={place.icon} /></span>
      <span>{place.label}</span>
    </button>
  {/each}
</aside>
