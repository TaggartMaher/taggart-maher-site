import { describe, expect, it } from "vitest";
import { parseEnvFloat, steamCrop } from "./config";

describe("parseEnvFloat", () => {
  it("returns the fallback when the value is undefined", () => {
    expect(parseEnvFloat(undefined, 0.5)).toBe(0.5);
  });

  it("returns the fallback when the value is the empty string", () => {
    // Vite's `import.meta.env` returns `""` for a defined-but-empty entry,
    // which would parse as 0 if naively coerced — we want the fallback.
    expect(parseEnvFloat("", 0.625)).toBe(0.625);
  });

  it("returns the fallback when the value is non-numeric", () => {
    expect(parseEnvFloat("not a number", 0.25)).toBe(0.25);
  });

  it("parses a numeric string", () => {
    expect(parseEnvFloat("0.375", 0.0)).toBe(0.375);
  });

  it("parses a number passed directly", () => {
    expect(parseEnvFloat(0.42, 0.0)).toBe(0.42);
  });

  it("rejects NaN explicitly", () => {
    expect(parseEnvFloat(Number.NaN, 0.7)).toBe(0.7);
  });
});

describe("steamCrop env-var read path", () => {
  it("produces a usable rectangle in [0, 1] with maxes greater than mins", () => {
    expect(steamCrop.minX).toBeGreaterThanOrEqual(0);
    expect(steamCrop.maxX).toBeLessThanOrEqual(1);
    expect(steamCrop.minY).toBeGreaterThanOrEqual(0);
    expect(steamCrop.maxY).toBeLessThanOrEqual(1);
    expect(steamCrop.maxX).toBeGreaterThan(steamCrop.minX);
    expect(steamCrop.maxY).toBeGreaterThan(steamCrop.minY);
  });
});
