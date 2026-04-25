import { describe, expect, it } from "vitest";
import { composePixel, type RgbImage } from "./composite";

function makeUniformImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): RgbImage {
  const pixels = new Float32Array(width * height * 3);
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    pixels[pixelIndex * 3] = r;
    pixels[pixelIndex * 3 + 1] = g;
    pixels[pixelIndex * 3 + 2] = b;
  }
  return { width, height, pixels };
}

function makeUvGradientImage(width: number, height: number): RgbImage {
  const pixels = new Float32Array(width * height * 3);
  for (let yPixel = 0; yPixel < height; yPixel += 1) {
    for (let xPixel = 0; xPixel < width; xPixel += 1) {
      const offset = (yPixel * width + xPixel) * 3;
      pixels[offset] = (xPixel + 0.5) / width;
      pixels[offset + 1] = (yPixel + 0.5) / height;
      pixels[offset + 2] = 0;
    }
  }
  return { width, height, pixels };
}

describe("composePixel", () => {
  it("returns beauty alone when the screen is dark (whitelight = 0)", () => {
    // Dim region: whitelight ≈ 0, position ≈ 0. The eps clamp keeps the
    // division finite; screenColor multiplied by ~0 whitelight contributes
    // ~0. Output should be just beauty regardless of scale.
    const beauty = { r: 0.4, g: 0.3, b: 0.2 };
    const whitelight = { r: 0, g: 0, b: 0 };
    const position = { r: 0, g: 0, b: 0 };
    const screen = makeUniformImage(4, 4, 1, 1, 1);

    const composed = composePixel(beauty, whitelight, position, screen, 3.17);

    expect(composed.r).toBeCloseTo(beauty.r, 6);
    expect(composed.g).toBeCloseTo(beauty.g, 6);
    expect(composed.b).toBeCloseTo(beauty.b, 6);
  });

  it("recovers a flat-white user screen exactly with scale = 1, whitelight = 1", () => {
    // Screen surface in scene-referred units with emission strength 1: the
    // build pipeline writes whitelight = 1 unscaled, the shader multiplies
    // bounce by scale = 1. Result is beauty + screen.
    const beauty = { r: 0.05, g: 0.05, b: 0.05 };
    const whitelight = { r: 1, g: 1, b: 1 };
    const position = { r: 0.42, g: 0.71, b: 0 };
    const screen = makeUniformImage(8, 8, 1, 1, 1);

    const composed = composePixel(beauty, whitelight, position, screen, 1);

    expect(composed.r).toBeCloseTo(1.05, 6);
    expect(composed.g).toBeCloseTo(1.05, 6);
    expect(composed.b).toBeCloseTo(1.05, 6);
  });

  it("samples the user screen at position.rg / whitelight.r with V flipped", () => {
    // With a UV-gradient user screen and uniform whitelight = 1, the U axis
    // passes through unchanged but V is flipped (Blender's UV map is V-down,
    // canvas data is V-down, the shader compensates by inverting V). For
    // position = (0.25, 0.75), the sampled pixel has v = 1 - 0.75 = 0.25.
    const beauty = { r: 0, g: 0, b: 0 };
    const whitelight = { r: 1, g: 1, b: 1 };
    const position = { r: 0.25, g: 0.75, b: 0 };
    const screen = makeUvGradientImage(64, 64);

    const composed = composePixel(beauty, whitelight, position, screen, 1);

    expect(composed.r).toBeCloseTo(0.25, 1);
    expect(composed.g).toBeCloseTo(0.25, 1);
    expect(composed.b).toBeCloseTo(0, 6);
  });

  it("recovers scene-referred bounce magnitude under pre-scaling", () => {
    // The build pipeline divides whitelight + position by E (= scale) so
    // they fit in 8-bit. position/whitelight is invariant under that
    // division, but the bounce magnitude isn't — the shader's `scale *
    // screenColor * whitelight` puts the magnitude back. Stored whitelight
    // = realWhitelight / scale; final bounce = scale * stored_whitelight =
    // realWhitelight, exactly as if no scaling had happened.
    const beauty = { r: 0, g: 0, b: 0 };
    const realWhitelight = 2.4;
    const scale = 3.17;
    const storedWhitelight = realWhitelight / scale;
    const realPosition = 0.5 * realWhitelight;
    const storedPosition = realPosition / scale;
    const screen = makeUniformImage(4, 4, 1, 0.5, 0);

    const composed = composePixel(
      beauty,
      { r: storedWhitelight, g: storedWhitelight, b: storedWhitelight },
      { r: storedPosition, g: storedPosition, b: 0 },
      screen,
      scale,
    );

    // Bounce contribution should equal screenColor * realWhitelight,
    // matching what an unscaled pipeline would produce.
    expect(composed.r).toBeCloseTo(1 * realWhitelight, 6);
    expect(composed.g).toBeCloseTo(0.5 * realWhitelight, 6);
    expect(composed.b).toBeCloseTo(0, 6);
  });

  it("scales bounce light linearly with whitelight", () => {
    // A surface only partially lit by the screen (whitelight halved) should
    // get half the bounce-light contribution.
    const beauty = { r: 0, g: 0, b: 0 };
    const whitelightFull = { r: 1, g: 1, b: 1 };
    const whitelightHalf = { r: 0.5, g: 0.5, b: 0.5 };
    const position = { r: 0.5, g: 0.5, b: 0 };
    const screen = makeUniformImage(2, 2, 1, 0.4, 0.2);

    const full = composePixel(beauty, whitelightFull, position, screen, 1);
    const half = composePixel(
      beauty,
      whitelightHalf,
      // Halving whitelight halves the average bounce contribution at the
      // same emitter location, so the position pass also halves.
      { r: 0.25, g: 0.25, b: 0 },
      screen,
      1,
    );

    expect(half.r).toBeCloseTo(full.r * 0.5, 6);
    expect(half.g).toBeCloseTo(full.g * 0.5, 6);
    expect(half.b).toBeCloseTo(full.b * 0.5, 6);
  });
});
