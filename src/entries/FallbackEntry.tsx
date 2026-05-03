import { LiteInterface } from "../lite/LiteInterface";
import { ModeProvider } from "../mode/ModeContext";
import { Router } from "../router/Router";
import type { ModeReason } from "../mode/chooseMode";

interface FallbackEntryProps {
  modeReason: ModeReason;
}

// FALLBACK_MODE: no compositor, no Portfolio, no snapdom, no
// EXR decoding, no composite-test-images. Just the lite reading
// interface. Crucially, this file imports nothing from
// `src/composite/`, `src/portfolio/Portfolio`, `src/portfolio/PWindow`,
// or `@zumer/snapdom`, so the Vite chunk for this entry stays small
// and the corresponding network requests never fire.
export function FallbackEntry({ modeReason }: FallbackEntryProps) {
  return (
    <ModeProvider modeReason={modeReason}>
      <Router>
        <LiteInterface />
      </Router>
    </ModeProvider>
  );
}
