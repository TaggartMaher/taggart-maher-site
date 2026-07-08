<script lang="ts">
  import { setContext, type Snippet } from "svelte";
  import { MODE_REASON_CONTEXT_KEY } from "./modeContext";
  import type { ModeReason } from "./chooseMode";

  let { modeReason, children }: { modeReason: ModeReason; children: Snippet } = $props();

  // The mode is decided once at boot and never changes for the life of
  // the page, so capturing the initial prop value is intentional.
  // svelte-ignore state_referenced_locally
  setContext<ModeReason>(MODE_REASON_CONTEXT_KEY, modeReason);
</script>

{@render children()}
