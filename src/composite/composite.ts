// Pure-TS mirror of shader.ts. Used by composite.test.ts to verify the math
// against synthetic inputs without spinning up a WebGL context. If this and
// the GLSL diverge, the visual A/B in the browser will catch it — but most
// math errors get caught here first.

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface UvCoord {
  u: number;
  v: number;
}

export const PASS_WIDTH = 1 / 3;
export const WHITELIGHT_EPS = 1.0e-3;

// Sample a 2D image stored as RGB tuples in row-major order with the origin
// at (0,0)=bottom-left (WebGL convention). Out-of-range UVs clamp to edge.
export interface RgbImage {
  width: number;
  height: number;
  pixels: Float32Array; // length = width * height * 3
}

export function sampleNearest(image: RgbImage, uv: UvCoord): RgbColor {
  const clampedU = Math.min(Math.max(uv.u, 0), 1);
  const clampedV = Math.min(Math.max(uv.v, 0), 1);
  const xPixel = Math.min(Math.floor(clampedU * image.width), image.width - 1);
  const yPixel = Math.min(Math.floor(clampedV * image.height), image.height - 1);
  const offset = (yPixel * image.width + xPixel) * 3;
  return {
    r: image.pixels[offset],
    g: image.pixels[offset + 1],
    b: image.pixels[offset + 2],
  };
}

// Compose a single output pixel given samples from the three atlas passes
// and the user-screen image. Mirrors the fragment shader exactly: `scale`
// recovers the magnitude that the build pipeline divided out of whitelight
// and position to fit them in the 8-bit atlas, and V is flipped before
// sampling the user screen because Blender's UV map is V-down.
export function composePixel(
  beauty: RgbColor,
  whitelight: RgbColor,
  position: RgbColor,
  userScreen: RgbImage,
  scale: number,
): RgbColor {
  const divisor = Math.max(whitelight.r, WHITELIGHT_EPS);
  const emitterUv: UvCoord = {
    u: position.r / divisor,
    v: 1 - position.g / divisor,
  };
  const screenColor = sampleNearest(userScreen, emitterUv);
  return {
    r: beauty.r + scale * screenColor.r * whitelight.r,
    g: beauty.g + scale * screenColor.g * whitelight.g,
    b: beauty.b + scale * screenColor.b * whitelight.b,
  };
}
