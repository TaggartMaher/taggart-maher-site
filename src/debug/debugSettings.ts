// Shared debug-menu state. The menu mutates this; the screen overlay
// reads it to decide what to paint to the DOM and the screen-content
// texture.

import { testImages } from "../composite/testImages";

export interface DebugSettings {
  // Hide the Portfolio DOM overlay so the composited scene shows
  // through. Image / color backgrounds and the draggable square still
  // render if enabled.
  hidePageOverlay: boolean;
  imageBackgroundEnabled: boolean;
  imageBackgroundUrl: string;
  // Image background still feeds the screen-content canvas, but the
  // DOM <img> overlay is hidden.
  hideImageOverlay: boolean;
  colorBackgroundEnabled: boolean;
  colorBackgroundColor: string;
  squareEnabled: boolean;
  squareColor: string;
  hideSquareOverlay: boolean;
  // Square's top-left in [0,1] screen-plane UV space.
  squareNormalizedX: number;
  squareNormalizedY: number;
  // Blur radius (in screen-texture pixels) applied to the screen
  // content before it feeds the composite. 0 disables.
  screenBlurRadiusPx: number;
  // Per-axis linear stretch applied to emitterUv around (0.5, 0.5):
  //   u_out = (u - 0.5) * uStretch + 0.5
  //   v_out = (v - 0.5) * vStretch + 0.5
  // 1.0 is the physically-derived UV.
  uStretch: number;
  vStretch: number;
  // Per-axis translation added to emitterUv after the stretch.
  uOffset: number;
  vOffset: number;
  // Symmetric inset defining the valid screen-content sampling window
  // [margin, 1 - margin] on each axis. Outside the window, the screen
  // contribution is zeroed.
  edgeCutoff: number;
  // Linear-light adjustments applied to the screen-content sample
  // before it multiplies into the bounce. 1.0 is the identity.
  // Saturation lerps around Rec.709 luma; contrast scales around 0.5;
  // brightness is a flat multiplier.
  screenSaturation: number;
  screenContrast: number;
  screenBrightness: number;
}

export const defaultDebugSettings: DebugSettings = {
  hidePageOverlay: false,
  imageBackgroundEnabled: false,
  imageBackgroundUrl: testImages[0].url,
  hideImageOverlay: false,
  colorBackgroundEnabled: false,
  colorBackgroundColor: "#1e90ff",
  squareEnabled: false,
  squareColor: "#ff5500",
  hideSquareOverlay: false,
  squareNormalizedX: 0.4,
  squareNormalizedY: 0.4,
  screenBlurRadiusPx: 0,
  uStretch: 1,
  vStretch: 1,
  uOffset: 0,
  vOffset: 0,
  edgeCutoff: 0,
  screenSaturation: 1,
  screenContrast: 1,
  screenBrightness: 1,
};
