<script lang="ts">
  import { getInternalLinkHandler } from "./internalLink";

  interface MarkdownProps {
    // Pre-rendered HTML, compiled from markdown at build time by the
    // markdown-to-html plugin in vite.config.ts (`?html` imports). No
    // markdown is parsed in the browser.
    html: string;
    className?: string;
  }

  let { html, className }: MarkdownProps = $props();

  const internalLinkHandler = getInternalLinkHandler();

  function isInternalHref(href: string | null): href is string {
    return typeof href === "string" && href.startsWith("/");
  }

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
  <!-- The HTML is compiled at build time from this repo's own markdown
       (raw HTML in the source is dropped), so it is trusted. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>
