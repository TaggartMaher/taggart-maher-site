<script lang="ts">
  // Test-only harness for SettingsView.test.ts: provides the mode
  // context the view reads.
  import type { ModeReason } from "../mode/chooseMode";
  import ModeProvider from "../mode/ModeProvider.svelte";
  import SettingsView from "./SettingsView.svelte";

  let { modeReason }: { modeReason: ModeReason } = $props();
</script>

<ModeProvider {modeReason}>
  <SettingsView />
</ModeProvider>
