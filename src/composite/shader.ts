// GLSL sources for the composite. The fragment shader expects two
// pre-baked textures from scripts/bake-textures/:
//
//   u_beauty   — sRGB PNG, the scene rendered with the screen emitter
//                off; the additive base of the composite.
//   u_position — RGBA16F linear EXR, R = emitter U, G = emitter V,
//                B = scene-referred whitelight, A = 1. The cell-loop
//                math the shader used to do per fragment is baked into
//                this single sample at build time.
//
// Per output pixel the composite is
//
//     final = beauty + sample(userScreen, emitterUv) * whitelight
//
// `whitelight` is the linear scene-referred bounce magnitude, so no
// runtime scale uniform is needed. See COMPOSITE_THEORY.md.

export const vertexShaderSource = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Dual-Kawase blur for the screen-content texture. A chain of N
// downsample passes (5-tap bilinear-sampled kernel, halving resolution
// each level) followed by N upsample passes (8-tap bilinear-sampled
// kernel) back to source resolution. Both kernels are tuned so the
// round-trip approximates a Gaussian. Effective radius roughly doubles
// per chain level.
//
// `u_halfPixel = 0.5 / textureSize(u_source)` puts sample positions
// between source texels so they ride hardware bilinear filtering.
// `u_offset` stretches the kernel footprint at the current level.
// The blur runs in sRGB-encoded space; the composite shader applies
// its own sRGB EOTF to the result.

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

// sRGB-encoded scene render, top of image at v = 1 via UNPACK_FLIP_Y.
uniform sampler2D u_beauty;
// RGBA16F linear EXR — R=emitterU, G=emitterV, B=whitelight, A=1.
// The decoder pre-flips Y so this samples with v_uv directly.
uniform sampler2D u_position;
// Sampled from either the raw screen-content texture or the output of
// the dual-Kawase blur chain; sRGB-encoded screen pixels.
uniform sampler2D u_screen;
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

// Explicit sRGB <-> linear round-trip. The beauty PNG is
// sRGB-OETF-encoded by the bake; the screen-content canvas is
// sRGB-encoded by definition. Both upload with
// UNPACK_COLORSPACE_CONVERSION_WEBGL=NONE so the browser adds nothing
// on top, then linearize manually here. Composite math runs in linear,
// then re-encodes with the sRGB OETF before writing to fragColor.
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
  vec3 beauty = srgbToLinear(texture(u_beauty, v_uv).rgb);
  vec3 position = texture(u_position, v_uv).rgb;
  vec2 emitterUv = position.rg;
  float whitelight = position.b;

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

  vec3 finalColor = beauty + screenColor * whitelight;

  // Reinhard tonemap: x / (1 + x). Compresses values > 1 with a soft
  // knee so the bright bounce rolls off into the displayable range
  // instead of clipping flat at 1.0. Per-channel keeps saturated colors
  // saturated.
  finalColor = finalColor / (1.0 + finalColor);

  fragColor = vec4(linearToSrgb(finalColor), 1.0);
}
`;
