import { describe, expect, it } from "vitest";
import { renderAspect, screenPlane, screenRect as configuredScreenRect } from "./config";
import {
  computeCssMatrix3d,
  computeProjectedCorners,
  computeScreenDimensions,
  computeScreenNormal,
  computeScreenRect,
  inverseProjectViewportPoint,
  type ProjectedCorners,
  type ScreenPlane,
} from "./screenRect";

const TOLERANCE = 1e-6;

// Convenience: construct a screen plane from corner offsets in a flat
// world-aligned rectangle, used by several head-on tests below.
function rectAt(
  centerX: number,
  centerY: number,
  centerZ: number,
  width: number,
  height: number,
): ScreenPlane {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    vertices: [
      [centerX - halfWidth, centerY + halfHeight, centerZ],
      [centerX + halfWidth, centerY + halfHeight, centerZ],
      [centerX + halfWidth, centerY - halfHeight, centerZ],
      [centerX - halfWidth, centerY - halfHeight, centerZ],
    ],
  };
}

describe("computeScreenRect", () => {
  it("centers a head-on screen at the middle of the frame", () => {
    const rect = computeScreenRect(
      {
        positionMeters: [0, 0, 0],
        rotationEulerDegXYZ: [0, 0, 0],
        horizontalFovDeg: 60,
      },
      rectAt(0, 0, -5, 2, 1),
      16 / 9,
    );

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

    expect(rect.left + rect.width / 2).toBeCloseTo(0.5, 6);
    expect(rect.top + rect.height / 2).toBeCloseTo(0.5, 6);
  });

  it("shifts right when the screen translates in +X world", () => {
    const centered = computeScreenRect(
      { positionMeters: [0, 0, 0], rotationEulerDegXYZ: [0, 0, 0], horizontalFovDeg: 60 },
      rectAt(0, 0, -5, 1, 1),
      1,
    );

    const shifted = computeScreenRect(
      { positionMeters: [0, 0, 0], rotationEulerDegXYZ: [0, 0, 0], horizontalFovDeg: 60 },
      rectAt(0.5, 0, -5, 1, 1),
      1,
    );

    expect(shifted.left).toBeGreaterThan(centered.left + TOLERANCE);
  });

  it("projected screen rect aspect matches the screen plane's intrinsic aspect", () => {
    const dimensions = computeScreenDimensions(screenPlane);
    const planeAspect = dimensions.widthMeters / dimensions.heightMeters;
    const rectAspect = (configuredScreenRect.width / configuredScreenRect.height) * renderAspect;
    expect(rectAspect).toBeCloseTo(planeAspect, 0);
  });
});

describe("computeProjectedCorners", () => {
  it("returns image-space corners for a head-on screen", () => {
    const corners = computeProjectedCorners(
      { positionMeters: [0, 0, 0], rotationEulerDegXYZ: [0, 0, 0], horizontalFovDeg: 60 },
      rectAt(0, 0, -5, 2, 1),
      16 / 9,
    );
    // Top corners share the smaller Y (closer to 0); bottom corners share the larger Y.
    expect(corners.topLeft[1]).toBeCloseTo(corners.topRight[1], 6);
    expect(corners.bottomLeft[1]).toBeCloseTo(corners.bottomRight[1], 6);
    expect(corners.topLeft[1]).toBeLessThan(corners.bottomLeft[1]);
    // Left corners share the smaller X; right corners share the larger X.
    expect(corners.topLeft[0]).toBeLessThan(corners.topRight[0]);
    expect(corners.bottomLeft[0]).toBeLessThan(corners.bottomRight[0]);
  });
});

describe("computeScreenNormal", () => {
  it("points toward the camera for a head-on plane", () => {
    const screen = rectAt(0, 0, -5, 2, 1);
    const normal = computeScreenNormal(screen, [0, 0, 0]);
    // Plane lies in z = -5; camera at origin is in +Z direction → normal +Z.
    expect(normal[0]).toBeCloseTo(0, 6);
    expect(normal[1]).toBeCloseTo(0, 6);
    expect(normal[2]).toBeCloseTo(1, 6);
  });

  it("flips a back-facing winding so it still points toward the camera", () => {
    // Reverse the vertex winding — the raw cross product would point away,
    // but the function should detect that and flip.
    const screen: ScreenPlane = {
      vertices: [
        [-1, 1, -5],
        [-1, -1, -5],
        [1, -1, -5],
        [1, 1, -5],
      ],
    };
    const normal = computeScreenNormal(screen, [0, 0, 0]);
    expect(normal[2]).toBeGreaterThan(0);
  });
});

describe("computeCssMatrix3d / inverseProjectViewportPoint", () => {
  const sourceWidth = 200;
  const sourceHeight = 100;

  it("identity-maps source corners to themselves when destination matches source", () => {
    const destination: ProjectedCorners = {
      topLeft: [0, 0],
      topRight: [sourceWidth, 0],
      bottomRight: [sourceWidth, sourceHeight],
      bottomLeft: [0, sourceHeight],
    };
    const matrix = computeCssMatrix3d(sourceWidth, sourceHeight, destination);
    expect(matrix.startsWith("matrix3d(")).toBe(true);
    const numbers = matrix
      .slice("matrix3d(".length, -1)
      .split(",")
      .map((value) => Number(value));
    const expectedIdentity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (let index = 0; index < 16; index += 1) {
      expect(numbers[index]).toBeCloseTo(expectedIdentity[index], 6);
    }
  });

  it("inverse-projects each destination corner back to the source corner", () => {
    const destination: ProjectedCorners = {
      topLeft: [50, 30],
      topRight: [400, 10],
      bottomRight: [380, 220],
      bottomLeft: [40, 200],
    };
    const expectedSourceCorners: Array<{
      destination: [number, number];
      source: [number, number];
    }> = [
      { destination: destination.topLeft, source: [0, 0] },
      { destination: destination.topRight, source: [sourceWidth, 0] },
      { destination: destination.bottomRight, source: [sourceWidth, sourceHeight] },
      { destination: destination.bottomLeft, source: [0, sourceHeight] },
    ];
    for (const { destination: destinationPoint, source: expectedSource } of expectedSourceCorners) {
      const recoveredSource = inverseProjectViewportPoint(
        destinationPoint,
        sourceWidth,
        sourceHeight,
        destination,
      );
      expect(recoveredSource[0]).toBeCloseTo(expectedSource[0], 9);
      expect(recoveredSource[1]).toBeCloseTo(expectedSource[1], 9);
    }
  });
});
