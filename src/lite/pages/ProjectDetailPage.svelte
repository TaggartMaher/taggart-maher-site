<script lang="ts">
  import Link from "../../router/Link.svelte";
  import Markdown from "../../portfolio/content/Markdown.svelte";
  import { PROJECTS } from "../../portfolio/content/projects";
  import CopyLinkButton from "../../shared/CopyLinkButton.svelte";
  import NotFoundPage from "./NotFoundPage.svelte";

  let { projectId }: { projectId: string } = $props();

  const project = $derived(PROJECTS.find((entry) => entry.id === projectId));
</script>

{#if !project}
  <NotFoundPage />
{:else}
  <article class="lite-page">
    <Link to="/projects" class="lite-detail-back">← all projects</Link>
    <p class="lite-detail-meta">
      {project.tag} · {project.year}{project.status ? " · " + project.status : ""}
    </p>
    <h1>{project.name}</h1>
    <p class="lite-lede">{project.oneliner}</p>
    <Markdown html={project.content} />
    <h3>Stack</h3>
    <div class="lite-chip-row">
      {#each project.stack as tech (tech)}
        <span class="lite-chip">{tech}</span>
      {/each}
    </div>
    {#if project.links.length > 0}
      <h3>Links</h3>
      <ul class="lite-link-list">
        {#each project.links as link (link.label)}
          <li>
            <a href={link.href}>
              <span class="lite-link-name">{link.label}</span>
              <span class="lite-link-hint">↗</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    <CopyLinkButton />
  </article>
{/if}
