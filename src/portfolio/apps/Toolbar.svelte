<script lang="ts">
  import type { Snippet } from "svelte";

  interface ToolbarProps {
    path: string;
    right?: Snippet;
  }

  let { path, right }: ToolbarProps = $props();
</script>

<div class="toolbar">
  <div class="tb-nav">
    <button class="nav-btn" disabled>‹</button>
    <button class="nav-btn" disabled>›</button>
    <button class="nav-btn" disabled>↑</button>
  </div>
  <div class="tb-path mono">{path}</div>
  {#if right}
    <div class="tb-right">{@render right()}</div>
  {/if}
</div>
