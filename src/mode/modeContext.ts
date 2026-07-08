import { getContext } from "svelte";
import type { Mode, ModeReason } from "./chooseMode";

export const MODE_REASON_CONTEXT_KEY = Symbol("mode-reason");

// Must be called during component initialization (Svelte context rule).
export function getModeReason(): ModeReason {
  const value = getContext<ModeReason | undefined>(MODE_REASON_CONTEXT_KEY);
  if (!value) {
    return { mode: "FULL_MODE", source: "auto", detail: "no provider — defaulting" };
  }
  return value;
}

export function getMode(): Mode {
  return getModeReason().mode;
}
