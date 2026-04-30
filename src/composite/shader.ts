// GLSL sources for the composite. The fragment shader expects a
// cellular still atlas of (2 + N²) logical tiles
// `[ beauty, whitelight, screen_0, screen_1, … , screen_{N²-1} ]`
// packed into a TILE_COLS × TILE_ROWS grid (4 × 3 = 12 slots, 11 used,
// 1 empty) so neither atlas dimension exceeds the GPU MAX_TEXTURE_SIZE
// of 16384. Each `screen_K` tile is the Cycles light-group AOV for
// cell K of the screen plane subdivided into an N × N grid
// (row-major; see blender/generate_screen_cells.py). N is hard-coded
// as `const int N` in the fragment shader — bumping it requires a
// code change on both the Blender and shader sides.
//
// Per output pixel: pick the cell whose AOV contributes the most light
// at that pixel (argmax of `length(rgb.rg)` over the K tiles, optionally
// box-averaged in screen space by `u_lookupBlurRadius` to suppress
// flicker at cell boundaries), then look up the user's screen content
// at that cell's centroid UV. `final = beauty + scale * screenColor *
// whitelight`, with the same scene-referred recovery as before:
//
//   final = beauty + scale * sample(userScreen, cellCentroid[argmax]) * whitelight
//
// `scale` (uniform) recovers the magnitude that the build pipeline
// divided out of whitelight + screen_K to keep them inside the 8-bit
// atlas range — see scripts/buildAssets.ts. Cells are pre-scaled by
// the same E as whitelight so the multiply composites correctly.
//
// The atlas image is uploaded with UNPACK_FLIP_Y_WEBGL=true and the
// screen plane uses Blender's default V-up unwrap, so the cell
// centroid (U, V) reads canvas pixels in their natural orientation.
// No V flip in the shader.
//
// (The video MP4 atlas is still 3-pass `[ beauty | whitelight |
// position ]` and is the path used when "Cellular image" is unchecked
// in the debug menu. The shader, however, is single-mode — the
// argmax/centroid path is what runs on whichever atlas the host binds.
// See CELLULAR_IMAGE_HANDOFF.md for context.)

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
// effective radius beyond the discrete chain depth. As in the source's
// previous separable implementation, the blur runs in sRGB-encoded space;
// the composite shader applies its own sRGB EOTF to the result.

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
// Per-axis linear stretch around (0.5, 0.5) applied to the cell-centroid
// emitterUv before sampling the screen texture. (1.0, 1.0) = no change.
// > 1 pushes that axis's edges outward to compensate for residual
// nonlinearity in the cell layout.
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
// Box-average radius (in atlas texels) for the per-cell brightness
// reduction, before argmax. 0 = single sample at the pixel; > 0 smooths
// cell-boundary flicker. The fixed [-5..5] outer loop bounds in
// cellBrightnessAt keep loop bounds compile-time constant for
// older drivers; this uniform gates which iterations actually contribute.
uniform int u_lookupBlurRadius;

// Cells per side of the screen-plane subdivision. Hard-coded for the
// prototype — bumping N requires re-running the Blender script and
// updating cellsPerSide in src/config.ts. Tile count is (beauty +
// whitelight + N²) = 11 logical tiles, packed into a TILE_COLS x
// TILE_ROWS grid (12 slots, last slot empty) so neither atlas
// dimension exceeds GPU MAX_TEXTURE_SIZE = 16384. With 1920x1080
// renders, the atlas is 7680 x 3240. Logical tile K maps to
// (col = K % TILE_COLS, row = K / TILE_COLS), where row 0 lives at
// the bottom of the texture (and PNG bottom; see scripts/buildAssets.ts).
const int N = 3;
const int CELL_COUNT = N * N;
const int TILE_COLS = 4;
const int TILE_ROWS = 3;

// Explicit sRGB <-> linear round-trip. The atlas is sRGB-OETF-encoded by
// the build, and the screen-content PNG is sRGB-encoded by definition. We
// upload both with UNPACK_COLORSPACE_CONVERSION_WEBGL=NONE so the browser
// adds nothing on top, then linearize manually here. Composite math is
// done in linear, then re-encoded with the sRGB OETF before writing to
// fragColor (the canvas drawing buffer is treated as sRGB by the
// browser).
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
  // from the PNG top, so logical row 0 (beauty/whitelight/s_0/s_1)
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

float cellBrightnessAt(int cellIndex, vec2 uv, vec2 atlasTexelSize) {
  float total = 0.0;
  int radius = u_lookupBlurRadius;
  for (int dy = -5; dy <= 5; dy++) {
    if (dy < -radius || dy > radius) continue;
    for (int dx = -5; dx <= 5; dx++) {
      if (dx < -radius || dx > radius) continue;
      vec2 offset = vec2(float(dx), float(dy)) * atlasTexelSize;
      vec3 cellSample = srgbToLinear(texture(u_atlas, tileUv(2 + cellIndex, uv) + offset).rgb);
      // Tap counts cancel inside argmax, so the sum can stand in for
      // the true average — saves one float divide per cell.
      total += length(cellSample.rg);
    }
  }
  return total;
}

