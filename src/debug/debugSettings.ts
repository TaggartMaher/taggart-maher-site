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
  imageBackgroundEnabled: boolean;
  imageBackgroundUrl: string;
  // When true, the image background still feeds the screen-content
  // canvas (so the bounce light reflects it) but the DOM <img> overlay
  // is not rendered, so the user can see the rendered scene through
  // the screen-rect area.
  hideImageOverlay: boolean;
  colorBackgroundEnabled: boolean;
  colorBackgroundColor: string;
  squareEnabled: boolean;
  squareColor: string;
  // Same idea as hideImageOverlay, for the draggable square.
  hideSquareOverlay: boolean;
  // Square position as normalized coords of the square's top-left in
  // [0, 1] of the screen plane's UV space. Persists across re-renders so
  // the square stays put while the user toggles other options.
  squareNormalizedX: number;
  squareNormalizedY: number;
  // Effective blur radius applied to the screen-content image before it
  // feeds the composite, in screen-texture pixels, via a dual-Kawase
  // downsample/upsample chain. 0 disables the blur.
  screenBlurRadiusPx: number;
  // Box-average radius (in atlas texels) applied to the per-cell
  // brightness reduction before argmax in the cellular-image shader.
  // Smooths cell-boundary flicker where two cells are nearly equally
  // bright at a pixel. Integer; clamped to [0, 5] in the shader.
  lookupBlurRadius: number;
  // Linear stretch applied to emitterUv around (0.5, 0.5) before sampling
  // the screen content, per axis:
  //   u_out = (u - 0.5) * uStretch + 0.5
  //   v_out = (v - 0.5) * vStretch + 0.5
  // 1.0 is the physically-derived UV; > 1 pushes the edges of that axis
  // outward, < 1 pulls them in. Compensates for residual nonlinearity in
  // the position pass at the edges of the screen.
  uStretch: number;
  vStretch: number;
  // Per-axis translation added to the emitterUv after the stretch:
  //   u_out = (u - 0.5) * uStretch + 0.5 + uOffset
  //   v_out = (v - 0.5) * vStretch + 0.5 + vOffset
  // Lets the screen content slide across the lit area to compensate for
  // residual mis-registration after the stretch is dialed in.
  uOffset: number;
  vOffset: number;
  // Symmetric inset (in canvas-UV units) defining the valid screen-content
  // sampling window: [margin, 1 - margin] on both axes. Where the
  // (stretched + offset) emitterUv falls outside this window, the screen
  // contribution is zeroed instead of clamping to the texture edge — kills
  // the edge-pixel fill where the position pass overshoots the screen.
  edgeCutoff: number;
  // Color adjustments applied to the screen-content sample (in linear
  // light) before it multiplies into the bounce. 1.0 is a no-op for all
  // three. Saturation lerps around Rec.709 luma; contrast scales around
  // 0.5; brightness is a flat multiplier.
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
  lookupBlurRadius: 1,
  uStretch: 1,
  vStretch: 1,
  uOffset: 0,
  vOffset: 0,
  edgeCutoff: 0,
  screenSaturation: 1,
  screenContrast: 1,
  screenBrightness: 1,
};
