// Single source of truth shared between the human-owned Blender side and the
// agent-owned web side. When the Blender scene changes (frame count, fps,
// camera, screen plane), update the values here and the runtime adapts.

import { computeScreenRect, type CameraPose, type ScreenPlane } from "./screenRect";

export const frameCount = 96;
export const fps = 24;

// Render output aspect (width / height). Update if the Blender output
// resolution changes.
export const renderAspect = 16 / 9;

// Camera and screen-plane values baked from the .blend. Units are meters and
// XYZ-Euler degrees (Blender defaults). The screen plane lies in its local XY
// plane with `widthMeters` along local X and `heightMeters` along local Y,
// centered at its position.
export const cameraPose: CameraPose = {
  positionMeters: [0.459539, 0.036977, 0.48932],
  rotationEulerDegXYZ: [76.7184, 1.23951, -267.355],
  horizontalFovDeg: 80.8044,
};

export const screenPlane: ScreenPlane = {
  positionMeters: [-0.177359, 0.041848, 0.360192],
  rotationEulerDegXYZ: [-1.20527, -3.16211, 1.46014],
  widthMeters: 0.569,
  heightMeters: 0.35,
};

export const screenRect = computeScreenRect(cameraPose, screenPlane, renderAspect);

// Composite atlas video — a single 3x-wide H.264 file containing all three
// passes side-by-side (beauty | whitelight | position) at `renderAspect` per
// pass. Built by scripts/buildAssets.ts and served from public/composite/ by
// Vite. The shader samples each third of the frame as its own pass, so frame
// lock between passes is automatic.
export const atlasPath = "/composite/atlas.mp4";
