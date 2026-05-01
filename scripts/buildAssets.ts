// Build the cellular still atlas from the Blender renders.
//
// A single ffmpeg invocation reads the beauty and per-cell EXRs
// directly as float, pre-scales the cells by 1/E (the screen emission
// strength), packs the (1 + N²) tiles into a tileCols × tileRows grid,
// applies the sRGB OETF (via zscale), and encodes to public/composite/
// atlas.png as 8-bit rgb24. The OETF gives dark values much more bit
// budget than linear 8-bit (linear byte 1 = 0.004 linear; sRGB byte 1 =
// 0.0003 linear). The shader undoes the OETF explicitly with
// `srgbToLinear`.
//
// Going EXR -> ffmpeg directly (no intermediate PNG) avoids a redundant
// 8-bit quantization before the encoder.
//
// Idempotent: rebuilds only when any input EXR is newer than atlas.png
// or when the encoding tag changes.
//
// If BLENDER_RENDERS_DIR is unset or any required input is missing, the
// script logs a warning and exits 0 — the site falls back to no-CGI at
// runtime.
//
// Tooling: requires ffmpeg built with libzimg (the `zscale` filter) for
// the linear → sRGB OETF + BT.709 matrix conversion, and oiiotool for
// per-cell channel flattening and emission-strength detection.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cellsPerSide, tileCols, tileRows } from "../src/config";

// Load BLENDER_RENDERS_DIR (and friends) from the repo's .env so the script
// works the same whether invoked directly or via an npm script. Silent if
// .env is absent — the BLENDER_RENDERS_DIR check below handles that case.
try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch {
  /* .env not present — fall through to env-var check */
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const compositeDir = join(repoRoot, "public", "composite");
const atlasImagePath = join(compositeDir, "atlas.png");
const atlasMetaPath = join(compositeDir, "atlasMeta.json");

// `scale` is the screen emission strength E, recovered from the cell
// EXRs as max-over-pixels of Σ_K cell_K. Each cell's material emits
// (within_U, within_V, 1) × intensity, so the B-channel of the sum is
// the total bounce light at the wall — i.e. whitelight. Cells are
// divided by E before quantization so they fit in [0,1]; the shader
// multiplies the bounce contribution back by E so the emitter UV math
// keeps its full dynamic range.
//
// `encoding` records the transfer characteristic applied before 8-bit
// quantization. We use sRGB OETF so dim bounce-light values survive
// 8-bit quantization. Bumping `encoding` invalidates the atlas.
interface AtlasMeta {
  scale: number;
  encoding: string;
  // Per cell-index entry [col, row] in the screen-plane subdivision,
  // derived from blender/generate_screen_cells.py's manifest. Lets the
  // shader weight cell-K contributions by their actual position without
  // hardcoding bmesh's subdivide+grid_fill order.
  cellGrid: Array<[number, number]>;
}

interface CellsManifest {
  cellsPerSide: number;
  cells: Array<{ index: number; col: number; row: number }>;
}

function readCellsManifest(cellsDirectory: string): CellsManifest | null {
  const manifestPath = join(cellsDirectory, "cells_manifest.json");
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as CellsManifest;
  } catch {
    return null;
  }
}

function buildCellGrid(
  manifest: CellsManifest | null,
  expectedCells: number,
): Array<[number, number]> {
  const grid: Array<[number, number]> = [];
  if (manifest && manifest.cells.length === expectedCells) {
    const sorted = [...manifest.cells].sort((a, b) => a.index - b.index);
    for (const cell of sorted) grid.push([cell.col, cell.row]);
    return grid;
  }
  console.warn(
    "[assets] cells_manifest.json missing or incomplete — falling back to identity cell order. Re-run blender/generate_screen_cells.py to fix.",
  );
  const cellsPerSideLocal = Math.round(Math.sqrt(expectedCells));
  for (let cellIndex = 0; cellIndex < expectedCells; cellIndex += 1) {
    grid.push([cellIndex % cellsPerSideLocal, Math.floor(cellIndex / cellsPerSideLocal)]);
  }
  return grid;
}

const atlasEncoding = "cellular-srgb-v4";

