<script lang="ts">
  import Link from "../../router/Link.svelte";
  import { PROJECTS } from "../../portfolio/content/projects";
</script>

<article class="lite-page">
  <h1>Projects</h1>
  <p class="lite-lede">Stuff I engineer on my own free will.</p>
  <p class="lite-lede">More coming soon.</p>
  <p class="lite-lede">I just didn't have time to do full writeups of everything yet.</p>
  <ul class="lite-card-list">
    {#each PROJECTS as project (project.id)}
      <li>
        <Link to={"/projects/" + project.id} class="lite-card">
          <div class="lite-card-meta">
            {project.tag} · {project.year}{project.status ? " · " + project.status : ""}
          </div>
          <h2 class="lite-card-title">{project.name}</h2>
          <p class="lite-card-excerpt">{project.oneliner}</p>
        </Link>
      </li>
    {/each}
  </ul>
</article>
