<script lang="ts">
  import { PORTFOLIO } from "../../portfolio/data";

  const items = PORTFOLIO.mystery;
</script>

<article class="lite-page">
  <h1>Mystery</h1>
  <p class="lite-lede">Upcoming projects that aren't articulable yet.</p>
  {#each items as item (item.id)}
    <div class="lite-mystery-card">
      <div class="lite-mystery-head">
        <span class="lite-mystery-codename">{item.codename}</span>
        <span class="lite-mystery-eta">ETA {item.eta}</span>
      </div>
      <div class="lite-mystery-expansion">{item.expansion}</div>
      <p>{item.hint}</p>
    </div>
  {/each}
</article>
