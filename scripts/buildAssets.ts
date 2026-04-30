// Build the composite atlas video from the Blender renders.
//
// A single ffmpeg invocation reads the three EXR pass sequences (beauty,
// whitelight, position) directly as float, pre-scales whitelight + position
// by 1/E (the screen emission strength), mosaics the three passes
// horizontally, applies the sRGB OETF (via zscale), and encodes to
// public/composite/atlas.mp4 as 8-bit H.264 yuv420p. The OETF gives dark
// values much more bit budget than linear 8-bit (linear byte 1 = 0.004
// linear; sRGB byte 1 = 0.0003 linear). The shader undoes the OETF
// explicitly with `srgbToLinear` rather than relying on the browser's
// inconsistent video-texture color management.
//
// 4:2:0 yuv420p is the only chroma format that plays via `<video>` across
// Chrome, Firefox, and Safari — system decoders (Media Foundation,
// AVFoundation) reject 4:4:4 and 4:2:2 outright. VP9 profile 3 / H.264
// Hi444PP / AV1 high-profile would all preserve the position pass's R/G
// coordinates exactly, but only Chrome can decode them. The position-pass
// artifacts from chroma subsampling on the wall bounce light have been
// acceptable in practice with crf 6.
//
// Going EXR -> ffmpeg directly (no intermediate PNG) avoids a redundant
// 8-bit quantization before the encoder. libx264 gets float input and does
// its own dithered, rate-distortion-aware quantization.
//
// Idempotent: rebuilds only when any EXR is newer than atlas.mp4 or when
// the detected scale / encoding tag changes.
//
// If BLENDER_RENDERS_DIR is unset or frame 1 is missing for any pass, the
// script logs a warning and exits 0 — the site falls back to the no-CGI
// path at runtime. If frame 1 is present but the full video sequence is
// not, the still PNG atlas is built and the video is skipped (the runtime
// can still drive the lossless-image debug path). Asset build never fails
// the dev or production build.
//
// Tooling: requires ffmpeg built with libzimg (the `zscale` filter) for the
// linear → sRGB OETF + BT.709 matrix conversion, and oiiotool for the
// one-shot scale detection on the whitelight pass.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cellsPerSide, frameCount, fps } from "../src/config";

// Load BLENDER_RENDERS_DIR (and friends) from the repo's .env so the script
// works the same whether invoked directly or via an npm script. Silent if
// .env is absent — the BLENDER_RENDERS_DIR check below handles that case.
try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch {
  /* .env not present — fall through to env-var check */
}

const passes = ["beauty", "whitelight", "position"] as const;

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const compositeDir = join(repoRoot, "public", "composite");
const atlasPath = join(compositeDir, "atlas.mp4");
const atlasImagePath = join(compositeDir, "atlas.png");
const atlasMetaPath = join(compositeDir, "atlasMeta.json");

// `scale` is the screen emission strength E detected from the whitelight
// pass. whitelight + position are divided by E before quantization so they
// fit in [0,1]; the shader multiplies the bounce contribution back by E so
// `position / whitelight` (the emitter UV) keeps its full dynamic range.
//
// `encoding` records the transfer characteristic applied before 8-bit
// quantization. We use sRGB OETF so dim bounce-light values survive 8-bit
// quantization (linear 8-bit crushes anything below ~0.005 to byte 0; sRGB
// 8-bit preserves down to ~0.0003). The shader applies `srgbToLinear`
// explicitly when sampling the atlas, so the round-trip is self-contained
// and not subject to whatever transfer the browser does or doesn't apply
// on WebGL video upload. Bumping `encoding` invalidates the atlas.
interface AtlasMeta {
  scale: number;
  encoding: string;
}

const atlasEncoding = "cellular-srgb-v2";

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

function detectAtlasScale(rendersDir: string): number {
  const sampleFrame = join(rendersDir, "whitelight", "whitelight-0001.exr");
  const result = spawnSync("oiiotool", ["--stats", sampleFrame], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`[assets] oiiotool --stats failed:\n${result.stderr}`);
  }
  const maxLine = result.stdout.match(/Stats Max:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!maxLine) {
    throw new Error("[assets] could not parse whitelight Stats Max output");
  }
  const channelMax = Math.max(
    parseFloat(maxLine[1]),
    parseFloat(maxLine[2]),
    parseFloat(maxLine[3]),
  );
  if (!Number.isFinite(channelMax) || channelMax <= 0) {
    throw new Error(`[assets] invalid whitelight max: ${channelMax}`);
  }
  return channelMax;
}

