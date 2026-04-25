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
// Blender's screen-plane UV map is V-down (image-editor convention), so we
// flip V on emitterUv before sampling user content (which is drawn into a
// HTML canvas, also V-down). Without this, canvas-bottom maps to screen-top.

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

void main() {
  vec2 beautyUv     = vec2(v_uv.x * PASS_WIDTH,                     v_uv.y);
  vec2 whitelightUv = vec2(v_uv.x * PASS_WIDTH + PASS_WIDTH,        v_uv.y);
  vec2 positionUv   = vec2(v_uv.x * PASS_WIDTH + 2.0 * PASS_WIDTH,  v_uv.y);

  vec3 beauty     = texture(u_atlas, beautyUv).rgb;
  vec3 whitelight = texture(u_atlas, whitelightUv).rgb;
  vec3 position   = texture(u_atlas, positionUv).rgb;

  vec2 emitterUv = position.rg / max(whitelight.r, WHITELIGHT_EPS);
  emitterUv.y = 1.0 - emitterUv.y;
  vec3 screenColor = texture(u_screen, emitterUv).rgb;

  vec3 finalColor = beauty + u_scale * screenColor * whitelight;
  fragColor = vec4(finalColor, 1.0);
}
`;
