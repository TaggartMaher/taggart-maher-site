import { cellsPerSide, tileCols, tileRows } from "../config";

// GLSL sources for the composite. The fragment shader expects a
// cellular still atlas of (1 + N²) logical tiles
// `[ beauty, screen_0, screen_1, … , screen_{N²-1} ]`
// packed into a TILE_COLS × TILE_ROWS grid. Each `screen_K` tile is the
// Cycles light-group AOV for cell K of the screen plane subdivided into
// an N × N grid (see blender/generate_screen_cells.py). N is hard-coded
// as `const int N` in the fragment shader — bumping it requires a
// code change on both the Blender and shader sides.
//
// Per output pixel: each cell's material emits `(within_U, within_V, 1) ×
// intensity`, so cell_K.b records that cell's intensity contribution at
// the wall pixel and cell_K.rg records `intensity × (within_U, within_V)`.
// Decomposing the global screen-plane U coordinate as
// `U_global = (col_K + within_U) / N` and integrating against the wall
// pixel's geometric weighting g(s) gives:
//
//   <U_global> = (Σ_K col_K * cell_K.b + Σ_K cell_K.r) / (N * Σ_K cell_K.b)
//
// (and likewise for V using `row_K` and `cell_K.g`). The denominator
// Σ_K cell_K.b is the reconstructed whitelight at the pixel — total
// bounce light from the screen. The shader then samples the user's
// screen-content texture at that emitter UV and composites:
//
//   final = beauty + scale * sample(userScreen, emitterUv) * whitelight
//
// `scale` (uniform) recovers the magnitude that the build pipeline
// divided out of the cell tiles to keep them inside the 8-bit atlas
// range — see scripts/buildAssets.ts.

