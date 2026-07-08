<script lang="ts">
  interface FocusBarProps {
    focusMode: boolean;
    onChange: (focusMode: boolean) => void;
    readLabel: string;
    backLabel: string;
  }

  // Sticky bar that pins to the top of the scrolling content panel.
  // Shows the read-label button when expanded; clicking collapses the
  // list/sidebar so only the article is visible. In focus mode the bar
  // fills full-width as a grey back affordance to exit focus.
  let { focusMode, onChange, readLabel, backLabel }: FocusBarProps = $props();
</script>

{#if focusMode}
  <button type="button" class="focus-bar back mono" onclick={() => onChange(false)}>
    ‹ {backLabel}
  </button>
{:else}
  <div class="focus-bar">
    <button type="button" class="focus-read mono" onclick={() => onChange(true)}>
      {readLabel}
    </button>
  </div>
{/if}
