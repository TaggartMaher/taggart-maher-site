<script lang="ts">
  interface CopyLinkButtonProps {
    // Override the visible idle/copied label. Defaults are "Copy link" /
    // "Copied".
    label?: string;
    copiedLabel?: string;
    className?: string;
  }

  const COPY_FEEDBACK_DURATION_MS = 2000;

  let { label = "Copy link", copiedLabel = "Copied", className }: CopyLinkButtonProps = $props();

  let showCopiedFeedback = $state(false);
  let revertTimeoutHandle: number | null = null;

  $effect(() => {
    return () => {
      if (revertTimeoutHandle !== null) {
        window.clearTimeout(revertTimeoutHandle);
      }
    };
  });

  async function handleClick(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      console.warn("[copy-link] clipboard API unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      showCopiedFeedback = true;
      if (revertTimeoutHandle !== null) {
        window.clearTimeout(revertTimeoutHandle);
      }
      revertTimeoutHandle = window.setTimeout(() => {
        showCopiedFeedback = false;
        revertTimeoutHandle = null;
      }, COPY_FEEDBACK_DURATION_MS);
    } catch (error) {
      console.warn("[copy-link] clipboard write failed:", error);
    }
  }
</script>

<button
  type="button"
  class={"copy-link-button" + (className ? " " + className : "")}
  onclick={handleClick}
>
  <span aria-live="polite">{showCopiedFeedback ? copiedLabel : label}</span>
</button>