export const vertexShaderSource = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Dual Kawase blur for the screen-content texture (Marius Bjørge, ARM —
// SIGGRAPH 2015 "Bandwidth-Efficient Graphics"). A chain of N downsample
// passes, each halving resolution and running a 5-tap bilinear-sampled
// kernel, then N upsample passes back up to source resolution running an
// 8-tap bilinear-sampled kernel. Both kernels are tuned so the round-trip
// approximates a true Gaussian visually.
//
// Cost is constant per pass (4–8 bilinear taps) and effective radius
// roughly doubles per chain level, so we can reach radii in the hundreds
// of source pixels for a fraction of what a separable Gaussian of the
// same footprint would cost — and bandwidth at deep levels is tiny since
// the framebuffer is 1/4, 1/16, 1/64… of the source area.
//
// Both shaders take `u_halfPixel = 0.5 / textureSize(u_source)` so the
// sample positions land between source texels and free-ride on hardware
// bilinear filtering. `u_offset` is a scalar dial that stretches the
// kernel footprint at the current level — used by the host to fine-tune
// effective radius beyond the discrete chain depth. The blur runs in
// sRGB-encoded space; the composite shader applies its own sRGB EOTF to
// the result.

export const downsampleFragmentShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_source;
uniform vec2 u_halfPixel;
uniform float u_offset;

void main() {
  vec2 step = u_halfPixel * u_offset;
  vec4 sum = texture(u_source, v_uv) * 4.0;
  sum += texture(u_source, v_uv - step);
  sum += texture(u_source, v_uv + step);
  sum += texture(u_source, v_uv + vec2(step.x, -step.y));
  sum += texture(u_source, v_uv - vec2(step.x, -step.y));
  fragColor = sum / 8.0;
}
`;

export const upsampleFragmentShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_source;
uniform vec2 u_halfPixel;
uniform float u_offset;

void main() {
  vec2 step = u_halfPixel * u_offset;
  vec4 sum = texture(u_source, v_uv + vec2(-step.x * 2.0, 0.0));
  sum += texture(u_source, v_uv + vec2(-step.x, step.y)) * 2.0;
  sum += texture(u_source, v_uv + vec2(0.0, step.y * 2.0));
  sum += texture(u_source, v_uv + vec2(step.x, step.y)) * 2.0;
  sum += texture(u_source, v_uv + vec2(step.x * 2.0, 0.0));
  sum += texture(u_source, v_uv + vec2(step.x, -step.y)) * 2.0;
  sum += texture(u_source, v_uv + vec2(0.0, -step.y * 2.0));
  sum += texture(u_source, v_uv + vec2(-step.x, -step.y)) * 2.0;
  fragColor = sum / 12.0;
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

// Sampled from either the raw screen-content texture or the output of the
// dual-Kawase blur chain (see downsample/upsampleFragmentShaderSource).
// Either way, it holds sRGB-encoded screen pixels in the same orientation
// as the upload.

uniform sampler2D u_atlas;
uniform sampler2D u_screen;
uniform float u_scale;
// Per-axis linear stretch around (0.5, 0.5) applied to the emitter UV
// before sampling the screen texture. (1.0, 1.0) = no change.
// > 1 pushes that axis's edges outward.
uniform vec2 u_uvStretch;
// Per-axis translation added to emitterUv after the stretch.
uniform vec2 u_uvOffset;
// Symmetric inset of the valid screen-content sampling window. Zeroed
// outside [edgeCutoff, 1 - edgeCutoff] on either axis.
uniform float u_edgeCutoff;
// Color adjustments applied to the screen-content sample in linear
// light before it multiplies into the bounce. 1.0 is a no-op for all
// three.
uniform float u_screenSaturation;
uniform float u_screenContrast;
uniform float u_screenBrightness;
// Box-average radius (in atlas texels) for the per-cell accumulation.
// 0 = single sample at the pixel; > 0 smooths cell-boundary flicker.
// The fixed [-5..5] outer loop bounds keep them compile-time constant
// for older drivers; this uniform gates which iterations actually
// contribute.
uniform int u_lookupBlurRadius;

// Cells per side of the screen-plane subdivision. Tile count is
// (beauty + N²), packed row-major into a tileCols × tileRows grid
// derived from cellsPerSide in src/config.ts and injected here so the
// shader and scripts/buildAssets.ts stay in sync. Logical tile K maps
// to (col = K % TILE_COLS, row = K / TILE_COLS), where row 0 lives at
// the bottom of the texture (and PNG top; UNPACK_FLIP_Y_WEBGL=true on
// upload flips the orientation, and tileUv compensates).
const int N = ${cellsPerSide};
const int CELL_COUNT = N * N;
const int TILE_COLS = ${tileCols};
const int TILE_ROWS = ${tileRows};

// Per-cell screen-plane (col, row) — uploaded from atlasMeta.json which
// is generated by scripts/buildAssets.ts from blender's cells_manifest.
// Defaults to identity (col = K % N, row = K / N) until the metadata
// arrives.
uniform ivec2 u_cellGrid[CELL_COUNT];

// Explicit sRGB <-> linear round-trip. The atlas is sRGB-OETF-encoded by
// the build, and the screen-content PNG is sRGB-encoded by definition.
// We upload both with UNPACK_COLORSPACE_CONVERSION_WEBGL=NONE so the
// browser adds nothing on top, then linearize manually here. Composite
// math is done in linear, then re-encoded with the sRGB OETF before
// writing to fragColor.
vec3 srgbToLinear(vec3 c) {
  vec3 cutoff = vec3(0.04045);
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  vec3 lo = c / 12.92;
  return mix(hi, lo, vec3(lessThan(c, cutoff)));
}

vec3 linearToSrgb(vec3 c) {
  vec3 cutoff = vec3(0.0031308);
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  vec3 lo = 12.92 * c;
  return mix(hi, lo, vec3(lessThan(c, cutoff)));
}

vec2 tileUv(int tileIndex, vec2 uv) {
  // Subtract-based modulo dodges the unreliable integer % operator on
  // some mobile drivers. xstack grid mode fills the atlas row-major
  // from the PNG top, so logical row 0 (beauty + first row of cells)
  // sits at the PNG top. UNPACK_FLIP_Y_WEBGL=true on upload puts the
  // PNG top at texture v=1, so we invert the row direction here so
  // that v_uv.y near 1 lands inside the row-0 tile.
  int col = tileIndex - (tileIndex / TILE_COLS) * TILE_COLS;
  int rowFromTop = tileIndex / TILE_COLS;
  int row = (TILE_ROWS - 1) - rowFromTop;
  return vec2(
    (uv.x + float(col)) / float(TILE_COLS),
    (uv.y + float(row)) / float(TILE_ROWS)
  );
}

void main() {
  vec3 beauty = srgbToLinear(texture(u_atlas, tileUv(0, v_uv)).rgb);
  vec2 atlasTexelSize = 1.0 / vec2(textureSize(u_atlas, 0));

  // Reconstruct whitelight at the pixel center as Σ_K cell_K.b. By
  // construction (each cell emits (within_U, within_V, 1) × intensity),
  // cell_K.b records intensity_K and Σ_K intensity_K is the total
  // bounce light reaching this pixel.
  float whitelight = 0.0;
  for (int K = 0; K < CELL_COUNT; K++) {
    whitelight += srgbToLinear(texture(u_atlas, tileUv(1 + K, v_uv)).rgb).b;
  }

  // Continuous global emitter UV. With cell_K.b = intensity_K and
  // cell_K.rg = intensity_K * (within_U, within_V), and decomposing
  // U_global = (col_K + within_U) / N:
  //
  //   <U_global> = (Σ_K col_K * cell_K.b + Σ_K cell_K.r) / (N * Σ_K cell_K.b)
  //
  // Box-averaged in screen space by u_lookupBlurRadius so dim regions
  // where any single pixel's whitelight is near zero stay stable
  // instead of exploding into speckles. The averaged whitelightSum
  // (= Σ_K cell_K.b summed over the box) is the matching divisor.
  vec2 weightedGridSum = vec2(0.0);
  vec2 totalCellRg = vec2(0.0);
  float whitelightSum = 0.0;
  int radius = u_lookupBlurRadius;
  for (int dy = -5; dy <= 5; dy++) {
    if (dy < -radius || dy > radius) continue;
    for (int dx = -5; dx <= 5; dx++) {
      if (dx < -radius || dx > radius) continue;
      vec2 offset = vec2(float(dx), float(dy)) * atlasTexelSize;
      for (int K = 0; K < CELL_COUNT; K++) {
        vec3 cellSample = srgbToLinear(texture(u_atlas, tileUv(1 + K, v_uv) + offset).rgb);
        whitelightSum += cellSample.b;
        weightedGridSum += vec2(u_cellGrid[K]) * cellSample.b;
        totalCellRg += cellSample.rg;
      }
    }
  }
  vec2 emitterUv = (weightedGridSum + totalCellRg) / max(whitelightSum * float(N), 1.0e-3);

  emitterUv = (emitterUv - 0.5) * u_uvStretch + 0.5 + u_uvOffset;
  vec2 inWindow = step(vec2(u_edgeCutoff), emitterUv) *
                  step(emitterUv, vec2(1.0 - u_edgeCutoff));
  float screenMask = inWindow.x * inWindow.y;
  vec3 screenColor = srgbToLinear(texture(u_screen, emitterUv).rgb) * screenMask;

  // Color adjustments in linear light, in saturation → contrast → brightness
  // order. Saturation lerps from Rec.709 luma toward the original color (0
  // = greyscale, 1 = unchanged, >1 boosts chroma). Contrast scales the
  // signed deviation from a 0.5 mid-gray. Brightness is a flat multiplier.
  float screenLuma = dot(screenColor, vec3(0.2126, 0.7152, 0.0722));
  screenColor = mix(vec3(screenLuma), screenColor, u_screenSaturation);
  screenColor = (screenColor - 0.5) * u_screenContrast + 0.5;
  screenColor *= u_screenBrightness;
  screenColor = max(screenColor, vec3(0.0));

  vec3 finalColor = beauty + u_scale * screenColor * whitelight;

  // Reinhard tonemap: x / (1 + x). Compresses values >1 with a soft
  // knee so the bright bounce pool rolls off into the displayable range
  // instead of clipping flat at 1.0. Beauty (already ≤1) passes through
  // nearly unchanged. Per-channel keeps saturated colors saturated.
  finalColor = finalColor / (1.0 + finalColor);

  fragColor = vec4(linearToSrgb(finalColor), 1.0);
}
`;
