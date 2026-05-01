# Composite theory

The trick: a 3D scene rendered in Blender Cycles has a "screen" object
whose content is alive at runtime. The user can paint anything onto it
in a 2D canvas — a draggable square, an HTML render, an image — and the
scene's bounce light responds positionally, as if the screen had really
emitted that content. No re-rendering. A single fragment shader samples
two pre-baked textures and composites the result.

## Two textures

The runtime input is exactly two files:

- `public/composite/beauty.png` — 8-bit sRGB, the scene rendered with
  the screen emitter off; the additive base of the composite.
- `public/composite/position.exr` — RGBA half-float (uncompressed
  scanline EXR). For each output pixel: `R = emitter U`,
  `G = emitter V`, `B = whitelight` (linear scene-referred bounce
  intensity), `A = 1`.

That is the entire data dependency. There is no JSON sidecar, no atlas,
no per-cell uniform.

## Runtime composite

For each output pixel the shader does

```
final = beauty + sample(userScreen, emitterUv) * whitelight
```

with `emitterUv` and `whitelight` read directly from `position.exr`.
`whitelight` is scene-referred (no `1/E` pre-scale), so the bounce
contribution comes out correct without a runtime scale multiplier.
Implemented in `src/composite/shader.ts`.

## Build-time math

Cycles renders one EXR per "cell" of the screen plane. The screen is
subdivided into an `N × N` grid; each cell is a separate object with
its own light group; the shared material emits

```
(within_U, within_V, 1) × E
```

where `(within_U, within_V)` is the local UV inside the cell (the
cell's UV unwrap is stretched to fill `[0,1]²`) and `E` is the emission
strength.

Because of that material, each cell's light-group AOV at a wall pixel
encodes:

- `cell_K.b   = intensity_K` — the bounce light cell K contributes
  at that pixel.
- `cell_K.rg  = intensity_K × (within_U, within_V)` — the same
  intensity, weighted by the local UV.

Decompose the global screen-plane U coordinate as
`U_global = (col_K + within_U) / N` and integrate against the wall
pixel's geometric weighting:

```
<U_global> = (Σ_K col_K · cell_K.b  +  Σ_K cell_K.r) / (N · Σ_K cell_K.b)
```

(and likewise for V using `row_K` and `cell_K.g`). The denominator
`Σ_K cell_K.b` is the reconstructed whitelight — the total bounce light
from the screen at that pixel, by construction.

The Rust bake binary (`scripts/bake-textures/`) computes this once per
pixel across all `N²` cells, applies a Gaussian blur of
`POSITION_BLUR_SIGMA_PX`, and writes the result into `position.exr` as
half-float. The blur smooths cell-boundary artifacts before quantization
to 16-bit; tuning it trades reflection sharpness for stability.

`bmesh.ops.subdivide_edges(use_grid_fill=True)` does **not** emit faces
in row-major order, so cell index `K` does not map to `(K % N, K / N)`
in screen-plane coordinates. The Blender script writes
`cells_manifest.json` mapping face index → `(col, row)`; the bake binary
consumes it to weight `(col_K, row_K) · cell_K.b` correctly.

## Color management

- Cell + beauty EXRs are linear/raw (Cycles default).
- The bake reads cells as linear floats, accumulates in linear, and
  writes `position.exr` linearly — no transfer curve applied. The
  shader samples it directly.
- The bake applies the sRGB OETF to `beauty` before quantizing to 8-bit
  PNG. The shader linearizes that PNG with explicit `srgbToLinear`
  before compositing. WebGL upload uses
  `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE` so the browser does no
  transfer conversion — the shader's `srgbToLinear` is the only EOTF
  in play.
- `UNPACK_FLIP_Y_WEBGL = true`. The PNG path uploads via
  HTMLImageElement and gets flipped (top of PNG → texture v = 1). The
  EXR path uploads via ArrayBufferView (which is unaffected by
  FLIP_Y), so the JS decoder pre-flips during scanline assembly to
  achieve the same orientation.
- All composite math runs in linear; `linearToSrgb` is applied to
  `fragColor` before write.

## Asset pipeline

1. **Blender** — `blender/generate_screen_cells.py` subdivides `SCREEN`
   into N² cell objects, gives each a Cycles light group, wires
   per-cell Denoise + File Output nodes, and writes
   `cells_manifest.json`. The script reads `CELLS_PER_SIDE` from
   `.env` (falling back to a hardcoded default if it can't locate the
   repo root from Blender's text data block). Renders produce
   `beauty-####.exr` and `cells/screen_K_####.exr` sequences.
2. **Bake** — `scripts/bake-textures/` (Rust) reads the cell EXRs and
   `cells_manifest.json`, computes per-pixel emitter UV and
   whitelight, applies the Gaussian blur, and writes
   `public/composite/{beauty.png, position.exr}`.
3. **Runtime** — `src/composite/Compositor.tsx` uploads `beauty.png`
   via an `<img>` element and fetches `position.exr` as an
   `ArrayBuffer`, decoding it with `decodeExr.ts` into a
   `Uint16Array` of half-float bits and uploading as `RGBA16F`. It
   re-uploads the user's 2D canvas as `u_screen` every animation
   frame and draws a fullscreen quad. The fragment shader runs the
   two-texture composite above per pixel.

## Where in the code

| Concern              | File                                         |
| -------------------- | -------------------------------------------- |
| Per-fragment math    | `src/composite/shader.ts`                    |
| WebGL host           | `src/composite/Compositor.tsx`               |
| EXR decoder          | `src/composite/decodeExr.ts`                 |
| Asset bake           | `scripts/bake-textures/src/main.rs`          |
| Blender scene script | `blender/generate_screen_cells.py`           |
| Shared constants     | `src/config.ts`                              |
| Baked outputs        | `public/composite/{beauty.png,position.exr}` |
