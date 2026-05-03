import { createContext } from "react";
import type { ModeReason } from "./chooseMode";

export const ModeReasonContext = createContext<ModeReason | null>(null);
