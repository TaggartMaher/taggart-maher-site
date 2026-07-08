<script lang="ts">
  import { PORTFOLIO } from "../../portfolio/data";

  const about = PORTFOLIO.about;
</script>

<article class="lite-page">
  <h1>Contact</h1>
  <p class="lite-lede">Pick a channel.</p>
  <ul class="lite-link-list">
    {#each about.links as link (link.label)}
      <li>
        <a href={link.href}>
          <span class="lite-link-name">{link.label}</span>
          <span class="lite-link-hint">{link.hint}</span>
        </a>
      </li>
    {/each}
  </ul>
</article>
