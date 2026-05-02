// GLSL sources for the steam-overlay composite. The fragment shader
// expects:
//
//   u_steamAtlas — 8-bit RGBA PNG atlas of N×M frames packed
//                  row-major, top-left = frame 0. R, G are
//                  linear-quantized (emitter U, emitter V) in [0, 1].
//                  B is whitelight / whitelightScale sRGB-encoded so
//                  dim bounce keeps 8-bit precision instead of
//                  collapsing to 0; the shader sRGB-decodes B before
//                  scaling. A is volume density (1 - transmittance),
//                  linear-quantized; 0 means "no steam here," 1 means
//                  "fully opaque steam blocks the backdrop." UNPACK_-
//                  FLIP_Y on the HTMLImageElement upload lands the
//                  source's top scanline at texture v = 1.
//   u_screen     — sRGB-encoded screen-content texture, same source as
//                  the static compositor's u_screen.
//   u_whitelightScale — the max whitelight value across the atlas at
//                  bake time. The shader multiplies the sampled .b
//                  back by this to recover the linear scene-referred
//                  bounce magnitude.
//
// Per output pixel: convert v_uv into the strip's normalized UV; pick
// the current frame's sub-rect of the atlas; recover (emitterUv,
// whitelight, density); sample u_screen at emitterUv; output
// premultiplied (scattered_light, density). The canvas is created
// with premultipliedAlpha: true and the default 'normal' blend mode,
// so the browser composes `final = scattered_light + (1 - density) *
// backdrop` — additive for thin lit steam, occluding for dense steam
// (even when scattered_light is near zero), identity where there's
// no steam. Outside the strip, output (0, 0, 0, 0).

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
// Steam opacity multiplier in [0, 1]. Scales both the scattered-light
// emission and the density occlusion linearly, so 0 hides the steam
// entirely (returns the page underneath) and 1 plays the bake at full
// strength. Halving it lets twice as much backdrop bleed through and
// halves the visible scatter.
uniform float u_opacity;
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
      vec4 atlasSample = texture(u_steamAtlas, atlasCornerUv);
      // Show the raw stored byte values 1:1 in the canvas. R, G hold
      // linear UVs, B is sRGB-encoded whitelight, A is linear density;
      // we don't try to visualize them in any unified colorspace —
      // just display what the atlas pixels actually contain so we can
      // spot decoding or packing bugs. Force opaque alpha so the
      // backdrop doesn't bleed through the corner inspector.
      fragColor = vec4(atlasSample.rgb, 1.0);
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

  vec4 atlasSample = texture(u_steamAtlas, atlasUv);
  vec2 emitterUv = atlasSample.rg;
  // B is sRGB-encoded at bake time to preserve precision in the dim
  // tail of the whitelight range. Decode before scaling so the linear
  // bounce magnitude matches what the baker measured.
  float whitelightLinear = srgbToLinear(vec3(atlasSample.b)).r;
  float whitelight = whitelightLinear * u_whitelightScale;
  // A holds the volume density (1 - transmittance) baked from the
  // CoffeeSteam Combined pass. Scaled by u_opacity here so the slider
  // controls both the visible scatter and how much it occludes.
  float density = atlasSample.a * u_opacity;

  // Both whitelight = 0 and density = 0 means "no steam here at all" —
  // skip the screen sample and the tonemap to avoid touching the page.
  // Density alone may be nonzero (dense dark steam absorbing all
  // light) so we can't gate solely on whitelight.
  if (whitelight <= 0.0 && density <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 screenColor = srgbToLinear(texture(u_screen, emitterUv).rgb);
  vec3 contribution = screenColor * whitelight * u_intensity;

  // Generalized Reinhard with W = u_maxIntensity. For x much smaller
  // than W the output is approximately x (identity, so dim details
  // survive); for x much greater than W the output asymptotes to W.
  // W = 1 reproduces the classic x / (1 + x) soft-tonemap. Caps bright
  // peaks before alpha-compositing so the additive scatter term can't
  // overflow visible range.
  contribution = contribution / (1.0 + contribution / u_maxIntensity);

  // Premultiplied output. The canvas was created with
  // premultipliedAlpha: true, so the browser blends as
  // final = canvas.rgb + (1 - canvas.a) * backdrop. Encoding the
  // RGB as sRGB matches what the page is displayed in; we scale the
  // RGB by u_opacity so a partly-opaque scatter contribution dims
  // proportionally with the density it's paired with.
  vec3 sceneReferred = contribution * u_opacity;
  fragColor = vec4(linearToSrgb(sceneReferred), density);
}
`;
