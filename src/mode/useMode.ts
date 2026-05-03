import { useContext } from "react";
import { ModeReasonContext } from "./modeContextValue";
import type { Mode, ModeReason } from "./chooseMode";

export function useModeReason(): ModeReason {
  const value = useContext(ModeReasonContext);
  if (!value) {
    return { mode: "FULL_MODE", source: "auto", detail: "no provider — defaulting" };
  }
  return value;
}

export function useMode(): Mode {
  return useModeReason().mode;
}
