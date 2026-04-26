// GLSL sources for the composite. The atlas video lays out the three passes
// horizontally — `[ beauty | whitelight | position ]` — at one third of the
// frame width each, frame-locked by construction (single video, single
// timestamp). The fragment shader samples each pass at the matching screen
// pixel and combines them per COMPOSITE_THEORY.md:
//
//   emitterUv = boxAvg(position.rg) / max(boxAvg(whitelight.r), eps)
//   final     = beauty + scale * sample(userScreen, emitterUv) * whitelight
//
// The box average on the lookup coordinate denoises the position/whitelight
// division in dim areas (where per-pixel whitelight is near zero and the
// ratio explodes into speckles) without softening the bounce itself —
// `whitelight` in the multiply is still the un-blurred sample. Kernel
// radius is set by `BLUR_RADIUS` in the fragment shader.
//
// `scale` (uniform) recovers the magnitude that the build pipeline divided
// out of whitelight + position to keep them inside the 8-bit atlas range —
// see scripts/buildAssets.ts. The position/whitelight ratio is invariant
// under that scaling so emitterUv is correct without further adjustment.
//
// The atlas video is uploaded with UNPACK_FLIP_Y_WEBGL=true and the screen
// plane uses Blender's default V-up unwrap, so emitterUv = (U, V) reads
// canvas pixels in their natural orientation. No V flip in the shader.

export const vertexShaderSource = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Separable Gaussian blur for the screen-content texture, run as two
// fullscreen passes (horizontal then vertical) into ping-pong FBOs before
// the main composite samples it. Cost is O(radius) per axis instead of the
// O(radius^2) a single-pass kernel would impose, and the work happens at
// the screen texture's native resolution rather than the output viewport's
// — which is usually much smaller. Blur is performed in the source's
// encoded (sRGB) space; the composite shader still applies its own sRGB
// EOTF on the result, so the linear-light math downstream stays correct.
export const blurFragmentShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_source;
// Texel-sized offset along the blur axis: (1/width, 0) for horizontal,
// (0, 1/height) for vertical. Lets one shader handle both passes.
uniform vec2 u_direction;
uniform int u_radiusPx;

void main() {
  if (u_radiusPx <= 0) {
    fragColor = texture(u_source, v_uv);
    return;
  }
  float sigma = max(float(u_radiusPx) * 0.5, 1.0);
  float twoSigmaSquared = 2.0 * sigma * sigma;
  vec4 weightedSum = texture(u_source, v_uv);
  float weightSum = 1.0;
  // GLSL ES 3.0 permits non-constant loop bounds, but a fixed compile-time
  // upper limit keeps drivers happy and lets us early-out at u_radiusPx.
  const int MAX_RADIUS = 64;
  for (int offsetPx = 1; offsetPx <= MAX_RADIUS; offsetPx++) {
    if (offsetPx > u_radiusPx) break;
    float weight = exp(-float(offsetPx * offsetPx) / twoSigmaSquared);
    vec2 stepUv = u_direction * float(offsetPx);
    weightedSum += weight * (texture(u_source, v_uv + stepUv) + texture(u_source, v_uv - stepUv));
    weightSum += 2.0 * weight;
  }
  fragColor = weightedSum / weightSum;
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

// Sampled from either the raw screen-content texture or the output of the
// separable blur passes (see blurFragmentShaderSource). Either way, it
// holds sRGB-encoded screen pixels in the same orientation as the upload.

uniform sampler2D u_atlas;
uniform sampler2D u_screen;
uniform float u_scale;
// Per-axis linear stretch around (0.5, 0.5) applied to emitterUv before
// sampling the screen texture. (1.0, 1.0) = no change. > 1 pushes that
// axis's edges outward to compensate for residual nonlinearity at the
// edges of the position pass.
uniform vec2 u_uvStretch;
// Per-axis translation added to emitterUv after the stretch.
uniform vec2 u_uvOffset;

const float PASS_WIDTH = 1.0 / 3.0;
const float WHITELIGHT_EPS = 1.0e-3;

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

void main() {
  vec2 beautyUv     = vec2(v_uv.x * PASS_WIDTH,                     v_uv.y);
  vec2 whitelightUv = vec2(v_uv.x * PASS_WIDTH + PASS_WIDTH,        v_uv.y);
  vec2 positionUv   = vec2(v_uv.x * PASS_WIDTH + 2.0 * PASS_WIDTH,  v_uv.y);

  vec3 beauty     = srgbToLinear(texture(u_atlas, beautyUv).rgb);
  vec3 whitelight = srgbToLinear(texture(u_atlas, whitelightUv).rgb);

  // Denoise the lookup coordinate (not the bounce itself). Render noise
  // in dim areas makes whitelight near-zero and position noisy, so the
  // ratio position/whitelight blows up into speckles. A box average of
  // numerator and denominator independently — then divide — is a local
  // maximum-likelihood estimate of the emitter UV that's stable even
  // where any single pixel's whitelight is near zero. The bounce light
  // is low-frequency by physics, so blurring the *coordinate* costs no
  // perceptible sharpness in the lit image. We keep the un-blurred
  // whitelight for the final multiplication so the bounce falloff
  // itself stays crisp.
  const int BLUR_RADIUS = 16;
  const float BLUR_TAP_COUNT = float((2 * BLUR_RADIUS + 1) * (2 * BLUR_RADIUS + 1));
  vec2 atlasTexelSize = 1.0 / vec2(textureSize(u_atlas, 0));
  vec2 positionSum = vec2(0.0);
  float whitelightSum = 0.0;
  for (int dy = -BLUR_RADIUS; dy <= BLUR_RADIUS; dy++) {
    for (int dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; dx++) {
      vec2 offset = vec2(float(dx), float(dy)) * atlasTexelSize;
      positionSum += srgbToLinear(texture(u_atlas, positionUv + offset).rgb).rg;
      whitelightSum += srgbToLinear(texture(u_atlas, whitelightUv + offset).rgb).r;
    }
  }
  vec2 emitterUv = positionSum / max(whitelightSum, BLUR_TAP_COUNT * WHITELIGHT_EPS);
  emitterUv = (emitterUv - 0.5) * u_uvStretch + 0.5 + u_uvOffset;
  vec3 screenColor = srgbToLinear(texture(u_screen, emitterUv).rgb);

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
