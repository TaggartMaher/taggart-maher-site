# Taggart Maher's developer site

A production grade portfolio site for displaying information about myself
in a professional context.

## What this site is doing

The screen of a 3D-rendered Blender Cycles scene is alive at runtime.
The user can drop arbitrary content onto it — a draggable square, an
HTML canvas, an image — and the surrounding scene's bounce light
responds positionally, as if the screen had really emitted that content.
There is no re-rendering: a single fragment shader recovers the
per-pixel emitter UV from a small set of pre-rendered Cycles light-group
AOVs and composites the result.

For the math, the asset pipeline, and the file-by-file map, read
**COMPOSITE_THEORY.md**. Any future agent touching the compositor, the
shader, the build script, or the Blender script should read it before
making changes.

## Blender setup

The .blend (not in this repo, rendered separately by the human) is
expected to contain:

- `SCREEN` — source quad whose mesh is subdivided into N×N cells.
- `SCREEN_POSITION` — supplies the cell material via its material
  slot 0. The material emits `(within_U, within_V, 1) × E` so each
  cell's light-group AOV records the cell's bounce intensity in B and
  intensity × within-cell (U, V) in R/G.
- `ScenePosition` — collection that cell objects are linked into.
- `Position` — Cycles view layer with one light group per cell, with
  Denoising Data enabled (Normal/Albedo guidance for per-cell
  denoising).
- A separate render setup that produces `beauty/beauty-####.exr` — the
  scene rendered with the screen emitter off (the additive base of the
  composite).
- Render engine: Cycles (light groups require Cycles, not EEVEE).

`blender/generate_screen_cells.py` mutates the .blend to subdivide
`SCREEN`, create the cell objects + light groups, wire compositor File
Output nodes (one per cell), and write `cells_manifest.json` mapping
face index → (col, row). The manifest is required because
`bmesh.ops.subdivide_edges(use_grid_fill=True)` does not emit faces in
row-major order; without it, the runtime would see scrambled cell
positions.

`cellsPerSide` is duplicated between the script and `src/config.ts`;
keeping them in sync is the human's responsibility.

## Coding style

Do not abbreviate variable names ever. for example, use "index" instead
of "i". Readability is most important.

Do not add abstractions without telling the user, do not add
optimizations or abstractions that are not specifically requested. You
may suggest optimizations, but do not implement them yourself without
considering the user's thoughts.

## Workflow

After any code change, run `./format.sh` and `./test.sh` from the repo
root. Both must pass before a change is considered done.

Tests should be added intentionally as features develop — not as an
afterthought, not blanket coverage. Every change must leave all lints
and tests passing.

### Software Versions

- Blender 5.1.0
