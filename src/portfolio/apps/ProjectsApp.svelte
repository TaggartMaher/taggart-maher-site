<script lang="ts">
  import CopyLinkButton from "../../shared/CopyLinkButton.svelte";
  import Markdown from "../content/Markdown.svelte";
  import { PROJECTS } from "../content/projects";
  import { getProjectsSelection } from "./appsContext";
  import FocusBar from "./FocusBar.svelte";
  import Statusbar from "./Statusbar.svelte";
  import Toolbar from "./Toolbar.svelte";

  const projects = PROJECTS;
  const selection = getProjectsSelection();

  let view = $state<"grid" | "list">("list");
  let focusMode = $state(false);
  const current = $derived(projects.find((project) => project.id === selection.selectedId));
</script>

<div class={"dol" + (focusMode ? " focus" : "")}>
  <Toolbar path="/home/taggart/Projects">
    {#snippet right()}
      <div class="vw-toggle mono">
        <button class={view === "grid" ? "on" : ""} onclick={() => (view = "grid")}>
          ▦ grid
        </button>
        <button class={view === "list" ? "on" : ""} onclick={() => (view = "list")}>
          ≡ list
        </button>
        <CopyLinkButton />
      </div>
    {/snippet}
  </Toolbar>
  <div class="proj-split">
    <div class={"proj-list " + view}>
      {#if view === "grid"}
        <div class="proj-grid">
          {#each projects as project (project.id)}
            <button
              class={"proj-card" + (selection.selectedId === project.id ? " sel" : "")}
              onclick={() => selection.setSelectedId(project.id)}
            >
              <div class="proj-thumb">
                <div class="thumb-stripes"></div>
                {#if project.heroImage}
                  <img
                    class="thumb-image"
                    src={project.heroImage}
                    alt={project.name}
                    loading="lazy"
                  />
                {:else}
                  <div class="thumb-tag mono">[ thumb ]</div>
                {/if}
                {#if project.status}
                  <div class="status-pill mono">{project.status}</div>
                {/if}
              </div>
              <div class="proj-name">{project.name}</div>
              <div class="proj-tag mono">{project.tag} · {project.year}</div>
            </button>
          {/each}
        </div>
      {:else}
        <table class="proj-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tag</th>
              <th>Year</th>
            </tr>
          </thead>
          <tbody>
            {#each projects as project (project.id)}
              <tr
                class={selection.selectedId === project.id ? "sel" : ""}
                onclick={() => selection.setSelectedId(project.id)}
              >
                <td class="row-name">
                  {project.name}
                  {#if project.status}
                    <span class="status-pill mono inline">{project.status}</span>
                  {/if}
                </td>
                <td class="row-tag mono">{project.tag}</td>
                <td class="row-year mono">{project.year}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
    <aside class="proj-detail">
      {#if current}
        <FocusBar
          {focusMode}
          onChange={(next) => (focusMode = next)}
          readLabel="Read Article"
          backLabel="Back to Article List"
        />
        <div class="detail-thumb">
          <div class="thumb-stripes"></div>
          {#if current.heroImage}
            <img class="thumb-image big" src={current.heroImage} alt={current.name} />
          {:else}
            <div class="thumb-tag mono">[ project image ]</div>
          {/if}
        </div>
        <div class="detail-pad">
          <div class="detail-meta mono">
            {current.tag} · {current.year}{current.status ? " · " + current.status : ""}
          </div>
          <h2 class="serif">{current.name}</h2>
          <p class="lede">{current.oneliner}</p>
          <Markdown html={current.content} />
          <div class="kv-mini">
            <div class="kv-mini-k mono">stack</div>
            <div class="kv-mini-v">
              {#each current.stack as tech (tech)}
                <span class="chip mono">{tech}</span>
              {/each}
            </div>
          </div>
          <div class="detail-links">
            {#each current.links as link (link.label)}
              <a class="btn-go mono" href={link.href}>{link.label} ↗</a>
            {/each}
          </div>
        </div>
      {/if}
    </aside>
  </div>
  <Statusbar count={projects.length} hint={"selected: " + (current ? current.name : "—")} />
</div>
