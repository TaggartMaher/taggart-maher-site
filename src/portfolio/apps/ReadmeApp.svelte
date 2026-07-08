<script lang="ts">
  import Markdown from "../content/Markdown.svelte";
  import { README_HTML } from "../content/readme";
  import Toolbar from "./Toolbar.svelte";
</script>

<div class="page-pad">
  <Toolbar path="/home/taggart/README.md" />
  <div class="doc-pad readme">
    <div class="readme-meta mono">README.md · plain text</div>
    <Markdown html={README_HTML} />
  </div>
</div>
