import { mount, type Component } from "svelte";
import { chooseMode, type ModeReason } from "./mode/chooseMode";

// Three-branch dynamic-import gate. Each entry file imports a disjoint
// set of dependencies (see src/entries/*.svelte); Vite produces separate
// chunks for each branch so FALLBACK_MODE never downloads compositor
// or Portfolio code. See LITE_INTERFACE_PLAN.md §4 for the no-bytes
// guarantee.
async function bootstrap(): Promise<void> {
  const modeReason = chooseMode();
  document.documentElement.dataset.mode = modeReason.mode;

  let EntryComponent: Component<{ modeReason: ModeReason }>;
  if (modeReason.mode === "FALLBACK_MODE") {
    EntryComponent = (await import("./entries/FallbackEntry.svelte")).default;
  } else if (modeReason.mode === "LIGHTWEIGHT_MODE") {
    EntryComponent = (await import("./entries/LightweightEntry.svelte")).default;
  } else {
    EntryComponent = (await import("./entries/FullEntry.svelte")).default;
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("[main] #root element missing from index.html");
  }
  mount(EntryComponent, { target: rootElement, props: { modeReason } });
}

void bootstrap();
