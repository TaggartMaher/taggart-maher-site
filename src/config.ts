// Single source of truth shared between the human-owned Blender side and the
// agent-owned web side. When the Blender scene changes (frame count, fps,
// camera, screen plane), update the values here and the runtime adapts.

import { computeScreenRect, type CameraPose, type ScreenPlane } from "./screenRect";

export const frameCount = 96;
export const fps = 24;

// Side length of the screen-cell grid for cellular-image mode. The screen
// plane is subdivided into N×N cells in Blender (see
// blender/generate_screen_cells.py) and each cell renders to its own EXR
// AOV. The shader hard-codes the same N as `const int N` for argmax
// over (2 + N²) atlas tiles — bumping this value requires a code change
// on both sides, not just a config tweak.
export const cellsPerSide = 9;

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
  positionMeters: [-0.16833, 0.04207, 0.36069],
  // Plane stands vertical with its normal pointing world +X (toward the
  // camera). With Blender's XYZ-Euler (Rz · Ry · Rx) this is [90, 0, 90]:
  // local +Z → world +X (face), local +X → world +Y (width, horizontal),
  // local +Y → world +Z (height, vertical).
  rotationEulerDegXYZ: [90, 0, 90],
  widthMeters: 0.569,
  heightMeters: 0.35,
};

export const screenRect = computeScreenRect(cameraPose, screenPlane, renderAspect);

// Composite atlas video — a single 3x-wide H.264 yuv420p MP4 file
// containing all three passes side-by-side (beauty | whitelight |
// position) at `renderAspect` per pass. Built by scripts/buildAssets.ts
// and served from public/composite/ by Vite. The shader samples each
// third of the frame as its own pass, so frame lock between passes is
// automatic. 4:2:0 is the only chroma format that decodes via `<video>`
// in Chrome, Firefox, and Safari — system decoders reject 4:4:4.
export const atlasPath = "/composite/atlas.mp4";

// Perceptually-lossless still version of the atlas: frame 1 of the same
// hstack+sRGB pipeline, encoded as PNG (rgb24, no chroma subsampling). The
// debug menu can route the compositor to this image instead of the MP4 to
// eliminate H.264 / 4:2:0 artifacts when iterating on shader behavior.
export const atlasImagePath = "/composite/atlas.png";
