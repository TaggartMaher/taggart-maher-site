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
  // Coffee-steam image-sequence overlay knobs. The overlay is mounted
  // unconditionally; `coffeeSteamEnabled` only gates the contribution.
  coffeeSteamEnabled: boolean;
  // Multiplies steam bounce contribution before the soft clamp.
  coffeeSteamIntensity: number;
  // Soft ceiling for the steam contribution (per channel, in linear
  // light). Generalized Reinhard `x / (1 + x/W)`: values well below W
  // pass through near-linearly; values approaching or exceeding W
  // asymptote to W. Lower values clamp brighter peaks without
  // dimming small details.
  coffeeSteamMaxIntensity: number;
  // Output alpha on the steam canvas. Under mix-blend-mode:
  // plus-lighter the source contributes `alpha × source` to the
  // backdrop, so this is effectively an opacity multiplier — lower
  // values let more of the underlying scene through.
  coffeeSteamOpacity: number;
  // Blur radius (in screen-texture pixels) applied to the screen
  // content before it feeds the steam composite. Independent of the
  // static compositor's screenBlurRadiusPx so the steam can run a
  // softer / sharper reflection than the scene bounce.
  coffeeSteamScreenBlurRadiusPx: number;
  // Freeze playback at the last advanced frame index.
  coffeeSteamFramePaused: boolean;
  // Pin to a specific frame (overrides paused state). null = follow time.
  coffeeSteamFrameOverride: number | null;
  // Render the raw atlas into a corner overlay for debugging atlas
  // decode / packing.
  coffeeSteamShowAtlas: boolean;
  // User-controlled performance toggle. When on:
  //   - the screen-content rasterizer drops to `rasterizerFpsEcoMode`
  //     and the texture canvas is allocated at half size
  //   - the static compositor caps DPR at `compositorEcoModeMaxDpr`
  //     and FPS at `compositorFpsEcoMode`
  //   - the SteamCompositor unmounts entirely (no atlas, no GPU state)
  // On by default — the site needs to feel snappy on first-run iGPUs
  // and only the curious turn it off.
  ecoMode: boolean;
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
  coffeeSteamEnabled: true,
  coffeeSteamIntensity: 1,
  coffeeSteamMaxIntensity: 1,
  coffeeSteamOpacity: 1,
  coffeeSteamScreenBlurRadiusPx: 0,
  coffeeSteamFramePaused: false,
  coffeeSteamFrameOverride: null,
  coffeeSteamShowAtlas: false,
  ecoMode: true,
};
