import { getContext } from "svelte";

export interface RouterContextValue {
  // Path portion of the URL (no query string, no hash). Always starts
  // with "/". Reactive: backed by Svelte state inside <Router>, so
  // reading it from a component's markup or $derived tracks updates.
  readonly path: string;
  // Push a new entry onto the history stack.
  navigate: (nextPath: string) => void;
  // Replace the current entry in the history stack.
  replace: (nextPath: string) => void;
}

export const ROUTER_CONTEXT_KEY = Symbol("router");

// Must be called during component initialization (Svelte context rule).
export function getRouter(): RouterContextValue {
  const value = getContext<RouterContextValue | undefined>(ROUTER_CONTEXT_KEY);
  if (!value) {
    throw new Error("[router] getRouter must be used inside <Router>");
  }
  return value;
}
