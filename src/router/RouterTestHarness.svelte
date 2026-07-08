<script lang="ts">
  // Test-only harness for Router.test.ts: a Router wrapping the current
  // path readout and a Link, mirroring the tree the tests exercise.
  import CurrentPathTestHelper from "./CurrentPathTestHelper.svelte";
  import Link from "./Link.svelte";
  import Router from "./Router.svelte";
</script>

<Router>
  <CurrentPathTestHelper />
  <Link to="/blog">Blog</Link>
</Router>
