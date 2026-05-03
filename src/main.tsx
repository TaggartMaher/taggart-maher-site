import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { chooseMode } from "./mode/chooseMode";

// Three-branch dynamic-import gate. Each entry file imports a disjoint
// set of dependencies (see src/entries/*.tsx); Vite produces separate
// chunks for each branch so FALLBACK_MODE never downloads compositor
// or Portfolio code. See LITE_INTERFACE_PLAN.md §4 for the no-bytes
// guarantee.
async function bootstrap(): Promise<void> {
  const modeReason = chooseMode();
  document.documentElement.dataset.mode = modeReason.mode;

  let element;
  if (modeReason.mode === "FALLBACK_MODE") {
    const { FallbackEntry } = await import("./entries/FallbackEntry");
    element = <FallbackEntry modeReason={modeReason} />;
  } else if (modeReason.mode === "LIGHTWEIGHT_MODE") {
    const { LightweightEntry } = await import("./entries/LightweightEntry");
    element = <LightweightEntry modeReason={modeReason} />;
  } else {
    const { FullEntry } = await import("./entries/FullEntry");
    element = <FullEntry modeReason={modeReason} />;
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("[main] #root element missing from index.html");
  }
  createRoot(rootElement).render(<StrictMode>{element}</StrictMode>);
}

void bootstrap();
