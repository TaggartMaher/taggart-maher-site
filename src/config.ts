// Single source of truth shared between the human-owned Blender side and the
// agent-owned web side. When the Blender scene changes (frame count, fps,
// camera, screen plane), update the values here and the runtime adapts.

import { computeScreenRect, type CameraPose, type ScreenPlane } from "./screenRect";

export const frameCount = 96;
export const fps = 24;

// Render output aspect (width / height). Update if the Blender output
// resolution changes.
export const renderAspect = 16 / 9;

// TODO: replace placeholders with the actual Blender camera and screen plane
// values. The Blender scene's units must be meters and degrees (Blender
// defaults). The screen plane lies in its local XY plane with `widthMeters`
// along local X and `heightMeters` along local Y, centered at its position.
export const cameraPose: CameraPose = {
  positionMeters: [0, 0, 0],
  rotationEulerDegXYZ: [0, 0, 0],
  horizontalFovDeg: 60,
};

export const screenPlane: ScreenPlane = {
  positionMeters: [0, 0, -2],
  rotationEulerDegXYZ: [0, 0, 0],
  widthMeters: 0.6,
  heightMeters: 0.34,
};

export const screenRect = computeScreenRect(cameraPose, screenPlane, renderAspect);

// Per-pass asset paths. Vite serves these from the project's `public/`
// directory; the asset wiring step (milestone 3) symlinks the per-pass
// subdirectories of $BLENDER_RENDERS_DIR into `public/composite/` at script
// start.
export const passPaths = {
  beauty: "/composite/beauty/",
  whitelight: "/composite/whitelight/",
  position: "/composite/position/",
} as const;
