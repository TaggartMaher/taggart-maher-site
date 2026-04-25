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

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { frameCount, fps } from "../src/config";

const passes = ["beauty", "whitelight", "position"] as const;

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = join(repoRoot, ".cache", "encode");
const compositeDir = join(repoRoot, "public", "composite");
const atlasPath = join(compositeDir, "atlas.mp4");

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

// Step 1: per-frame mosaic via oiiotool, cached.
mkdirSync(cacheDir, { recursive: true });

let frameMosaicCount = 0;
for (let frameIndex = 1; frameIndex <= frameCount; frameIndex += 1) {
  const inputs = passes.map((pass) => exrPath(pass, frameIndex));
  const outputPath = cachedPngPath(frameIndex);

  if (existsSync(outputPath)) {
    const outputMtime = fileMtime(outputPath);
    const newestInputMtime = inputs.reduce(
      (newest, inputPath) => Math.max(newest, fileMtime(inputPath)),
      0,
    );
    if (outputMtime >= newestInputMtime) {
      continue;
    }
  }

  const result = spawnSync(
    "oiiotool",
    [...inputs, "--mosaic", "3x1", "-d", "uint8", "-o", outputPath],
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
mkdirSync(compositeDir, { recursive: true });

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