function detectTileDimensions(samplePath: string): { width: number; height: number } {
  const result = spawnSync("oiiotool", ["--info", samplePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`[assets] oiiotool --info failed for ${samplePath}:\n${result.stderr}`);
  }
  const match = result.stdout.match(/:\s*(\d+)\s*x\s*(\d+),\s*\d+\s*channel/);
  if (!match) {
    throw new Error(`[assets] could not parse dimensions from oiiotool --info for ${samplePath}`);
  }
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

// Sum all flattened cell EXRs and return the max channel of the sum.
// By construction Σ_K cell_K.b = whitelight per pixel, so max over
// pixels recovers the screen emission strength E.
function detectAtlasScaleFromFlatCells(flatCellPaths: string[]): number {
  if (flatCellPaths.length === 0) {
    throw new Error("[assets] cannot detect scale from empty cell list");
  }
  const args: string[] = [flatCellPaths[0]];
  for (let cellIndex = 1; cellIndex < flatCellPaths.length; cellIndex += 1) {
    args.push(flatCellPaths[cellIndex], "--add");
  }
  args.push("--stats");
  const result = spawnSync("oiiotool", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`[assets] oiiotool sum --stats failed:\n${result.stderr}`);
  }
  const maxLine = result.stdout.match(/Stats Max:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!maxLine) {
    throw new Error("[assets] could not parse cell-sum Stats Max output");
  }
  const channelMax = Math.max(
    parseFloat(maxLine[1]),
    parseFloat(maxLine[2]),
    parseFloat(maxLine[3]),
  );
  if (!Number.isFinite(channelMax) || channelMax <= 0) {
    throw new Error(`[assets] invalid cell-sum max: ${channelMax}`);
  }
  return channelMax;
}