void main() {
  vec3 beauty     = srgbToLinear(texture(u_atlas, tileUv(0, v_uv)).rgb);
  vec3 whitelight = srgbToLinear(texture(u_atlas, tileUv(1, v_uv)).rgb);
  vec2 atlasTexelSize = 1.0 / vec2(textureSize(u_atlas, 0));

  // Argmax over the N² cell AOVs at this pixel. The winning cell's
  // centroid in the screen plane's UV space is the discrete emitter
  // position — one of N² fixed points (the cells' centers).
  int dominantCell = 0;
  float bestBrightness = -1.0;
  for (int cellIndex = 0; cellIndex < CELL_COUNT; cellIndex++) {
    float brightness = cellBrightnessAt(cellIndex, v_uv, atlasTexelSize);
    if (brightness > bestBrightness) {
      bestBrightness = brightness;
      dominantCell = cellIndex;
    }
  }

  // Empirical bmesh face order for CELLS_PER_SIDE=3 (verified by
  // dragging the debug square and watching which cell's region lights
  // up). Stored as (col, row) in the screen plane's UV space, where
  // row 0 = bottom (V-up). Hard-coded for the prototype — bumping N
  // requires re-deriving this table.
  ivec2 cellGridPositions[9] = ivec2[9](
    ivec2(0, 2),  // K=0  TL
    ivec2(0, 0),  // K=1  BL
    ivec2(0, 1),  // K=2  ML
    ivec2(2, 0),  // K=3  BR
    ivec2(1, 0),  // K=4  BM
    ivec2(2, 1),  // K=5  MR
    ivec2(1, 1),  // K=6  MM
    ivec2(2, 2),  // K=7  TR
    ivec2(1, 2)   // K=8  TM
  );
  ivec2 gridPos = cellGridPositions[dominantCell];

  // Within-cell UV decode. The dominant cell's R/G channels encode
  // (intensity * within_cell_U, intensity * within_cell_V) at this
  // wall pixel — a UV-stretch-to-fit emission gives each cell a local
  // [0,1]² texture coordinate, weighted by the cell's bounce-light
  // contribution. Whitelight is the un-segmented bounce intensity
  // (sum over all cells), and where the dominant cell dominates the
  // bounce locally, whitelight ≈ intensity_dominant. So the ratio
  // dominant.rg / whitelight.r recovers the average within-cell UV
  // — same algebra as the old position/whitelight pass, just per-cell.
  // Box-average numerator and denominator separately for the same
  // reason as the old shader: dim regions where the per-pixel
  // whitelight is near zero make the ratio explode into speckles
  // unless smoothed first. Use the same u_lookupBlurRadius as the
  // argmax pass so the two stages agree on neighborhood size.
  vec2 cellRgSum = vec2(0.0);
  float whitelightSum = 0.0;
  int decodeRadius = u_lookupBlurRadius;
  for (int dy = -5; dy <= 5; dy++) {
    if (dy < -decodeRadius || dy > decodeRadius) continue;
    for (int dx = -5; dx <= 5; dx++) {
      if (dx < -decodeRadius || dx > decodeRadius) continue;
      vec2 offset = vec2(float(dx), float(dy)) * atlasTexelSize;
      vec3 cellSample = srgbToLinear(texture(u_atlas, tileUv(2 + dominantCell, v_uv) + offset).rgb);
      vec3 wlSample = srgbToLinear(texture(u_atlas, tileUv(1, v_uv) + offset).rgb);
      cellRgSum += cellSample.rg;
      whitelightSum += wlSample.r;
    }
  }
  vec2 withinCellUv = clamp(cellRgSum / max(whitelightSum, 1.0e-3), 0.0, 1.0);

  // Absolute screen-plane UV: cell's grid origin in [0,N]² plus the
  // within-cell offset in [0,1]², all scaled into [0,1]².
  vec2 emitterUv = (vec2(gridPos) + withinCellUv) / float(N);

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
  // knee so the bright bounce pool (often 3-5x in scene-referred
  // linear with E ~ 3.19) rolls off into the displayable range
  // instead of clipping flat at 1.0. Beauty (already ≤1) passes
  // through nearly unchanged. Per-channel keeps saturated colors
  // saturated; switch to luminance-based if highlight desaturation
  // becomes a goal.
  finalColor = finalColor / (1.0 + finalColor);

  fragColor = vec4(linearToSrgb(finalColor), 1.0);
}
`;
