<script lang="ts">
  // Test-only harness for CompositorBoot.test.ts: provides the children
  // snippet the tests probe for.
  import type { ModeReason } from "../mode/chooseMode";
  import CompositorBoot from "./CompositorBoot.svelte";

  let { modeReason }: { modeReason: ModeReason } = $props();
</script>

<CompositorBoot {modeReason}>
  <div data-testid="children">child-content</div>
</CompositorBoot>
