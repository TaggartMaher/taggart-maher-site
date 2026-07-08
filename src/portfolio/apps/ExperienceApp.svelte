<script lang="ts">
  import { PORTFOLIO } from "../data";
  import Sidebar from "./Sidebar.svelte";
  import Toolbar from "./Toolbar.svelte";

  const rows = PORTFOLIO.experience;
</script>

<div class="dol">
  <Toolbar path="/home/taggart/Experience" />
  <div class="dol-body">
    <Sidebar active="experience" />
    <div class="doc-pad">
      <h1 class="serif">Experience</h1>
      <p class="lede">A log of where I've spent my time professionally.</p>
      <ol class="timeline">
        {#each rows as row, index (index)}
          <li class={"tl-row tl-" + row.kind}>
            <div class="tl-year mono">{row.year}</div>
            <div class="tl-rail">
              <span class="tl-dot"></span>
            </div>
            <div class="tl-body">
              <div class="tl-head">
                <span class="tl-role serif">{row.role}</span>
                <span class="tl-org">{row.org}</span>
                <span class="tl-where mono">— {row.where}</span>
              </div>
              <ul class="tl-bullets">
                {#each row.bullets as bullet, bulletIndex (bulletIndex)}
                  <li>{bullet}</li>
                {/each}
              </ul>
            </div>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</div>
