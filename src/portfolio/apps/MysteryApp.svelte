<script lang="ts">
  import { PORTFOLIO } from "../data";
  import Sidebar from "./Sidebar.svelte";
  import Toolbar from "./Toolbar.svelte";

  const items = PORTFOLIO.mystery;
</script>

<div class="dol mystery">
  <Toolbar path="/home/taggart/Mystery" />
  <div class="dol-body">
    <Sidebar active="mystery" />
    <div class="doc-pad">
      <div class="cls-banner mono">⚠ CLASSIFIED — IN DEVELOPMENT</div>
      <h1 class="serif">Mystery</h1>
      <p class="lede">Upcoming projects that aren't articulable yet.</p>
      <div class="mys-grid">
        {#each items as item (item.id)}
          <div class="mys-card">
            <div class="mys-hdr">
              <div class="mys-codename mono">{item.codename}</div>
              <div class="mys-eta mono">ETA {item.eta}</div>
            </div>
            <div class="mys-expansion mono">{item.expansion}</div>
            <p class="mys-hint">{item.hint}</p>
            <div class="mys-redacted">
              <div class="redact-line"></div>
              <div class="redact-line short"></div>
              <div class="redact-line"></div>
              <div class="redact-line med"></div>
            </div>
            <div class="mys-foot mono">{item.classified}</div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
