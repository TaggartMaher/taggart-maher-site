<script lang="ts">
  import { PORTFOLIO } from "../../portfolio/data";

  const rows = PORTFOLIO.experience;
</script>

<article class="lite-page">
  <h1>Experience</h1>
  <p class="lite-lede">A log of where I've spent my time professionally.</p>
  <ol class="lite-timeline">
    {#each rows as row, rowIndex (rowIndex)}
      <li class="lite-timeline-row">
        <div class="lite-timeline-year">{row.year}</div>
        <div class="lite-timeline-head">
          <span class="lite-timeline-role">{row.role}</span>
          <span class="lite-timeline-org">{row.org}</span>
          <span class="lite-timeline-where">— {row.where}</span>
        </div>
        <ul class="lite-timeline-bullets">
          {#each row.bullets as bullet, bulletIndex (bulletIndex)}
            <li>{bullet}</li>
          {/each}
        </ul>
      </li>
    {/each}
  </ol>
</article>
