// Build the composite atlas video from the Blender renders.
//
// Pipeline (delivery format A1 — single 3x-wide H.264 atlas):
//   1. For each frame N, mosaic the three EXR passes (beauty, whitelight,
//      position) horizontally into a single 8-bit PNG via oiiotool. Cached
//      per-frame in .cache/encode/.
//   2. Encode the PNG sequence into public/composite/atlas.mp4 with ffmpeg.
//
// Both stages are idempotent: each output is rebuilt only when its inputs are
// newer. Re-runs in dev are a no-op once the atlas is up to date.
//
// If BLENDER_RENDERS_DIR is unset or any pass directory / frame is missing,
// the script logs a warning and exits 0 — the site falls back to the no-CGI
// path at runtime. Asset build never fails the dev or production build.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { frameCount, fps } from "../src/config";

const passes = ["beauty", "whitelight", "position"] as const;

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = join(repoRoot, ".cache", "encode");
const compositeDir = join(repoRoot, "public", "composite");
const atlasPath = join(compositeDir, "atlas.mp4");
const atlasMetaPath = join(compositeDir, "atlasMeta.json");

// Pre-scale factor for the whitelight + position passes. Blender renders these
// at the screen's emission strength (E), which exceeds 1.0 in linear EXR and
// would saturate to 1 when we encode 8-bit PNG. We detect E from the
// whitelight pass and divide both passes by it on the way into the atlas;
// the shader then multiplies the bounce contribution back by E so the math
// `position / whitelight` (the emitter UV) is preserved with its full
// dynamic range. Beauty is untouched — its values are well under 1.
//
// `encoding` is the OETF applied to the linear values before 8-bit
// quantization. H.264 is invariably tagged BT.709, and any standards-compliant
// decoder (browser, video player) applies the BT.709 EOTF on display. If we
// stored linear, the decoder would gamma-decode it a second time and crush
// mid-tones to ~40% of their value. We pre-encode with sRGB (close enough to
// BT.709 OETF) so the round-trip cancels and the shader receives linear
// values back. Bumping `encoding` invalidates the PNG cache.
interface AtlasMeta {
  scale: number;
  encoding: string;
}

const atlasEncoding = "srgb-v1";

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

function cachedPngPath(frameIndex: number): string {
  return join(cacheDir, `atlas-${paddedFrameNumber(frameIndex)}.png`);
}

function fileMtime(path: string): number {
  return statSync(path).mtimeMs;
}

// Step 0: verify every pass directory has the right number of frames.
let allInputsPresent = true;
for (const pass of passes) {
  const passDirectory = join(blenderRendersDir, pass);
  if (!existsSync(passDirectory)) {
    console.warn(`[assets] missing pass directory: ${passDirectory}`);
    allInputsPresent = false;
    continue;
  }
  const exrFiles = readdirSync(passDirectory).filter((name) => name.endsWith(".exr"));
  if (exrFiles.length !== frameCount) {
    console.warn(
      `[assets] pass ${pass}: expected ${frameCount} EXR frames, found ${exrFiles.length} in ${passDirectory}`,
    );
    allInputsPresent = false;
  }
}

if (!allInputsPresent) {
  console.warn(
    "[assets] inputs incomplete — skipping atlas build. Site will run in fallback mode.",
  );
  process.exit(0);
}

// Step 1: per-frame mosaic via oiiotool, cached. Whitelight + position get
// scaled by 1/scale before 8-bit quantization; beauty is passed through.
mkdirSync(compositeDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const atlasScale = detectAtlasScale(blenderRendersDir);
const inverseScale = 1 / atlasScale;
const previousMeta = readAtlasMeta();
const scaleChanged = previousMeta === null || Math.abs(previousMeta.scale - atlasScale) > 1e-6;
const encodingChanged = previousMeta === null || previousMeta.encoding !== atlasEncoding;
const cacheInvalidated = scaleChanged || encodingChanged;
if (cacheInvalidated) {
  console.log(
    `[assets] scale = ${atlasScale.toFixed(6)}, encoding = ${atlasEncoding}. PNG cache will be rebuilt.`,
  );
}

let frameMosaicCount = 0;
for (let frameIndex = 1; frameIndex <= frameCount; frameIndex += 1) {
  const inputs = passes.map((pass) => exrPath(pass, frameIndex));
  const outputPath = cachedPngPath(frameIndex);

  if (!cacheInvalidated && existsSync(outputPath)) {
    const outputMtime = fileMtime(outputPath);
    const newestInputMtime = inputs.reduce(
      (newest, inputPath) => Math.max(newest, fileMtime(inputPath)),
      0,
    );
    if (outputMtime >= newestInputMtime) {
      continue;
    }
  }

  const inverseScaleArg = inverseScale.toString();
  const result = spawnSync(
    "oiiotool",
    [
      exrPath("beauty", frameIndex),
      exrPath("whitelight", frameIndex),
      "--mulc",
      inverseScaleArg,
      exrPath("position", frameIndex),
      "--mulc",
      inverseScaleArg,
      "--mosaic",
      "3x1",
      // Apply sRGB OETF so the values survive the decoder's BT.709 EOTF
      // round-trip. Without this the H.264 file looks dim in any viewer
      // and the shader receives gamma-crushed values.
      "--colorconvert",
      "linear",
      "sRGB",
      "-d",
      "uint8",
      "-o",
      outputPath,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(`[assets] oiiotool failed on frame ${frameIndex}`);
    process.exit(result.status ?? 1);
  }
  frameMosaicCount += 1;
}

if (frameMosaicCount > 0) {
  console.log(`[assets] mosaiced ${frameMosaicCount} frame(s)`);
}

// Step 2: encode atlas.mp4 from the cached PNG sequence via ffmpeg.
const pngPattern = join(cacheDir, "atlas-%04d.png");
let needsEncode = true;
if (existsSync(atlasPath)) {
  const atlasMtime = fileMtime(atlasPath);
  let newestPngMtime = 0;
  for (let frameIndex = 1; frameIndex <= frameCount; frameIndex += 1) {
    const pngMtime = fileMtime(cachedPngPath(frameIndex));
    if (pngMtime > newestPngMtime) newestPngMtime = pngMtime;
  }
  if (atlasMtime >= newestPngMtime) {
    needsEncode = false;
    console.log(`[assets] atlas up to date at ${atlasPath}`);
  }
}

if (needsEncode) {
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
      pngPattern,
      "-frames:v",
      String(frameCount),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-color_range",
      "pc",
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

// Step 3: write metadata sidecar. The runtime fetches this and feeds the
// scale into the shader so the bounce term is multiplied back to the
// pre-scaled scene-referred magnitude.
writeAtlasMeta({ scale: atlasScale, encoding: atlasEncoding });
