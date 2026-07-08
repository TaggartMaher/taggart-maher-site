<script lang="ts">
  // Test-only helper: renders the live router path so Router.test.ts
  // can assert on it. Must be a child component because getRouter reads
  // the context that <Router> provides.
  import { getRouter } from "./routerContext";

  const router = getRouter();
</script>

<span data-testid="path">{router.path}</span>
