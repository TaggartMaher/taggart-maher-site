import "./composite/compositor.css";
import { Compositor } from "./composite/Compositor";

export function App() {
  // Phase B+C: the full-viewport compositor with placeholder screen content.
  // Portfolio integration into the screen rect lands with Phase D
  // (DOM-to-texture) and the responsive fallback path lands with Phase E.
  return <Compositor />;
}
