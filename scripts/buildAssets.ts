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
// If BLENDER_RENDERS_DIR is unset or any pass directory / frame is missing,
// the script logs a warning and exits 0 — the site falls back to the no-CGI
// path at runtime. Asset build never fails the dev or production build.
//
// Tooling: requires ffmpeg built with libzimg (the `zscale` filter) for the
// linear → sRGB OETF + BT.709 matrix conversion, and oiiotool for the
// one-shot scale detection on the whitelight pass.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { frameCount, fps } from "../src/config";

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

const atlasEncoding = "h264-420-srgb-v2";

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

// Step 0: verify every pass directory has the right number of frames, and
// track the newest input mtime for the cache check.
let allInputsPresent = true;
let newestInputMtime = 0;
for (const pass of passes) {
  const passDirectory = join(blenderRendersDir, pass);
  if (!existsSync(passDirectory)) {
    console.warn(`[assets] missing pass directory: ${passDirectory}`);
    allInputsPresent = false;
    continue;
  }
  for (let frameIndex = 1; frameIndex <= frameCount; frameIndex += 1) {
    const mtime = fileMtime(exrPath(pass, frameIndex));
    if (mtime > newestInputMtime) newestInputMtime = mtime;
  }
}

if (!allInputsPresent) {
  console.warn(
    "[assets] inputs incomplete — skipping atlas build. Site will run in fallback mode.",
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

let needsEncode = true;
if (!metaChanged && existsSync(atlasPath)) {
  if (fileMtime(atlasPath) >= newestInputMtime) {
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

// Perceptually-lossless still atlas: same hstack + 1/E scale + sRGB OETF
// pipeline as the video, but only frame 1 and written to PNG (rgb24, full
// 4:4:4, no inter-frame compression). The runtime can swap this in for the
// MP4 in debug mode to eliminate the H.264 + 4:2:0 chroma artifacts that
// affect the position pass on edge bounces. Rebuilt whenever the video
// atlas is rebuilt, or when the PNG is missing.
const stillNeedsEncode = needsEncode || !existsSync(atlasImagePath);
if (stillNeedsEncode) {
  console.log("[assets] encoding lossless still atlas (frame 1, PNG rgb24)...");

  const channelScaleStill = `colorchannelmixer=rr=${inverseScale}:gg=${inverseScale}:bb=${inverseScale}`;
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
    console.error("[assets] ffmpeg still-atlas encode failed");
    process.exit(stillResult.status ?? 1);
  }
  console.log(`[assets] encoded still atlas -> ${atlasImagePath}`);
}

// Metadata sidecar: the runtime fetches this and feeds the scale into the
// shader so the bounce term is multiplied back to the pre-scaled
// scene-referred magnitude.
writeAtlasMeta({ scale: atlasScale, encoding: atlasEncoding });