function readAtlasMeta(): AtlasMeta | null {
  if (!existsSync(atlasMetaPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(atlasMetaPath, "utf8")) as Partial<AtlasMeta>;
    if (typeof parsed.scale === "number" && typeof parsed.encoding === "string") {
      return { scale: parsed.scale, encoding: parsed.encoding };
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

console.log(`[assets] build starting — ${frameCount} frames @ ${fps}fps`);

if (!blenderRendersDir) {
  console.warn(
    "[assets] BLENDER_RENDERS_DIR is not set — skipping atlas build. Site will run in fallback mode.",
  );
  process.exit(0);
}

function paddedFrameNumber(frameIndex: number): string {
  return String(frameIndex).padStart(4, "0");
}

function exrPath(pass: (typeof passes)[number], frameIndex: number): string {
  return join(blenderRendersDir!, pass, `${pass}-${paddedFrameNumber(frameIndex)}.exr`);
}

function passPattern(pass: (typeof passes)[number]): string {
  return join(blenderRendersDir!, pass, `${pass}-%04d.exr`);
}

function fileMtime(path: string): number {
  return statSync(path).mtimeMs;
}

// Step 0: check inputs. The video atlas always wants the full
// beauty/whitelight/position sequence. The still atlas can be built
// from either the cellular inputs (beauty + whitelight + screen_K for
// K in [0, N²)) or the legacy 3-pass inputs (beauty + whitelight +
// position frame 1) — cellular wins when both are available, since the
// runtime debug toggle defaults to cellular mode.
let legacyStillInputsPresent = true;
let videoInputsPresent = true;
let newestLegacyStillInputMtime = 0;
let newestVideoInputMtime = 0;
for (const pass of passes) {
  const passDirectory = join(blenderRendersDir, pass);
  if (!existsSync(passDirectory)) {
    console.warn(`[assets] missing pass directory: ${passDirectory}`);
    legacyStillInputsPresent = false;
    videoInputsPresent = false;
    continue;
  }
  const frameOnePath = exrPath(pass, 1);
  if (!existsSync(frameOnePath)) {
    console.warn(`[assets] missing frame 1: ${frameOnePath}`);
    legacyStillInputsPresent = false;
    videoInputsPresent = false;
  } else {
    const frameOneMtime = fileMtime(frameOnePath);
    if (frameOneMtime > newestLegacyStillInputMtime) newestLegacyStillInputMtime = frameOneMtime;
    if (frameOneMtime > newestVideoInputMtime) newestVideoInputMtime = frameOneMtime;
  }
  for (let frameIndex = 2; frameIndex <= frameCount; frameIndex += 1) {
    const path = exrPath(pass, frameIndex);
    if (!existsSync(path)) {
      videoInputsPresent = false;
      continue;
    }
    const mtime = fileMtime(path);
    if (mtime > newestVideoInputMtime) newestVideoInputMtime = mtime;
  }
}

// Cellular still-atlas inputs. Cell EXRs live in
// `$BLENDER_RENDERS_DIR/cells/`, alongside the beauty/whitelight/position
// pass directories. Filename can be either `screen_K_.exr` (what
// Blender 5.1's File Output node currently writes — the `####` padding
// token doesn't substitute in multilayer EXR mode and leaves a trailing
// underscore) or `screen_K_0001.exr` (the padded form, future-proof).
// First match wins.
const cellsDir = join(blenderRendersDir, "cells");
const cellCount = cellsPerSide * cellsPerSide;
const cellFrameOnePaths: string[] = [];
let newestCellInputMtime = 0;
for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
  const unpaddedPath = join(cellsDir, `screen_${cellIndex}_.exr`);
  const paddedPath = join(cellsDir, `screen_${cellIndex}_0001.exr`);
  let resolvedPath: string | null = null;
  if (existsSync(unpaddedPath)) resolvedPath = unpaddedPath;
  else if (existsSync(paddedPath)) resolvedPath = paddedPath;
  if (!resolvedPath) {
    console.warn(`[assets] cellular path: missing cell ${cellIndex} EXR in ${cellsDir}`);
    break;
  }
  cellFrameOnePaths.push(resolvedPath);
  const mtime = fileMtime(resolvedPath);
  if (mtime > newestCellInputMtime) newestCellInputMtime = mtime;
}
const beautyFrameOnePresent = existsSync(exrPath("beauty", 1));
const whitelightFrameOnePresent = existsSync(exrPath("whitelight", 1));
const cellularStillInputsPresent =
  beautyFrameOnePresent && whitelightFrameOnePresent && cellFrameOnePaths.length === cellCount;

const useCellularStill = cellularStillInputsPresent;
const stillInputsPresent = useCellularStill || legacyStillInputsPresent;
const newestStillInputMtime = useCellularStill
  ? Math.max(newestLegacyStillInputMtime, newestCellInputMtime)
  : newestLegacyStillInputMtime;

if (!stillInputsPresent) {
  console.warn(
    "[assets] frame 1 inputs incomplete (need beauty + whitelight + (cells or position)) — skipping atlas build. Site will run in fallback mode.",
  );
  process.exit(0);
}

mkdirSync(compositeDir, { recursive: true });

const atlasScale = detectAtlasScale(blenderRendersDir);
const inverseScale = 1 / atlasScale;
const previousMeta = readAtlasMeta();
const scaleChanged = previousMeta === null || Math.abs(previousMeta.scale - atlasScale) > 1e-6;
const encodingChanged = previousMeta === null || previousMeta.encoding !== atlasEncoding;
const metaChanged = scaleChanged || encodingChanged;

let needsEncode = videoInputsPresent;
if (!videoInputsPresent) {
  console.warn(
    `[assets] video frame sequence incomplete (need ${frameCount} frames per pass) — skipping mp4 atlas, building still atlas only.`,
  );
} else if (!metaChanged && existsSync(atlasPath)) {
  if (fileMtime(atlasPath) >= newestVideoInputMtime) {
    needsEncode = false;
    console.log(`[assets] atlas up to date at ${atlasPath}`);
  }
}

if (needsEncode) {
  console.log(`[assets] scale = ${atlasScale.toFixed(6)}, encoding = ${atlasEncoding}`);
  console.log(`[assets] encoding atlas with libx264 yuv420p crf 6 preset slower...`);

  // Filter graph: read each pass as planar float RGB. whitelight + position
  // get multiplied by 1/scale via colorchannelmixer (operates on float).
  // hstack the three passes into a 3x-wide float frame, apply the sRGB
  // OETF and BT.709 matrix via zscale, then convert to yuv420p for libx264.
  const channelScale = `colorchannelmixer=rr=${inverseScale}:gg=${inverseScale}:bb=${inverseScale}`;
  const filterGraph = [
    `[0:v]format=gbrpf32le[beauty]`,
    `[1:v]format=gbrpf32le,${channelScale}[whitelight]`,
    `[2:v]format=gbrpf32le,${channelScale}[position]`,
    `[beauty][whitelight][position]hstack=inputs=3,zscale=tin=linear:t=iec61966-2-1:m=709,format=yuv420p[out]`,
  ].join(";");

  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-framerate",
      String(fps),
      "-start_number",
      "1",
      "-i",
      passPattern("beauty"),
      "-framerate",
      String(fps),
      "-start_number",
      "1",
      "-i",
      passPattern("whitelight"),
      "-framerate",
      String(fps),
      "-start_number",
      "1",
      "-i",
      passPattern("position"),
      "-frames:v",
      String(frameCount),
      "-filter_complex",
      filterGraph,
      "-map",
      "[out]",
      "-c:v",
      "libx264",
      "-preset",
      "slower",
      "-crf",
      "6",
      "-color_range",
      "pc",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "iec61966-2-1",
      "-colorspace",
      "bt709",
      "-movflags",
      "+faststart",
      atlasPath,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error("[assets] ffmpeg failed");
    process.exit(result.status ?? 1);
  }
  console.log(`[assets] encoded atlas -> ${atlasPath}`);
}

// Perceptually-lossless still atlas: same per-tile 1/E scale + sRGB OETF
// pipeline as the video, but only frame 1 and written to PNG (rgb24,
// full 4:4:4, no inter-frame compression). The runtime swaps this in
// for the MP4 in cellular-image mode to eliminate H.264 + 4:2:0 chroma
// artifacts and discretize emitter position into N² cells. Rebuilt
// whenever a relevant input changes or the PNG is missing.
const channelScaleStill = `colorchannelmixer=rr=${inverseScale}:gg=${inverseScale}:bb=${inverseScale}`;
const stillNeedsEncode =
  metaChanged || !existsSync(atlasImagePath) || fileMtime(atlasImagePath) < newestStillInputMtime;
if (stillNeedsEncode) {
  if (useCellularStill) {
    // Blender's File Output node in OPEN_EXR_MULTILAYER mode names the
    // cell's channels `screen_K.R/G/B/A`, but ffmpeg's openexr decoder
    // only reads root-level R/G/B/A. Use oiiotool to rename each cell's
    // channels to root-level into a temporary single-layer EXR before
    // feeding the ffmpeg hstack invocation.
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

    // Pack the (2 + N²) logical tiles into a TILE_COLS × TILE_ROWS grid
    // (4 × 3 for N=3 → 12 slots, 11 used + 1 empty filled black) so
    // neither output dimension exceeds the typical GPU MAX_TEXTURE_SIZE
    // = 16384. With 1920×1080 renders the atlas is 7680×3240. Inputs
    // are passed in order beauty/whitelight/s_0..s_8; xstack with an
    // explicit `layout` fills row-major from the PNG top, which after
    // the UNPACK_FLIP_Y_WEBGL upload puts beauty at v_uv.y near 1 —
    // the shader's tileUv inverts the row direction to compensate.
    const tileCount = 2 + cellCount;
    const TILE_COLS = 4;
    const TILE_ROWS = 3;
    const tileDims = detectTileDimensions(exrPath("beauty", 1));
    const layoutPositions: string[] = [];
    for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
      const col = tileIndex % TILE_COLS;
      const rowFromTop = Math.floor(tileIndex / TILE_COLS);
      layoutPositions.push(`${col * tileDims.width}_${rowFromTop * tileDims.height}`);
    }
    const tileLayout = layoutPositions.join("|");

    console.log(
      `[assets] encoding cellular still atlas (frame 1, PNG rgb24, ${tileCount} tiles in ${TILE_COLS}×${TILE_ROWS} grid)...`,
    );
    const stillInputArgs: string[] = ["-i", exrPath("beauty", 1), "-i", exrPath("whitelight", 1)];
    const filterParts: string[] = [
      `[0:v]format=gbrpf32le[beauty]`,
      `[1:v]format=gbrpf32le,${channelScaleStill}[whitelight]`,
    ];
    const labels: string[] = [`[beauty]`, `[whitelight]`];
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      stillInputArgs.push("-i", flattenedCellPaths[cellIndex]);
      const labelName = `screen_${cellIndex}`;
      const inputIndex = 2 + cellIndex;
      filterParts.push(`[${inputIndex}:v]format=gbrpf32le,${channelScaleStill}[${labelName}]`);
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
        ...stillInputArgs,
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
    console.log(
      "[assets] cellular cell EXRs missing — encoding legacy 3-tile still atlas (frame 1, PNG rgb24)...",
    );
    const stillFilterGraph = [
      `[0:v]format=gbrpf32le[beauty]`,
      `[1:v]format=gbrpf32le,${channelScaleStill}[whitelight]`,
      `[2:v]format=gbrpf32le,${channelScaleStill}[position]`,
      `[beauty][whitelight][position]hstack=inputs=3,zscale=tin=linear:t=iec61966-2-1:m=709,format=rgb24[out]`,
    ].join(";");

    const stillResult = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-i",
        exrPath("beauty", 1),
        "-i",
        exrPath("whitelight", 1),
        "-i",
        exrPath("position", 1),
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
      console.error("[assets] ffmpeg legacy still-atlas encode failed");
      process.exit(stillResult.status ?? 1);
    }
    console.log(`[assets] encoded legacy still atlas -> ${atlasImagePath}`);
  }
}

// Metadata sidecar: the runtime fetches this and feeds the scale into the
// shader so the bounce term is multiplied back to the pre-scaled
// scene-referred magnitude.
writeAtlasMeta({ scale: atlasScale, encoding: atlasEncoding });
