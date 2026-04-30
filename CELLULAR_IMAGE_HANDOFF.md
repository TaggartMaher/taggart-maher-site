# Cellular Image Mode — Implementation Handoff

## Read this first

You are implementing a **prototype**. Optimize for fewest file changes, minimum new abstractions, and easy review.

- Do **not** add new shader programs, new file modules, new build steps, or new config layers.
- Do **not** introduce flexibility for "future N values" or hypothetical "modes." Hard-code what we need today and let the next iteration generalize.
- Do **not** preserve the old position-pass code path inside the cellular code path. The cellular path replaces the old path inside the lossless-image branch — that branch can keep working with the new data, period.
- Edit existing files in place. No new files unless one is genuinely new (e.g. CSS that doesn't exist).

The user reviews diffs by hand. Fewer touched files = better.

## Goal in one paragraph

The site already has a debug toggle that swaps the runtime atlas from the H.264 video to a single lossless PNG (`useLosslessImage`). We are repurposing that lossless path to source from a different upstream pipeline: **N² cell EXRs from a Blender Cycles light-group render** instead of the existing single position pass. At runtime, the shader picks the brightest cell at each pixel and uses that cell's known UV centroid as the emitter position. This trades continuous position recovery for argmax-over-N² discrete positions, intentionally — the bigger color steps survive lossless storage cleanly.

Make this the **default** state of the debug menu. Rename the toggle "Cellular image."

## Concrete inputs you can rely on

- `blender/generate_screen_cells.py` writes per-frame EXRs named `screen_<i>_####.exr`, where `<i>` is the face index `[0, N² - 1]`, into the directory the user picks (env: `BLENDER_RENDERS_DIR`). The script also writes `beauty_####.exr` and `whitelight_####.exr` via the existing pre-cells pipeline.
- `CELLS_PER_SIDE` is the side length of the grid (currently `3` → 9 cells). Treat it as a single source of truth: add `cellsPerSide` to `src/config.ts`. Blender side and web side must agree; mismatch is the user's responsibility.
- Each cell uses a UV-stretch-to-fit material so its AOV's R channel encodes within-cell U and G encodes within-cell V at the wall pixel, weighted by that cell's contribution. We do **not** use that within-cell precision in this prototype — argmax is enough. Within-cell decoding is a follow-up.

## Algorithm

For each output pixel:

1. Compute `cell_brightness[K]` for each `K ∈ [0, N²)` from the cell K AOV. Use `length(rgb.rg)` (or `max(rgb.r, rgb.g)` — pick one and stick with it; no abstraction). The cell with the highest contribution wins.
2. `dominant = argmax_K cell_brightness[K]`.
3. `emitterUv = cell_centroid[dominant]` — a constant lookup table indexed by cell index.
4. Combine as today: `final = beauty + scale * sample(screen, emitterUv) * whitelight`. The Reinhard tonemap, color adjustments, edge cutoff, etc. all stay.

`cell_centroid[K]` is a function of the cell index. Cells from `bmesh.ops.subdivide_edges(use_grid_fill=True)` come back in **row-major** order on a regular quad — verify empirically with `CELLS_PER_SIDE=3`. If the order is not row-major, fix the index→(col,row) function in the shader, not the Blender side. The mapping (assuming row-major) is:

```glsl
int col = K % N;
int row = K / N;
vec2 centroid = vec2((float(col) + 0.5) / float(N), (float(row) + 0.5) / float(N));
```

Hard-code `N` as a `const int` in the shader for the prototype. Don't make it a uniform.

### The "blur" the user wants configurable

The existing shader has `const int BLUR_RADIUS = 1;` inside `main()`. It denoises the `position / whitelight` ratio by box-averaging numerator and denominator separately. **In the cellular path we use it differently:** box-average the per-cell brightnesses before `argmax`, so cell-boundary flicker (where two cells are nearly equally bright) is smoothed in screen space. Same name, similar physical meaning ("how aggressively to blur the lookup coordinate input"), repurposed reduction.

Make it a uniform `int u_lookupBlurRadius`. Wire it through:

- `src/debug/debugSettings.ts`: new field `lookupBlurRadius: number` (int, default `1`).
- `src/debug/DebugMenu.tsx`: integer-stepped slider, range `0..5`.
- `src/composite/Compositor.tsx`: prop, ref-mirror, `gl.uniform1i`.
- `src/composite/shader.ts`: uniform, used in the per-cell brightness loop.

The user's mental model: "if cells already make the image clearer, I should need less blur to see a sharp result. I want to test that hypothesis with a slider."

## File-by-file changes (in order)

### 1. `src/config.ts` (1 line)

Add `export const cellsPerSide = 3;` alongside `frameCount`/`fps`. That's it.

### 2. `blender/generate_screen_cells.py` (no change)

Already correct. The user has been iterating it.

### 3. `scripts/buildAssets.ts`

Replace the still-PNG atlas pipeline with a cell-aware version. Keep the video atlas pipeline **unchanged** — it still reads `beauty/`, `whitelight/`, `position/` directories and produces `atlas.mp4` exactly as today. Only the still atlas (`atlas.png`) changes.

For the still atlas:

- Look for `screen_0/screen_0_0001.exr` … `screen_{N²-1}/screen_{N²-1}_0001.exr` in `BLENDER_RENDERS_DIR`. Or one folder for all of them — match what the Blender File Output node actually writes (`<directory>/<file_name>####.exr`, single flat directory). Probe both shapes and pick whichever the file system has.
- Build a horizontal hstack of `[beauty | whitelight | screen_0 | screen_1 | … | screen_{N²-1}]` → `(2 + N²)` tiles. Same `colorchannelmixer=rr=1/E:gg=1/E:bb=1/E` applied to whitelight AND each cell tile. Beauty stays untouched.
- Same `zscale=tin=linear:t=iec61966-2-1:m=709,format=rgb24` tail.
- Same `atlasMeta.json` write — `scale` and `encoding`. Bump `atlasEncoding` to `cellular-srgb-v1` to invalidate any cached atlas from before.

`detectAtlasScale` continues to read from `whitelight-0001.exr`. If cell tiles overshoot `1.0` after `1/E` scaling, raise the warning and clamp via filter — but the same UV-with-stretch-to-fit values that whitelight sees should fit in `[0, E]` for the cells too, so this should be a no-op in practice.

If the cell EXRs are missing but `position/position-0001.exr` exists, fall back to the **old** still-atlas path (3 tiles) for backwards compat during transition. Print a clear log line. Don't make this branchy — one `if` and one `else`.

### 4. `src/composite/shader.ts`

`fragmentShaderSource` rewrite. Keep `vertexShaderSource`, `downsampleFragmentShaderSource`, `upsampleFragmentShaderSource` unchanged.

Sketch:

```glsl
const int N = 3;                    // cells per side — match src/config.ts cellsPerSide
const int CELL_COUNT = N * N;
const float TILE_WIDTH = 1.0 / float(2 + CELL_COUNT);

uniform sampler2D u_atlas;
uniform sampler2D u_screen;
uniform float u_scale;
uniform vec2 u_uvStretch;
uniform vec2 u_uvOffset;
uniform float u_edgeCutoff;
uniform float u_screenSaturation;
uniform float u_screenContrast;
uniform float u_screenBrightness;
uniform int u_lookupBlurRadius;

vec2 tileUv(int tileIndex, vec2 v_uv) {
  return vec2(v_uv.x * TILE_WIDTH + float(tileIndex) * TILE_WIDTH, v_uv.y);
}

float cellBrightnessAt(int K, vec2 v_uv, vec2 atlasTexelSize) {
  float total = 0.0;
  int radius = u_lookupBlurRadius;
  for (int dy = -5; dy <= 5; dy++) {
    if (dy < -radius || dy > radius) continue;
    for (int dx = -5; dx <= 5; dx++) {
      if (dx < -radius || dx > radius) continue;
      vec2 offset = vec2(float(dx), float(dy)) * atlasTexelSize;
      vec3 sample = srgbToLinear(texture(u_atlas, tileUv(2 + K, v_uv) + offset).rgb);
      total += length(sample.rg);
    }
  }
  return total;  // counts cancel inside argmax
}

void main() {
  vec3 beauty     = srgbToLinear(texture(u_atlas, tileUv(0, v_uv)).rgb);
  vec3 whitelight = srgbToLinear(texture(u_atlas, tileUv(1, v_uv)).rgb);
  vec2 atlasTexelSize = 1.0 / vec2(textureSize(u_atlas, 0));

  int dominant = 0;
  float bestBrightness = -1.0;
  for (int K = 0; K < CELL_COUNT; K++) {
    float b = cellBrightnessAt(K, v_uv, atlasTexelSize);
    if (b > bestBrightness) {
      bestBrightness = b;
      dominant = K;
    }
  }

  int col = dominant - (dominant / N) * N;     // dominant % N
  int row = dominant / N;
  vec2 emitterUv = vec2((float(col) + 0.5) / float(N),
                        (float(row) + 0.5) / float(N));

  // u_uvStretch / u_uvOffset / u_edgeCutoff / saturation / contrast /
  // brightness / Reinhard / linearToSrgb — copy from the existing shader,
  // unchanged.
}
```

WebGL2 GLSL ES 3.00 quirks worth flagging:

- Loop bounds need to be compile-time constants for older drivers. The `if (dy < -radius || dy > radius) continue;` pattern with a fixed outer bound (`-5..5`) lets you have a runtime-variable effective radius without an unbounded loop. Cap at 5 for now.
- `length(vec2)` is fine in GLSL ES 3.00.
- The `dominant % N` integer modulo can fail on some mobile drivers — use `dominant - (dominant / N) * N` instead, as shown.

Adjust the comment block at the top of the file to describe the cellular layout and argmax algorithm. Drop references to `position / whitelight`. Keep references to scale/E.

### 5. `src/debug/debugSettings.ts`

- Rename field `useLosslessImage` → `useCellularImage`.
- Default `useCellularImage: true` (was `false` for `useLosslessImage`).
- Add field `lookupBlurRadius: number` (int).
- Default `lookupBlurRadius: 1` (matches the old hardcoded const).

### 6. `src/debug/DebugMenu.tsx`

- Update the existing "Lossless image (frame 1)" label to "Cellular image" and bind to `useCellularImage`.
- Add a new slider row, integer-stepped, range `0..5`, label `Lookup blur (radius {n})`, bound to `lookupBlurRadius`.
- Place it near "Screen blur" — they're conceptually adjacent ("how aggressively to filter sampling positions").

### 7. `src/composite/Compositor.tsx`

- Rename prop `useLosslessImage` → `useCellularImage`. The existing PNG-vs-MP4 source-swap logic gates on this. No semantic change for the runtime — the PNG it loads is just shaped differently now (the shader handles the new layout).
- Add `lookupBlurRadius: number` prop, ref-mirror it, and `gl.uniform1i(u_lookupBlurRadiusLocation, lookupBlurRadiusRef.current)` inside `renderFrame`.
- Get the new uniform location next to the existing ones.

### 8. `src/App.tsx`

- Pass `useCellularImage={debugSettings.useCellularImage}` and `lookupBlurRadius={debugSettings.lookupBlurRadius}` into `<Compositor>`.

### 9. `COMPOSITE_THEORY.md`

Append (don't rewrite) a short section: "Cellular image mode (in-progress)." Describe the algorithm in 6–10 lines. Note that it lives only in the lossless-image debug branch for now and the video atlas remains 3-pass.

## Acceptance

- `./format.sh` and `./test.sh` pass.
- With `BLENDER_RENDERS_DIR` set to a tree containing `screen_0/`…`screen_8/` for `CELLS_PER_SIDE=3`, plus `beauty/` and `whitelight/`, `pnpm run build:assets` (or however the user runs it) produces an `atlas.png` of width `(2 + 9) × renderWidth` and a fresh `atlasMeta.json`.
- Loading the dev site with the menu open: "Cellular image" is checked by default, the rendered scene shows bounce light, and unchecking the box falls back to the MP4 video path (untouched, still 3-pass).
- Dragging the "Lookup blur" slider visibly changes how chunky the cell-boundary transitions look on the wall bounce. At `0` you should see hard cell-boundary seams; at `3..5` they smooth out.
- The user can move the screen-content square around inside the screen plane and see the bounce hot spot move in 9 discrete positions on the wall (one per cell). That's the prototype working as designed; sub-cell precision is the next iteration.

## Don't

- Don't add a build step that converts cell EXRs to PNGs separately — keep ffmpeg as the single tool, single invocation.
- Don't add a dropdown for `cellsPerSide` in the debug menu. It's a config-time constant for now.
- Don't try to support arbitrary N at runtime. The shader has `const int N = 3` baked in. Bumping N is a code change, not a runtime change.
- Don't keep the old `useLosslessImage` field name "for compatibility." Rename it. There's no production data to migrate.
- Don't denoise the cell AOVs in the build pipeline. Cycles handles that via the Denoise node already in `generate_screen_cells.py`.
- Don't introduce a `cellBrightnessFunction` strategy parameter. Pick `length(rgb.rg)` and write it inline.

## Why argmax (not weighted blend)

The user explicitly chose argmax for this prototype. It's discrete, easy to reason about, and the per-cell color step is dramatic enough that it survives the lossless image path cleanly. Weighted blend across cells is the natural follow-up if the discrete jumps look bad — but ship argmax first, see it working, then iterate.
