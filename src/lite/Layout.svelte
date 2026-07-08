<script lang="ts">
  import type { Snippet } from "svelte";
  import Link from "../router/Link.svelte";
  import { getRouter } from "../router/routerContext";
  import { setInternalLinkHandler } from "../portfolio/content/internalLink";

  interface NavEntry {
    to: string;
    label: string;
  }

  const NAV_ENTRIES: NavEntry[] = [
    { to: "/", label: "Home" },
    { to: "/about", label: "About" },
    { to: "/experience", label: "Experience" },
    { to: "/projects", label: "Projects" },
    { to: "/blog", label: "Blog" },
    { to: "/mystery", label: "Mystery" },
    { to: "/contact", label: "Contact" },
    { to: "/settings", label: "Settings" },
  ];

  function isActivePath(currentPath: string, navEntryPath: string): boolean {
    if (navEntryPath === "/") return currentPath === "/";
    return currentPath === navEntryPath || currentPath.startsWith(navEntryPath + "/");
  }

  let { children }: { children: Snippet } = $props();

  const router = getRouter();

  setInternalLinkHandler((href) => {
    router.navigate(href);
  });

  // Reset scroll on path change. Without this, navigating from deep in
  // a long page (e.g. far down /blog/foo) lands in the new page already
  // scrolled past its top.
  $effect(() => {
    void router.path;
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
  });
</script>

<div class="lite-shell">
  <nav class="lite-nav">
    <div class="lite-nav-inner">
      <Link to="/" class="lite-nav-brand" aria-label="Home — Taggart Maher">
        Tag M.
        <svg
          class="lite-nav-home-icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      </Link>
      <div class="lite-nav-links">
        {#each NAV_ENTRIES.filter((entry) => entry.to !== "/") as entry (entry.to)}
          {@const isSettings = entry.to === "/settings"}
          <Link
            to={entry.to}
            class={"lite-nav-link" +
              (isActivePath(router.path, entry.to) ? " active" : "") +
              (isSettings ? " lite-nav-settings" : "")}
          >
            {#if isSettings}
              <svg
                class="lite-nav-settings-icon"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path
                  d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
                />
              </svg>
            {/if}
            {entry.label}
          </Link>
        {/each}
      </div>
    </div>
  </nav>
  <main class="lite-main">{@render children()}</main>
  <footer class="lite-footer">
    <div class="lite-footer-inner">
      <a href="mailto:taggart.talk@gmail.com">taggart.talk@gmail.com</a>
      <Link to="/settings">Site Settings</Link>
    </div>
  </footer>
</div>
