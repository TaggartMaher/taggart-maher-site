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

interface LoadableAsset {
  name: string;
  url: string;
}

// The static scene + bounce-light textures are needed in every mode.
const CORE_LOADABLE_ASSETS: LoadableAsset[] = [
  { name: "beauty.png", url: beautyImagePath },
  { name: "position.exr", url: positionImagePath },
];

// The steam atlas is only fetched when the SteamCompositor is mounted.
// Eco mode and a disabled coffee-steam toggle both skip it — no point
// downloading 7 MB the GPU is never going to sample.
const STEAM_LOADABLE_ASSETS: LoadableAsset[] = [
  { name: "steam_atlas.png", url: steamAtlasPath },
  { name: "steam_atlas_meta.json", url: steamAtlasMetaPath },
];

// Pre-registered with the loading tracker so the loading screen shows
// the full asset list at 0% before the compositor begins fetching. The
// names are surfaced verbatim in the UI; URLs match the constants
// above.
export const LOADABLE_ASSETS: LoadableAsset[] = [...CORE_LOADABLE_ASSETS, ...STEAM_LOADABLE_ASSETS];

export function getLoadableAssets(includeSteam: boolean): LoadableAsset[] {
  return includeSteam ? LOADABLE_ASSETS : CORE_LOADABLE_ASSETS;
}

// Steam atlas frame-grid layout (cols × rows) and total frame count
// are not duplicated here — the bake binary writes them into
// steam_atlas_meta.json alongside whitelightScale, and the runtime
// reads them from there. Keeps the runtime in lockstep with whichever
// STEAM_ATLAS_COLUMNS / STEAM_ATLAS_ROWS the bake was run with.
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

// Target FPS cap for the screen-content rasterizer. The rAF loop never
// re-rasterizes faster than this, even if the display refresh rate is
// higher (e.g. 144 Hz). The bounce light is heavily blurred so the
// reader can't tell the rasterizer isn't running per-display-refresh.
export const rasterizerFps = 24;

// Target FPS when the user-toggled `ecoMode` debug setting is on. Half
// the normal rate; the bounce light's dual-Kawase blur smooths over
// the slower update without visible stepping.
export const rasterizerFpsEcoMode = 12;

// Cap on the compositor canvas's effective devicePixelRatio in eco
// mode. The fragment shader cost scales with pixel count, so a 2× DPR
// display does 4× the per-frame shader work — capping at 1.0 brings
// that back to baseline. The composite is upscaled by the browser to
// CSS pixel size, which the heavy bounce-light blur masks anyway.
export const compositorEcoModeMaxDpr = 1.0;

// Target FPS cap for the static compositor in eco mode. The beauty +
// position textures are static, so cutting render frequency just
// makes the user-content reflection update at a slower cadence — the
// bounce light is dual-Kawase-blurred anyway, so 30 Hz is plenty.
export const compositorFpsEcoMode = 30;

export const steamCrop = {
  minX: parseEnvFloat(import.meta.env.STEAM_CROP_MIN_X, 0.375),
  maxX: parseEnvFloat(import.meta.env.STEAM_CROP_MAX_X, 0.625),
  minY: parseEnvFloat(import.meta.env.STEAM_CROP_MIN_Y, 0.0),
  maxY: parseEnvFloat(import.meta.env.STEAM_CROP_MAX_Y, 1.0),
};
