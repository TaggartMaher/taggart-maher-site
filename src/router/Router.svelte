<script lang="ts">
  import { setContext, type Snippet } from "svelte";
  import { ROUTER_CONTEXT_KEY, type RouterContextValue } from "./routerContext";

  let { children }: { children: Snippet } = $props();

  function readCurrentPath(): string {
    if (typeof window === "undefined") return "/";
    const pathname = window.location.pathname || "/";
    return pathname === "" ? "/" : pathname;
  }

  let path = $state(readCurrentPath());

  function navigate(nextPath: string): void {
    if (typeof window === "undefined") return;
    if (window.location.pathname === nextPath) return;
    window.history.pushState({}, "", nextPath);
    path = readCurrentPath();
  }

  function replace(nextPath: string): void {
    if (typeof window === "undefined") return;
    if (window.location.pathname === nextPath) {
      // Even if the path matches, sync local state in case caller is
      // reconciling after an out-of-band history change.
      path = readCurrentPath();
      return;
    }
    window.history.replaceState({}, "", nextPath);
    path = readCurrentPath();
  }

  setContext<RouterContextValue>(ROUTER_CONTEXT_KEY, {
    get path() {
      return path;
    },
    navigate,
    replace,
  });

  $effect(() => {
    function handlePopState(): void {
      path = readCurrentPath();
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  });
</script>

{@render children()}
