<script lang="ts">
  import { PORTFOLIO } from "../data";
  import Toolbar from "./Toolbar.svelte";

  const about = PORTFOLIO.about;
</script>

<div class="page-pad">
  <Toolbar path="/home/taggart/Contact" />
  <div class="doc-pad">
    <h1 class="serif">Contact</h1>
    <p class="lede">Pick a channel.</p>
    <ul class="links big">
      {#each about.links as link (link.label)}
        <li>
          <a href={link.href} class="link-row">
            <span class="link-name">{link.label}</span>
            <span class="link-hint mono">{link.hint}</span>
            <span class="link-go mono">open ↗</span>
          </a>
        </li>
      {/each}
    </ul>
  </div>
</div>
