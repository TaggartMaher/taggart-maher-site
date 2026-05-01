# Composite theory

The trick: a 3D scene rendered in Blender Cycles has a "screen" object
whose content is alive at runtime. The user can paint anything onto it
in a 2D canvas — a draggable square, an HTML render, an image — and the
scene's bounce light responds positionally, as if the screen had really
emitted that content. No re-rendering. A single fragment shader recovers
the emitter UV per pixel from a handful of pre-rendered Cycles
light-group AOVs and composites the result.

## The math

The screen plane is subdivided into an `N × N` grid of cells. Each cell
is a separate object with its own Cycles light group; the shared
material emits

```
(within_U, within_V, 1) × E
```

where `(within_U, within_V)` is the local UV inside the cell (the cell's
UV unwrap is stretched to fill `[0,1]²`) and `E` is the emission
strength.

Because of that material, each cell's light-group AOV at a wall pixel
encodes:

- `cell_K.b   = intensity_K` — the bounce light cell K
  contributes at that pixel.
- `cell_K.rg  = intensity_K × (within_U, within_V)` — the same intensity,
  weighted by the local UV.

Decompose the global screen-plane U coordinate as
`U_global = (col_K + within_U) / N`, integrate against the wall pixel's
geometric weighting g(s):

```
<U_global> = (Σ_K col_K · cell_K.b  +  Σ_K cell_K.r) / (N · Σ_K cell_K.b)
```

(and likewise for V using `row_K` and `cell_K.g`). The denominator
`Σ_K cell_K.b` is the reconstructed whitelight at the pixel — total
bounce light from the screen, by construction.

The composite is then

```
final = beauty + scale · sample(userScreen, emitterUv) · whitelight
```

where `beauty` is the scene rendered with the screen emitter off and
`scale = E` recovers the emission strength the build divided out for
8-bit fitting (see "Pre-scale invariance" below).

This is implemented in `src/composite/shader.ts` (fragment shader,
`main()`).

## Pre-scale invariance

`E` typically exceeds 1.0. Cell EXR values up to `E` won't fit in an
8-bit atlas, so the build divides every cell tile by `E` before
quantization. The emitter UV is a ratio of cell-derived sums in both
numerator and denominator, so the `1/E` factor cancels — the recovered
UV is exact regardless of the pre-scale. The shader's `u_scale = E`
(read from `atlasMeta.json`) multiplies the bounce contribution back to
its scene-referred magnitude in the final composite line.

## Atlas layout

The atlas is a single PNG containing `1 + N²` logical tiles:

```
[ beauty, screen_0, screen_1, … , screen_{N²-1} ]
```

packed into a `tileCols × tileRows` row-major grid. `tileCols`,
`tileRows`, and `cellsPerSide` (= `N`) are the single source of truth in
`src/config.ts` and are interpolated as `const int` into the shader at
module-evaluation time.

Cells from `bmesh.ops.subdivide_edges(use_grid_fill=True)` do **not**
come back in row-major order, so tile index `K` does not map to
`(K % N, K / N)` in screen-plane coordinates. The Blender script writes
`cells_manifest.json` mapping face index → `(col, row)`; the build
forwards it as `cellGrid` in `atlasMeta.json`; the shader uploads it as
`uniform ivec2 u_cellGrid[CELL_COUNT]` and uses
`vec2(u_cellGrid[K]) · cell_K.b` in the weighted sum.

## Color management

- Cell + beauty EXRs are linear/raw (Cycles default).
- Build applies the sRGB OETF + BT.709 matrix via ffmpeg's `zscale`
  filter before 8-bit quantization. sRGB encoding gives dark bounce
  values much more bit budget than linear 8-bit (linear byte 1 ≈ 0.004
  linear; sRGB byte 1 ≈ 0.0003 linear).
- WebGL upload uses `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE` so the
  browser does no transfer conversion. Browser behavior here is
  inconsistent across implementations; pinning it to NONE makes the
  shader's explicit `srgbToLinear` the only EOTF in play.
- `UNPACK_FLIP_Y_WEBGL = true` so the PNG's top row lands at texture
  v = 1; the shader's `tileUv` inverts the row direction so logical row
  0 maps there.
- All composite math runs in linear; `linearToSrgb` is applied to
  `fragColor` before write (the canvas drawing buffer is treated as sRGB
  by the browser).

## Asset pipeline

1. **Blender** — `blender/generate_screen_cells.py` subdivides `SCREEN`
   into N² cell objects, gives each a Cycles light group, wires
   per-cell Denoise + File Output nodes, and writes
   `cells_manifest.json`. Renders produce `beauty-####.exr` and
   `cells/screen_K_####.exr` sequences.
2. **Build** — `scripts/buildAssets.ts` flattens each multilayer cell
   EXR's `screen_K.{R,G,B}` channels to root-level (ffmpeg's openexr
   decoder doesn't read named layers), sums the flat cells via oiiotool
   to detect `E = max-over-pixels of Σ_K cell_K`, divides each cell tile
   by `E`, packs them with `beauty` into the atlas grid, applies the
   sRGB OETF, and writes `public/composite/atlas.png` plus the
   sidecar `atlasMeta.json` (`scale`, `encoding`, `cellGrid`).
3. **Runtime** — `src/composite/Compositor.tsx` uploads the atlas PNG
   once, fetches `atlasMeta.json` (sets `u_scale`, `u_cellGrid`),
   re-uploads the user's 2D canvas as `u_screen` every animation frame,
   draws a fullscreen quad. The fragment shader runs the math above per
   pixel.

## Where in the code

| Concern              | File                                          |
| -------------------- | --------------------------------------------- |
| Per-fragment math    | `src/composite/shader.ts`                     |
| WebGL host           | `src/composite/Compositor.tsx`                |
| Asset build          | `scripts/buildAssets.ts`                      |
| Blender scene script | `blender/generate_screen_cells.py`            |
| Shared constants     | `src/config.ts`                               |
| Atlas + sidecar      | `public/composite/{atlas.png,atlasMeta.json}` |
