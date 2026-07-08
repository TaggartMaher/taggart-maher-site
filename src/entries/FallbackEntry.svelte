<script lang="ts">
  import LiteInterface from "../lite/LiteInterface.svelte";
  import ModeProvider from "../mode/ModeProvider.svelte";
  import Router from "../router/Router.svelte";
  import type { ModeReason } from "../mode/chooseMode";

  interface FallbackEntryProps {
    modeReason: ModeReason;
  }

  // FALLBACK_MODE: no compositor, no Portfolio, no EXR decoding, no
  // composite-test-images. Just the lite reading interface. Crucially,
  // this file imports nothing from `src/composite/`,
  // `src/portfolio/Portfolio.svelte`, or `src/portfolio/PWindow.svelte`,
  // so the Vite chunk for this entry stays small and the corresponding
  // network requests never fire.
  let { modeReason }: FallbackEntryProps = $props();
</script>

<ModeProvider {modeReason}>
  <Router>
    <LiteInterface />
  </Router>
</ModeProvider>
