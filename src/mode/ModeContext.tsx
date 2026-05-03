import { type ReactNode } from "react";
import { ModeReasonContext } from "./modeContextValue";
import type { ModeReason } from "./chooseMode";

export function ModeProvider({
  modeReason,
  children,
}: {
  modeReason: ModeReason;
  children: ReactNode;
}) {
  return <ModeReasonContext.Provider value={modeReason}>{children}</ModeReasonContext.Provider>;
}
