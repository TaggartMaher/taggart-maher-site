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
export const steamAtlasPath = "/composite/steam_atlas.exr";
export const steamCellsManifestPath = "/composite/steam_cells_manifest.json";

// Number of pre-baked steam frames in the atlas. Matches the FRAME_END
// in blender/render_steam.sh (96 frames at 24 fps = 4 s loop).
export const steamFrameCount = 96;
// Atlas layout: frames packed row-major into a (cols × rows) grid.
// 16 × 6 = 96; chosen so neither axis runs into single-shot upload
// limits on low-end GPUs (8192 max texture dim is the typical floor).
export const steamAtlasColumns = 16;
export const steamAtlasRows = 6;
export const steamFps = 24;

// Steam strip's normalized rectangle in full-frame coords, sourced from
// .env. Read by render_steam.sh, the Rust bake binary, and the runtime
// shader so all three agree on where the strip lives in the frame.
// Exported for the env-var read path test in config.test.ts; the
// `unknown` input matches what `import.meta.env[name]` returns when a
// var is missing or non-string.
export function parseEnvFloat(rawValue: unknown, fallback: number): number {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const steamCrop = {
  minX: parseEnvFloat(import.meta.env.STEAM_CROP_MIN_X, 0.375),
  maxX: parseEnvFloat(import.meta.env.STEAM_CROP_MAX_X, 0.625),
  minY: parseEnvFloat(import.meta.env.STEAM_CROP_MIN_Y, 0.0),
  maxY: parseEnvFloat(import.meta.env.STEAM_CROP_MAX_Y, 1.0),
};
