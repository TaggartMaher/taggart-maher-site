// Shared debug-menu state. The menu mutates this; the screen overlay reads
// it to decide what to paint to the screen DOM and the screen-content
// texture.

import { testImages } from "../composite/testImages";

export interface DebugSettings {
  // When true, the Portfolio DOM overlay (and the overlay div's own
  // background fill) are not rendered, so the composited scene behind
  // the overlay is visible through the screen-rect area. Image / color
  // backgrounds and the draggable square still render if their own
  // checkboxes are enabled.
  hidePageOverlay: boolean;
  // When true, pause the atlas video on its first frame so iteration
  // doesn't have to wait through the loop. Bounce light + the
  // draggable square / image background still update live; only the
  // beauty/whitelight/position passes freeze.
  freezeFirstFrame: boolean;
  imageBackgroundEnabled: boolean;
  imageBackgroundUrl: string;
  colorBackgroundEnabled: boolean;
  colorBackgroundColor: string;
  squareEnabled: boolean;
  squareColor: string;
  // Square position as normalized coords of the square's top-left in
  // [0, 1] of the screen plane's UV space. Persists across re-renders so
  // the square stays put while the user toggles other options.
  squareNormalizedX: number;
  squareNormalizedY: number;
}

export const defaultDebugSettings: DebugSettings = {
  hidePageOverlay: false,
  freezeFirstFrame: false,
  imageBackgroundEnabled: false,
  imageBackgroundUrl: testImages[0].url,
  colorBackgroundEnabled: false,
  colorBackgroundColor: "#1e90ff",
  squareEnabled: false,
  squareColor: "#ff5500",
  squareNormalizedX: 0.4,
  squareNormalizedY: 0.4,
};
