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
  // Effective blur radius applied to the screen-content image before it
  // feeds the composite, in screen-texture pixels, via a dual-Kawase
  // downsample/upsample chain. 0 disables the blur.
  screenBlurRadiusPx: number;
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
  screenBlurRadiusPx: 0,
  uStretch: 1,
  vStretch: 1,
  uOffset: 0,
  vOffset: 0,
  edgeCutoff: 0,
};
