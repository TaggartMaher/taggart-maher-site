import { describe, expect, it } from "vitest";
import { computeScreenRect } from "./screenRect";

const TOLERANCE = 1e-6;

describe("computeScreenRect", () => {
  it("centers a head-on screen at the middle of the frame", () => {
    // Camera at origin with default rotation looks down -Z.
    // Screen 5 meters in front (at z = -5), facing the camera (+Z normal),
    // 2m wide x 1m tall. Render aspect 16:9, horizontal FOV 60deg.
    const rect = computeScreenRect(
      {
        positionMeters: [0, 0, 0],
        rotationEulerDegXYZ: [0, 0, 0],
        horizontalFovDeg: 60,
      },
      {
        positionMeters: [0, 0, -5],
        rotationEulerDegXYZ: [0, 0, 0],
        widthMeters: 2,
        heightMeters: 1,
      },
      16 / 9,
    );

    // Expected NDC half-extents:
    //   tan(30deg) = 0.5773502...
    //   ndc.x_max = (1 / 5) / tan(30) = 0.34641016...
    //   tanHalfVertical = tan(30) / (16/9) = 0.32476...
    //   ndc.y_max = (0.5 / 5) / 0.32476 = 0.30789...
    const expectedHalfNdcX = 1 / 5 / Math.tan(Math.PI / 6);
    const expectedHalfNdcY = 0.5 / 5 / (Math.tan(Math.PI / 6) / (16 / 9));

    const expectedLeft = (1 - expectedHalfNdcX) / 2;
    const expectedWidth = expectedHalfNdcX;
    const expectedTop = (1 - expectedHalfNdcY) / 2;
    const expectedHeight = expectedHalfNdcY;

    expect(rect.left).toBeCloseTo(expectedLeft, 6);
    expect(rect.width).toBeCloseTo(expectedWidth, 6);
    expect(rect.top).toBeCloseTo(expectedTop, 6);
    expect(rect.height).toBeCloseTo(expectedHeight, 6);

    // Should be centered.
    expect(rect.left + rect.width / 2).toBeCloseTo(0.5, 6);
    expect(rect.top + rect.height / 2).toBeCloseTo(0.5, 6);
  });

  it("shifts right when the screen translates in +X world", () => {
    const centered = computeScreenRect(
      {
        positionMeters: [0, 0, 0],
        rotationEulerDegXYZ: [0, 0, 0],
        horizontalFovDeg: 60,
      },
      {
        positionMeters: [0, 0, -5],
        rotationEulerDegXYZ: [0, 0, 0],
        widthMeters: 1,
        heightMeters: 1,
      },
      1,
    );

    const shifted = computeScreenRect(
      {
        positionMeters: [0, 0, 0],
        rotationEulerDegXYZ: [0, 0, 0],
        horizontalFovDeg: 60,
      },
      {
        positionMeters: [0.5, 0, -5],
        rotationEulerDegXYZ: [0, 0, 0],
        widthMeters: 1,
        heightMeters: 1,
      },
      1,
    );

    expect(shifted.left).toBeGreaterThan(centered.left + TOLERANCE);
  });
});
