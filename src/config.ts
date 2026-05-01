// Single source of truth shared between the Blender side and the web
// side. See COMPOSITE_THEORY.md for the math these constants drive.

import { computeScreenRect, type CameraPose, type ScreenPlane } from "./screenRect";

// Side length of the N×N screen-cell grid. Must match
// blender/generate_screen_cells.py's `CELLS_PER_SIDE`.
export const cellsPerSide = 9;

// Atlas packs (1 + cellsPerSide²) tiles — beauty plus one per cell —
// into a row-major grid. Build script and shader both derive their
// layout from these.
export const tileCount = 1 + cellsPerSide * cellsPerSide;
export const tileCols = Math.ceil(Math.sqrt(tileCount));
export const tileRows = Math.ceil(tileCount / tileCols);

// Render output aspect (width / height).
export const renderAspect = 16 / 9;

// Camera and screen-plane values baked from the .blend. Units are
// meters and XYZ-Euler degrees (Blender defaults). The screen plane
// lies in its local XY plane with `widthMeters` along local X and
// `heightMeters` along local Y, centered at its position.
export const cameraPose: CameraPose = {
  positionMeters: [0.459539, 0.036977, 0.48932],
  rotationEulerDegXYZ: [76.7184, 1.23951, -267.355],
  horizontalFovDeg: 80.8044,
};

export const screenPlane: ScreenPlane = {
  positionMeters: [-0.16833, 0.04207, 0.36069],
  // Plane stands vertical with its normal pointing world +X. With
  // Blender's XYZ-Euler (Rz · Ry · Rx) this is [90, 0, 90]: local +Z
  // → world +X, local +X → world +Y (width), local +Y → world +Z
  // (height).
  rotationEulerDegXYZ: [90, 0, 90],
  widthMeters: 0.569,
  heightMeters: 0.35,
};

export const screenRect = computeScreenRect(cameraPose, screenPlane, renderAspect);

// Atlas built by scripts/buildAssets.ts and served from public/composite/.
export const atlasImagePath = "/composite/atlas.png";
