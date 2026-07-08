<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { getRouter } from "./routerContext";

  interface LinkProps extends Omit<HTMLAnchorAttributes, "href" | "onclick"> {
    to: string;
    children: Snippet;
    // Use replaceState instead of pushState. Default false.
    replace?: boolean;
    onclick?: (event: MouseEvent) => void;
  }

  let { to, children, replace = false, onclick, ...rest }: LinkProps = $props();

  const router = getRouter();

  function isExternalHref(href: string): boolean {
    // Protocol-relative "//host" URLs point at another origin —
    // pushState would throw on them, so let the browser handle them.
    if (href.startsWith("//")) return true;
    return /^[a-z][a-z0-9+.-]*:/i.test(href);
  }

  function handleClick(event: MouseEvent): void {
    if (onclick) {
      onclick(event);
      if (event.defaultPrevented) return;
    }
    // Modifier keys / non-primary buttons fall through to the browser
    // so "open in new tab", "open in new window", and middle-click
    // still work as expected.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    if (isExternalHref(to)) return;
    event.preventDefault();
    if (replace) {
      router.replace(to);
    } else {
      router.navigate(to);
    }
  }
</script>

<a href={to} onclick={handleClick} {...rest}>{@render children()}</a>
