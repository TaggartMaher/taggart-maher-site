<script lang="ts">
  import { PORTFOLIO } from "../../portfolio/data";

  const about = PORTFOLIO.about;
</script>

<article class="lite-page">
  <h1>{about.headline}</h1>
  <p class="lite-lede">{about.tldr}</p>

  <h2>Fact sheet</h2>
  <table class="lite-fact-table">
    <tbody>
      {#each about.facts as [factKey, factValue] (factKey)}
        <tr>
          <th>{factKey}</th>
          <td>{factValue}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <h2>Channels</h2>
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
