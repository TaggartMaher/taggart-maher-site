// Project the screen plane's four corners through the camera and return its
// axis-aligned bounding rectangle in normalized render coordinates
// (0,0) = top-left, (1,1) = bottom-right of the rendered frame.
//
// Inputs use Blender conventions:
//   - Distances in meters.
//   - Rotations are XYZ Euler in degrees (Blender mathutils.Euler "XYZ"),
//     producing the rotation matrix R = Rx · Ry · Rz applied as
//     v_world = R · v_local + position.
//   - Camera local frame: looks down -Z, +Y up, +X right (Blender default).
//   - Screen plane local frame: lies in the XY plane (normal +Z) with the
//     given width along local X and height along local Y; centered at its
//     position.
//   - Camera horizontal field of view in degrees (sensor fit: horizontal).
//     Vertical FOV is derived from the render aspect.

export type Vector3 = [number, number, number];

export interface CameraPose {
  positionMeters: Vector3;
  rotationEulerDegXYZ: Vector3;
  horizontalFovDeg: number;
}

export interface ScreenPlane {
  positionMeters: Vector3;
  rotationEulerDegXYZ: Vector3;
  widthMeters: number;
  heightMeters: number;
}

export interface NormalizedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Matrix3 = [Vector3, Vector3, Vector3];

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

function rotationMatrixXYZ(eulerDeg: Vector3): Matrix3 {
  const xRadians = degreesToRadians(eulerDeg[0]);
  const yRadians = degreesToRadians(eulerDeg[1]);
  const zRadians = degreesToRadians(eulerDeg[2]);

  const cosX = Math.cos(xRadians);
  const sinX = Math.sin(xRadians);
  const cosY = Math.cos(yRadians);
  const sinY = Math.sin(yRadians);
  const cosZ = Math.cos(zRadians);
  const sinZ = Math.sin(zRadians);

  // Blender XYZ Euler: R = Rx · Ry · Rz.
  return [
    [cosY * cosZ, -cosY * sinZ, sinY],
    [cosX * sinZ + sinX * sinY * cosZ, cosX * cosZ - sinX * sinY * sinZ, -sinX * cosY],
    [sinX * sinZ - cosX * sinY * cosZ, sinX * cosZ + cosX * sinY * sinZ, cosX * cosY],
  ];
}

function multiplyMatrixVector(matrix: Matrix3, vector: Vector3): Vector3 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function transposeMatrix(matrix: Matrix3): Matrix3 {
  return [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
}

function subtractVectors(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function computeScreenRect(
  camera: CameraPose,
  screen: ScreenPlane,
  renderAspect: number,
): NormalizedRect {
  const cameraRotation = rotationMatrixXYZ(camera.rotationEulerDegXYZ);
  const worldToCameraRotation = transposeMatrix(cameraRotation);

  const screenRotation = rotationMatrixXYZ(screen.rotationEulerDegXYZ);
  const halfWidth = screen.widthMeters / 2;
  const halfHeight = screen.heightMeters / 2;
  const localCorners: Vector3[] = [
    [-halfWidth, -halfHeight, 0],
    [halfWidth, -halfHeight, 0],
    [halfWidth, halfHeight, 0],
    [-halfWidth, halfHeight, 0],
  ];

  const horizontalFovRadians = degreesToRadians(camera.horizontalFovDeg);
  const tanHalfHorizontalFov = Math.tan(horizontalFovRadians / 2);
  const tanHalfVerticalFov = tanHalfHorizontalFov / renderAspect;

  let minNdcX = Infinity;
  let maxNdcX = -Infinity;
  let minNdcY = Infinity;
  let maxNdcY = -Infinity;

  for (const localCorner of localCorners) {
    const worldCorner: Vector3 = (() => {
      const rotated = multiplyMatrixVector(screenRotation, localCorner);
      return [
        rotated[0] + screen.positionMeters[0],
        rotated[1] + screen.positionMeters[1],
        rotated[2] + screen.positionMeters[2],
      ];
    })();

    const cameraSpace = multiplyMatrixVector(
      worldToCameraRotation,
      subtractVectors(worldCorner, camera.positionMeters),
    );

    const depthInFrontOfCamera = -cameraSpace[2];
    if (depthInFrontOfCamera <= 0) {
      throw new Error("Screen corner is behind or at the camera plane.");
    }

    const ndcX = cameraSpace[0] / depthInFrontOfCamera / tanHalfHorizontalFov;
    const ndcY = cameraSpace[1] / depthInFrontOfCamera / tanHalfVerticalFov;

    if (ndcX < minNdcX) minNdcX = ndcX;
    if (ndcX > maxNdcX) maxNdcX = ndcX;
    if (ndcY < minNdcY) minNdcY = ndcY;
    if (ndcY > maxNdcY) maxNdcY = ndcY;
  }

  const left = (minNdcX + 1) / 2;
  const right = (maxNdcX + 1) / 2;
  const top = (1 - maxNdcY) / 2;
  const bottom = (1 - minNdcY) / 2;

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}
