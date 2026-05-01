// Single source of truth shared between the Blender side and the web
// side. See COMPOSITE_THEORY.md for the math these constants drive.

import { computeScreenRect, type CameraPose, type ScreenPlane } from "./screenRect";

// Side length of the N×N screen-cell grid. Sourced from .env
// (CELLS_PER_SIDE), exposed to the client by Vite's envPrefix. Must
// match the value the Rust bake binary and Blender script read from
// the same .env.
const cellsPerSideRaw = Number(import.meta.env.CELLS_PER_SIDE);
export const cellsPerSide =
  Number.isFinite(cellsPerSideRaw) && cellsPerSideRaw > 0 ? cellsPerSideRaw : 9;

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

// Built by the Rust bake binary (scripts/bake-textures/) and served
// from public/composite/.
export const beautyImagePath = "/composite/beauty.png";
export const positionImagePath = "/composite/position.exr";
