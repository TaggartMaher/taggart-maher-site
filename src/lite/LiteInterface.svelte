<script lang="ts">
  import "./theme.css";
  import "./lite.css";
  import Layout from "./Layout.svelte";
  import Routes from "./Routes.svelte";

  // Single-column reading interface used by both LIGHTWEIGHT_MODE
  // (mounted inside the compositor's screen) and FALLBACK_MODE (mounted
  // alone, no compositor). The Routes component reads the path from the
  // surrounding <Router> and renders the right page.
</script>

<Layout>
  <Routes />
</Layout>
