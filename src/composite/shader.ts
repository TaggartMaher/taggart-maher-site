// GLSL sources for the composite. The atlas video lays out the three passes
// horizontally — `[ beauty | whitelight | position ]` — at one third of the
// frame width each, frame-locked by construction (single video, single
// timestamp). The fragment shader samples each pass at the matching screen
// pixel and combines them per COMPOSITE_THEORY.md:
//
//   emitterUv = position.rg / max(whitelight.r, eps)
//   final     = beauty + scale * sample(userScreen, emitterUv) * whitelight
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
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_atlas;
uniform sampler2D u_screen;
uniform float u_scale;

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
  vec3 position   = srgbToLinear(texture(u_atlas, positionUv).rgb);

  vec2 emitterUv = position.rg / max(whitelight.r, WHITELIGHT_EPS);
  vec3 screenColor = srgbToLinear(texture(u_screen, emitterUv).rgb);

  float bounceMask = step(0.02, whitelight.r);
  vec3 finalColor = beauty + bounceMask * u_scale * screenColor * whitelight;
  fragColor = vec4(linearToSrgb(finalColor), 1.0);
}
`;
