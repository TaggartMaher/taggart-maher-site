// Build the cellular still atlas from the Blender renders.
//
// One ffmpeg invocation reads the beauty + per-cell EXRs as float,
// pre-scales each cell by 1/E (the screen emission strength), packs
// the (1 + N²) tiles into a tileCols × tileRows grid, applies the sRGB
// OETF, and encodes to public/composite/atlas.png as 8-bit rgb24. See
// COMPOSITE_THEORY.md for the math and the role of each step.
//
// Idempotent: rebuilds only when any input EXR is newer than atlas.png
// or when the encoding tag changes.
//
// If BLENDER_RENDERS_DIR is unset or any input is missing, the script
// warns and exits 0 — the site falls back to no-CGI at runtime.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cellsPerSide, tileCols, tileRows } from "../src/config";

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch {
  /* .env not present — fall through to env-var check */
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const compositeDir = join(repoRoot, "public", "composite");
const atlasImagePath = join(compositeDir, "atlas.png");
const atlasMetaPath = join(compositeDir, "atlasMeta.json");

// `scale` is the screen emission strength E, divided out of the cell
// tiles in the build and multiplied back in by the shader.
// `encoding` is the transfer-characteristic tag; bumping it invalidates
// the atlas. `cellGrid` is the per-cell (col, row) lookup the shader
// uses to weight Σ_K col_K · cell_K.b correctly.
interface AtlasMeta {
  scale: number;
  encoding: string;
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
    "[assets] cells_manifest.json missing or incomplete — falling back to identity cell order.",
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

// E = max-over-pixels of Σ_K cell_K (B-channel of the sum is whitelight
// by construction; max ≤ E for R and G). Two-step: write the sum to a
// temp EXR, then stat that file the same way the old whitelight
// detector did.
function detectAtlasScaleFromFlatCells(flatCellPaths: string[], sumPath: string): number {
  if (flatCellPaths.length === 0) {
    throw new Error("[assets] cannot detect scale from empty cell list");
  }
  const sumArgs: string[] = [flatCellPaths[0]];
  for (let cellIndex = 1; cellIndex < flatCellPaths.length; cellIndex += 1) {
    sumArgs.push(flatCellPaths[cellIndex], "--add");
  }
  sumArgs.push("-o", sumPath);
  const sumResult = spawnSync("oiiotool", sumArgs, { encoding: "utf8" });
  if (sumResult.status !== 0) {
    throw new Error(`[assets] oiiotool sum failed:\n${sumResult.stderr}`);
  }
  const statsResult = spawnSync("oiiotool", ["--stats", sumPath], { encoding: "utf8" });
  if (statsResult.status !== 0) {
    throw new Error(`[assets] oiiotool --stats on cell sum failed:\n${statsResult.stderr}`);
  }
  // Tokens cover plain decimals, scientific notation, and signed values.
  const maxLine = statsResult.stdout.match(/Stats Max:\s+(\S+)\s+(\S+)\s+(\S+)/);
  if (!maxLine) {
    throw new Error(
      `[assets] could not parse cell-sum Stats Max output. oiiotool stdout was:\n${statsResult.stdout}`,
    );
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

// Cell EXRs live in `$BLENDER_RENDERS_DIR/cells/` as
// `screen_K_0001.exr` (or unpadded `screen_K_.exr` from older runs).
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
  // Blender writes cell channels as `screen_K.R/G/B/A` in a multilayer
  // EXR; ffmpeg's openexr decoder only reads root-level R/G/B/A, so
  // oiiotool renames them to a flat single-layer EXR per cell. The
  // flat EXRs also feed the emission-strength detection below.
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

  atlasScale = detectAtlasScaleFromFlatCells(
    flattenedCellPaths,
    join(flattenedCellsDir, "_sum.exr"),
  );
  const inverseScale = 1 / atlasScale;
  console.log(`[assets] scale = ${atlasScale.toFixed(6)}, encoding = ${atlasEncoding}`);

  // Pack the (1 + N²) tiles into a tileCols × tileRows grid in order
  // beauty / s_0 .. s_{N²-1}. xstack fills row-major from the PNG top;
  // the shader's tileUv inverts the row direction to compensate for
  // UNPACK_FLIP_Y_WEBGL.
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

const cellsManifest = readCellsManifest(cellsDir);
const cellGrid = buildCellGrid(cellsManifest, cellCount);
writeAtlasMeta({ scale: atlasScale, encoding: atlasEncoding, cellGrid });
