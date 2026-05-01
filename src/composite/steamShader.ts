// GLSL sources for the steam-overlay composite. The fragment shader
// expects:
//
//   u_steamAtlas — 8-bit RGB PNG atlas of N×M frames packed row-major,
//                  top-left = frame 0. Each pixel encodes
//                  (emitter U, emitter V, whitelight / whitelightScale)
//                  with all three channels in [0, 1]. UNPACK_FLIP_Y on
//                  the HTMLImageElement upload lands the source's top
//                  scanline at texture v = 1.
//   u_screen     — sRGB-encoded screen-content texture, same source as
//                  the static compositor's u_screen.
//   u_whitelightScale — the max whitelight value across the atlas at
//                  bake time. The shader multiplies the sampled .b
//                  back by this to recover the linear scene-referred
//                  bounce magnitude.
//
// Per output pixel: convert v_uv into the strip's normalized UV; pick
// the current frame's sub-rect of the atlas; recover (emitterUv,
// whitelight); sample u_screen at emitterUv; output `screen *
// whitelight * intensity` for additive composition over whatever
// the page already shows. Outside the strip, output (0, 0, 0, 0) so
// `mix-blend-mode: plus-lighter` leaves the backdrop untouched.

export const steamVertexShaderSource = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const steamFragmentShaderSource = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_steamAtlas;
uniform sampler2D u_screen;
// Strip in full-frame coords: (minX, minY, maxX, maxY). Outside this
// rect the steam contributes nothing.
uniform vec4 u_strip;
// (cols, rows) of the frame grid in the atlas.
uniform vec2 u_atlasGridSize;
// Current animation frame in [0, cols * rows).
uniform int u_frameIndex;
// Multiplier applied to the bounce contribution before the soft clamp.
uniform float u_intensity;
// Per-channel soft ceiling. Generalized Reinhard x / (1 + x/W):
// at x = W output is W/2, x -> infinity output -> W. Lowering this
// caps bright steam without dimming low-magnitude details (small x
// is approximately identity).
uniform float u_maxIntensity;
// Bake-time max whitelight; recovers the linear value from the
// PNG's [0, 1]-quantized .b channel.
uniform float u_whitelightScale;
// 1 → render the raw atlas in the top-right corner for debugging,
// skip the steam composite. 0 → normal path.
uniform int u_showAtlas;

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
  if (u_showAtlas == 1) {
    // Top-right 25% × 25% corner displays the raw atlas. Outside, we
    // pass through transparently so the backdrop shows.
    if (v_uv.x > 0.75 && v_uv.y > 0.75) {
      vec2 atlasCornerUv = (v_uv - vec2(0.75)) / 0.25;
      vec3 atlasColor = texture(u_steamAtlas, atlasCornerUv).rgb;
      // Atlas channels are linear (R = U, G = V, B = whitelight). Show
      // them as-is, just sRGB-encoded for the canvas.
      fragColor = vec4(linearToSrgb(atlasColor), 1.0);
    } else {
      fragColor = vec4(0.0);
    }
    return;
  }

  vec2 stripUv;
  stripUv.x = (v_uv.x - u_strip.x) / (u_strip.z - u_strip.x);
  stripUv.y = (v_uv.y - u_strip.y) / (u_strip.w - u_strip.y);
  if (stripUv.x < 0.0 || stripUv.x > 1.0 || stripUv.y < 0.0 || stripUv.y > 1.0) {
    fragColor = vec4(0.0);
    return;
  }

  float cols = u_atlasGridSize.x;
  float rows = u_atlasGridSize.y;
  float frameCol = mod(float(u_frameIndex), cols);
  float frameRow = floor(float(u_frameIndex) / cols);

  // Atlas was written top-row-first; the JS decoder flips so that the
  // atlas's source-top sits at texture v = 1. Frame F at source row
  // frameRow occupies texture v in [(rows - frameRow - 1)/rows,
  // (rows - frameRow)/rows]. stripUv.y = 1 (top of strip) maps to the
  // top of the frame.
  vec2 atlasUv;
  atlasUv.x = (frameCol + stripUv.x) / cols;
  atlasUv.y = (rows - frameRow - 1.0 + stripUv.y) / rows;

  vec3 position = texture(u_steamAtlas, atlasUv).rgb;
  vec2 emitterUv = position.rg;
  float whitelight = position.b * u_whitelightScale;

  if (whitelight <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 screenColor = srgbToLinear(texture(u_screen, emitterUv).rgb);
  vec3 contribution = screenColor * whitelight * u_intensity;

  // Generalized Reinhard with W = u_maxIntensity. For x much smaller
  // than W the output is approximately x (identity, so dim details
  // survive); for x much greater than W the output asymptotes to W.
  // plus-lighter then composes additively without flattening on
  // overflow. W = 1 reproduces the classic x / (1 + x) soft-tonemap.
  contribution = contribution / (1.0 + contribution / u_maxIntensity);

  fragColor = vec4(linearToSrgb(contribution), 1.0);
}
`;
