import { describe, expect, it } from "vitest";
import { renderAspect, screenPlane, screenRect as configuredScreenRect } from "./config";
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

  it("uses Blender's XYZ Euler order (Rz · Ry · Rx) — multi-axis rotation case", () => {
    // Camera at the origin, rotated +90deg around X (so its local -Z lines up
    // with world +Y), then +90deg around Z. In Blender's XYZ extrinsic order
    // this composes as Rz · Ry · Rx, which sends the camera's view direction
    // to world -X. A screen at world (-5, 0, 0) is therefore directly in
    // front, dead center.
    const rect = computeScreenRect(
      {
        positionMeters: [0, 0, 0],
        rotationEulerDegXYZ: [90, 0, 90],
        horizontalFovDeg: 60,
      },
      {
        positionMeters: [-5, 0, 0],
        rotationEulerDegXYZ: [0, 90, 0],
        widthMeters: 1,
        heightMeters: 1,
      },
      1,
    );

    expect(rect.left + rect.width / 2).toBeCloseTo(0.5, 6);
    expect(rect.top + rect.height / 2).toBeCloseTo(0.5, 6);
  });

  it("projected screen rect aspect matches the screen plane's intrinsic aspect", () => {
    // The screen in the rendered frame should appear with roughly the
    // same width/height ratio as the physical screen plane. Big drift
    // here means either the camera's pose isn't actually pointing at the
    // screen face-on (so we're seeing it foreshortened) or the plane's
    // width/height in config.ts are swapped relative to the .blend.
    const planeAspect = screenPlane.widthMeters / screenPlane.heightMeters;
    // rect.width/height are fractions of the rendered frame, which itself
    // has aspect `renderAspect` (width/height). Pixel-space aspect of the
    // projected rect is therefore (rect.width / rect.height) * renderAspect.
    const rectAspect = (configuredScreenRect.width / configuredScreenRect.height) * renderAspect;
    // Tolerance is loose (precision 0 → within 0.5) because the camera
    // isn't perfectly head-on to the plane: slight elevation / off-axis
    // pose foreshortens height a few percent. A blown rotation (e.g.
    // plane lying flat) shows up as several-x drift, which this still
    // catches.
    expect(rectAspect).toBeCloseTo(planeAspect, 0);
  });

  it("locks in the configured camera + screen plane (regression guard)", () => {
    // Snapshot of the rect computed from src/config.ts. Drift in the camera
    // pose, screen plane, render aspect, or rotation convention will trip
    // this. Update the expected values when the .blend changes intentionally.
    expect(configuredScreenRect.left).toBeCloseTo(0.25960678722942376, 12);
    expect(configuredScreenRect.top).toBeCloseTo(0.1558444207868484, 12);
    expect(configuredScreenRect.width).toBeCloseTo(0.5588033923306764, 12);
    expect(configuredScreenRect.height).toBeCloseTo(0.5759416037881977, 12);
  });
});
