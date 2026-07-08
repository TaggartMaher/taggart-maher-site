<script lang="ts">
  import { PORTFOLIO } from "../data";
  import Sidebar from "./Sidebar.svelte";
  import Toolbar from "./Toolbar.svelte";

  const about = PORTFOLIO.about;
</script>

<div class="dol">
  <Toolbar path="/home/taggart/About Me" />
  <div class="dol-body">
    <Sidebar active="about" />
    <div class="doc-pad">
      <div class="readme-meta mono">about.md · ~ · last edited [date]</div>
      <h1 class="serif">{about.headline}</h1>
      <p class="lede">{about.tldr}</p>

      <h3>Fact sheet</h3>
      <table class="kv">
        <tbody>
          {#each about.facts as [factKey, factValue] (factKey)}
            <tr>
              <th class="mono">{factKey}</th>
              <td>{factValue}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <h3>Channels</h3>
      <ul class="links">
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
</div>
