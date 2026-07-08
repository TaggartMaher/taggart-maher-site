<script lang="ts">
  import { getInternalLinkHandler } from "./internalLink";
  import { isInternalHref, renderMarkdownToHtml } from "./renderMarkdown";

  interface MarkdownProps {
    source: string;
    className?: string;
  }

  let { source, className }: MarkdownProps = $props();

  const internalLinkHandler = getInternalLinkHandler();

  // $derived caches the rendered HTML until `source` changes, so
  // surrounding re-renders don't rebuild the markdown AST.
  const renderedHtml = $derived(renderMarkdownToHtml(source));

  // Delegated click handler standing in for the per-anchor onClick the
  // react-markdown component map used to inject.
  function handleClick(event: MouseEvent): void {
    // Modifier keys and non-primary buttons fall through to the
    // browser so middle-click / cmd-click open in a new tab.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!isInternalHref(href)) return;
    if (!internalLinkHandler) return;
    event.preventDefault();
    internalLinkHandler(href);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class={"md" + (className ? " " + className : "")} onclick={handleClick}>
  <!-- The HTML comes from this repo's own markdown through the unified
       pipeline (raw HTML in the source is dropped), so it is trusted. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html renderedHtml}
</div>