function readAtlasMeta(): AtlasMeta | null {
  if (!existsSync(atlasMetaPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(atlasMetaPath, "utf8")) as Partial<AtlasMeta>;
    if (
      typeof parsed.scale === "number" &&
      typeof parsed.encoding === "string" &&
      Array.isArray(parsed.cellGrid)
    ) {
      return {
        scale: parsed.scale,
        encoding: parsed.encoding,
        cellGrid: parsed.cellGrid as Array<[number, number]>,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function writeAtlasMeta(meta: AtlasMeta): void {
  writeFileSync(atlasMetaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

const blenderRendersDir = process.env.BLENDER_RENDERS_DIR;

console.log(`[assets] build starting`);

if (!blenderRendersDir) {
  console.warn(
    "[assets] BLENDER_RENDERS_DIR is not set — skipping atlas build. Site will run in fallback mode.",
  );
  process.exit(0);
}

function paddedFrameNumber(frameIndex: number): string {
  return String(frameIndex).padStart(4, "0");
}

function fileMtime(path: string): number {
  return statSync(path).mtimeMs;
}

const beautyFrameOnePath = join(blenderRendersDir, "beauty", `beauty-${paddedFrameNumber(1)}.exr`);
const beautyPresent = existsSync(beautyFrameOnePath);
let newestInputMtime = 0;
if (beautyPresent) newestInputMtime = Math.max(newestInputMtime, fileMtime(beautyFrameOnePath));

// Cell EXRs live in `$BLENDER_RENDERS_DIR/cells/`, padded form
// `screen_K_0001.exr` (correct Blender output, what the File Output
// node writes once denoising data is enabled) — fall back to the
// unpadded form if a transition file is on disk.
const cellsDir = join(blenderRendersDir, "cells");
const cellCount = cellsPerSide * cellsPerSide;
const cellFrameOnePaths: string[] = [];
for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
  const paddedPath = join(cellsDir, `screen_${cellIndex}_0001.exr`);
  const unpaddedPath = join(cellsDir, `screen_${cellIndex}_.exr`);
  let resolvedPath: string | null = null;
  if (existsSync(paddedPath)) resolvedPath = paddedPath;
  else if (existsSync(unpaddedPath)) resolvedPath = unpaddedPath;
  if (!resolvedPath) {
    console.warn(`[assets] missing cell ${cellIndex} EXR in ${cellsDir}`);
    break;
  }
  cellFrameOnePaths.push(resolvedPath);
  newestInputMtime = Math.max(newestInputMtime, fileMtime(resolvedPath));
}

const inputsComplete = beautyPresent && cellFrameOnePaths.length === cellCount;
if (!inputsComplete) {
  console.warn(
    "[assets] frame 1 inputs incomplete (need beauty + N² cell EXRs) — skipping atlas build. Site will run in fallback mode.",
  );
  process.exit(0);
}

mkdirSync(compositeDir, { recursive: true });

const previousMeta = readAtlasMeta();
const encodingMatches = previousMeta?.encoding === atlasEncoding;
const atlasFresh = existsSync(atlasImagePath) && fileMtime(atlasImagePath) >= newestInputMtime;
const stillNeedsEncode = !atlasFresh || !encodingMatches;

let atlasScale: number;

if (stillNeedsEncode) {
  // Blender's File Output node in OPEN_EXR_MULTILAYER mode names the
  // cell's channels `screen_K.R/G/B/A`, but ffmpeg's openexr decoder
  // only reads root-level R/G/B/A. Use oiiotool to rename each cell's
  // channels to root-level into a temporary single-layer EXR before
  // feeding the ffmpeg xstack invocation. The flat EXRs also feed the
  // emission-strength detection step below.
  const flattenedCellsDir = join(compositeDir, ".cell-flat");
  mkdirSync(flattenedCellsDir, { recursive: true });
  const flattenedCellPaths: string[] = [];
  console.log(`[assets] flattening ${cellCount} multilayer cell EXRs via oiiotool...`);
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const sourcePath = cellFrameOnePaths[cellIndex];
    const flatPath = join(flattenedCellsDir, `cell_${cellIndex}.exr`);
    const flatten = spawnSync(
      "oiiotool",
      [
        sourcePath,
        "--ch",
        `R=screen_${cellIndex}.R,G=screen_${cellIndex}.G,B=screen_${cellIndex}.B`,
        "-o",
        flatPath,
      ],
      { encoding: "utf8" },
    );
    if (flatten.status !== 0) {
      console.error(`[assets] oiiotool flatten failed for ${sourcePath}:\n${flatten.stderr}`);
      process.exit(flatten.status ?? 1);
    }
    flattenedCellPaths.push(flatPath);
  }

  atlasScale = detectAtlasScaleFromFlatCells(flattenedCellPaths);
  const inverseScale = 1 / atlasScale;
  console.log(`[assets] scale = ${atlasScale.toFixed(6)}, encoding = ${atlasEncoding}`);

  // Pack the (1 + N²) logical tiles into a tileCols × tileRows grid
  // derived from cellsPerSide (see src/config.ts). Inputs are passed
  // in order beauty/s_0..s_{N²-1}; xstack with an explicit `layout`
  // fills row-major from the PNG top, which after the
  // UNPACK_FLIP_Y_WEBGL upload puts beauty at v_uv.y near 1 — the
  // shader's tileUv inverts the row direction to compensate.
  const tileCount = 1 + cellCount;
  const tileDims = detectTileDimensions(beautyFrameOnePath);
  const layoutPositions: string[] = [];
  for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
    const col = tileIndex % tileCols;
    const rowFromTop = Math.floor(tileIndex / tileCols);
    layoutPositions.push(`${col * tileDims.width}_${rowFromTop * tileDims.height}`);
  }
  const tileLayout = layoutPositions.join("|");

  console.log(
    `[assets] encoding cellular still atlas (PNG rgb24, ${tileCount} tiles in ${tileCols}×${tileRows} grid)...`,
  );
  const channelScale = `colorchannelmixer=rr=${inverseScale}:gg=${inverseScale}:bb=${inverseScale}`;
  const inputArgs: string[] = ["-i", beautyFrameOnePath];
  const filterParts: string[] = [`[0:v]format=gbrpf32le[beauty]`];
  const labels: string[] = [`[beauty]`];
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    inputArgs.push("-i", flattenedCellPaths[cellIndex]);
    const labelName = `screen_${cellIndex}`;
    const inputIndex = 1 + cellIndex;
    filterParts.push(`[${inputIndex}:v]format=gbrpf32le,${channelScale}[${labelName}]`);
    labels.push(`[${labelName}]`);
  }
  filterParts.push(
    `${labels.join("")}xstack=inputs=${tileCount}:layout=${tileLayout}:fill=black,zscale=tin=linear:t=iec61966-2-1:m=709,format=rgb24[out]`,
  );
  const stillFilterGraph = filterParts.join(";");

  const stillResult = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      ...inputArgs,
      "-filter_complex",
      stillFilterGraph,
      "-map",
      "[out]",
      "-frames:v",
      "1",
      atlasImagePath,
    ],
    { stdio: "inherit" },
  );
  if (stillResult.status !== 0) {
    console.error("[assets] ffmpeg cellular still-atlas encode failed");
    process.exit(stillResult.status ?? 1);
  }
  console.log(`[assets] encoded cellular still atlas -> ${atlasImagePath}`);
} else {
  atlasScale = previousMeta!.scale;
  console.log(`[assets] atlas up to date at ${atlasImagePath} (scale = ${atlasScale.toFixed(6)})`);
}

// Metadata sidecar: the runtime fetches this and feeds the scale into
// the shader so the bounce term is multiplied back to the pre-scaled
// scene-referred magnitude.
const cellsManifest = readCellsManifest(cellsDir);
const cellGrid = buildCellGrid(cellsManifest, cellCount);
writeAtlasMeta({ scale: atlasScale, encoding: atlasEncoding, cellGrid });
