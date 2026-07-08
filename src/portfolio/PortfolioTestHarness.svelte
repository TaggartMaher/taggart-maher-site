<script lang="ts">
  // Test-only harness for Portfolio.test.ts: provides the router
  // context the shell requires.
  import Router from "../router/Router.svelte";
  import Portfolio from "./Portfolio.svelte";
</script>

<Router>
  <Portfolio ecoMode={false} onToggleEcoMode={() => {}} />
</Router>
