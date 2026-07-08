import { getContext, setContext } from "svelte";

// Hook for the surrounding shell to intercept internal links (paths
// that start with "/"). When set, internal-link clicks inside rendered
// markdown call the callback instead of triggering a full page
// navigation. External links (http(s)://, mailto:, tel:, schemes) are
// unaffected and open in a new tab where appropriate.
export type InternalLinkHandler = (href: string) => void;

const INTERNAL_LINK_CONTEXT_KEY = Symbol("internal-link-handler");

// Must be called during component initialization (Svelte context rule).
export function setInternalLinkHandler(onNavigate: InternalLinkHandler): void {
  setContext(INTERNAL_LINK_CONTEXT_KEY, onNavigate);
}

export function getInternalLinkHandler(): InternalLinkHandler | null {
  return getContext<InternalLinkHandler | undefined>(INTERNAL_LINK_CONTEXT_KEY) ?? null;
}
