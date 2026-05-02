// Single source of truth shared between the Blender side and the web
// side. See COMPOSITE_THEORY.md for the math these constants drive.

import {
  computeProjectedCorners,
  computeScreenDimensions,
  computeScreenNormal,
  computeScreenRect,
  type CameraPose,
  type ScreenPlane,
} from "./screenRect";

// Side length of the N×N screen-cell grid. Sourced from .env
// (CELLS_PER_SIDE), exposed to the client by Vite's envPrefix. Must
// match the value the Rust bake binary and Blender script read from
// the same .env.
const cellsPerSideRaw = Number(import.meta.env.CELLS_PER_SIDE);
export const cellsPerSide =
  Number.isFinite(cellsPerSideRaw) && cellsPerSideRaw > 0 ? cellsPerSideRaw : 9;

// Render output aspect (width / height).
export const renderAspect = 16 / 9;

// Camera and screen-plane values baked from the .blend. Units are meters
// and XYZ-Euler degrees (Blender defaults).
export const cameraPose: CameraPose = {
  positionMeters: [0.390658, 0.031391, 0.493628],
  rotationEulerDegXYZ: [69.0683, 1.23842, -267.058],
  horizontalFovDeg: 88.6044,
};

// Four world-space vertices of the screen quad, in image-space order
// (TL, TR, BR, BL — top/bottom/left/right as the camera sees them).
// The runtime derives width/height/normal/projection from these alone.
export const screenPlane: ScreenPlane = {
  vertices: [
    [-0.17681, -0.231728, 0.538728],
    [-0.187874, 0.323686, 0.529611],
    [-0.17338, 0.318155, 0.200048],
    [-0.162316, -0.237259, 0.209165],
  ],
};

export const screenRect = computeScreenRect(cameraPose, screenPlane, renderAspect);
export const screenProjectedCorners = computeProjectedCorners(
  cameraPose,
  screenPlane,
  renderAspect,
);
export const screenNormal = computeScreenNormal(screenPlane, cameraPose.positionMeters);
export const screenDimensions = computeScreenDimensions(screenPlane);

// Built by the Rust bake binary (scripts/bake-textures/) and served
// from public/composite/.
export const beautyImagePath = "/composite/beauty.png";
export const positionImagePath = "/composite/position.exr";
export const steamAtlasPath = "/composite/steam_atlas.png";
export const steamAtlasMetaPath = "/composite/steam_atlas_meta.json";
export const steamCellsManifestPath = "/composite/steam_cells_manifest.json";

// Number of pre-baked steam frames in the atlas. Matches the FRAME_END
// in blender/render_steam.sh (96 frames at 24 fps = 4 s loop).
export const steamFrameCount = 24;
// Atlas layout: frames packed row-major into a (cols × rows) grid.
// 16 × 6 = 96; chosen so neither axis runs into single-shot upload
// limits on low-end GPUs (8192 max texture dim is the typical floor).
export const steamAtlasColumns = 16;
export const steamAtlasRows = 6;
export const steamFps = 12;

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

// Target FPS for the screen-content rasterizer when the compositor
// reports GPU headroom. The rAF loop never re-rasterizes faster than
// this, even if the display refresh rate is higher (e.g. 144 Hz).
export const rasterizerNormalFps = 60;

// Fallback target FPS used when the compositor's GPU/frame metric is
// at or above `rasterizerGpuFrameThresholdMs` — the GPU is busy, so we
// ease off the rasterizer to give the compositor room.
export const rasterizerLowPowerFps = 30;

// Compositor GPU/frame (ms) at or above which the rasterizer drops to
// `rasterizerLowPowerFps`. gpuFrameMs is itself an EMA inside the
// compositor, so the switch is already smoothed. If the timer-query
// extension is unavailable the metric is null and we stay at the
// normal target.
export const rasterizerGpuFrameThresholdMs = 0.5;

export const steamCrop = {
  minX: parseEnvFloat(import.meta.env.STEAM_CROP_MIN_X, 0.375),
  maxX: parseEnvFloat(import.meta.env.STEAM_CROP_MAX_X, 0.625),
  minY: parseEnvFloat(import.meta.env.STEAM_CROP_MIN_Y, 0.0),
  maxY: parseEnvFloat(import.meta.env.STEAM_CROP_MAX_Y, 1.0),
};
