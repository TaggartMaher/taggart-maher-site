// Project the screen plane (specified by its four world-space vertices)
// through the camera and return geometry useful to the runtime: the AABB
// in normalized render coordinates, the per-corner projected positions,
// the plane's outward (camera-facing) normal, and the CSS matrix3d that
// warps a 2D source rectangle onto the projected quad.
//
// Conventions:
//   - Distances in meters.
//   - Camera rotations are XYZ Euler in degrees (Blender mathutils.Euler "XYZ"),
//     producing the rotation matrix R = Rz · Ry · Rx applied as
//     v_world = R · v_local + position.
//   - Camera local frame: looks down -Z, +Y up, +X right (Blender default).
//   - Screen plane: 4 world-space vertices in image-space order
//     [topLeft, topRight, bottomRight, bottomLeft] (clockwise starting from
//     top-left as the camera sees the plane). Top/bottom/left/right are the
//     image axes after projection.
//   - Camera horizontal field of view in degrees (sensor fit: horizontal).
//     Vertical FOV is derived from the render aspect.
//   - Normalized viewport coordinates: (0,0) = top-left, (1,1) = bottom-right.

export type Vector2 = [number, number];
export type Vector3 = [number, number, number];

export interface CameraPose {
  positionMeters: Vector3;
  rotationEulerDegXYZ: Vector3;
  horizontalFovDeg: number;
}

export interface ScreenPlane {
  vertices: [Vector3, Vector3, Vector3, Vector3];
}

export interface NormalizedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ProjectedCorners {
  topLeft: Vector2;
  topRight: Vector2;
  bottomRight: Vector2;
  bottomLeft: Vector2;
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

  // Blender XYZ Euler: R = Rz · Ry · Rx.
  return [
    [cosZ * cosY, cosZ * sinY * sinX - sinZ * cosX, cosZ * sinY * cosX + sinZ * sinX],
    [sinZ * cosY, sinZ * sinY * sinX + cosZ * cosX, sinZ * sinY * cosX - cosZ * sinX],
    [-sinY, cosY * sinX, cosY * cosX],
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

function crossProduct(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dotProduct(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vectorLength(vector: Vector3): number {
  return Math.sqrt(dotProduct(vector, vector));
}

function distanceBetween(a: Vector3, b: Vector3): number {
  return vectorLength(subtractVectors(a, b));
}

function normalize(vector: Vector3): Vector3 {
  const length = vectorLength(vector);
  if (length === 0) {
    throw new Error("Cannot normalize a zero-length vector.");
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

// Project a single world point to normalized viewport coords (0..1, top-left origin).
function projectWorldPointToViewport(
  worldPoint: Vector3,
  worldToCameraRotation: Matrix3,
  cameraPositionMeters: Vector3,
  tanHalfHorizontalFov: number,
  tanHalfVerticalFov: number,
): Vector2 {
  const cameraSpace = multiplyMatrixVector(
    worldToCameraRotation,
    subtractVectors(worldPoint, cameraPositionMeters),
  );

  const depthInFrontOfCamera = -cameraSpace[2];
  if (depthInFrontOfCamera <= 0) {
    throw new Error("Screen vertex is behind or at the camera plane.");
  }

  const ndcX = cameraSpace[0] / depthInFrontOfCamera / tanHalfHorizontalFov;
  const ndcY = cameraSpace[1] / depthInFrontOfCamera / tanHalfVerticalFov;

  // Map [-1, 1] NDC → [0, 1] viewport, flipping Y so 0 is the top.
  return [(ndcX + 1) / 2, (1 - ndcY) / 2];
}

export function computeProjectedCorners(
  camera: CameraPose,
  screen: ScreenPlane,
  renderAspect: number,
): ProjectedCorners {
  const cameraRotation = rotationMatrixXYZ(camera.rotationEulerDegXYZ);
  const worldToCameraRotation = transposeMatrix(cameraRotation);

  const horizontalFovRadians = degreesToRadians(camera.horizontalFovDeg);
  const tanHalfHorizontalFov = Math.tan(horizontalFovRadians / 2);
  const tanHalfVerticalFov = tanHalfHorizontalFov / renderAspect;

  const project = (worldPoint: Vector3): Vector2 =>
    projectWorldPointToViewport(
      worldPoint,
      worldToCameraRotation,
      camera.positionMeters,
      tanHalfHorizontalFov,
      tanHalfVerticalFov,
    );

  return {
    topLeft: project(screen.vertices[0]),
    topRight: project(screen.vertices[1]),
    bottomRight: project(screen.vertices[2]),
    bottomLeft: project(screen.vertices[3]),
  };
}

export function computeScreenRect(
  camera: CameraPose,
  screen: ScreenPlane,
  renderAspect: number,
): NormalizedRect {
  const corners = computeProjectedCorners(camera, screen, renderAspect);
  const allCorners: Vector2[] = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const corner of allCorners) {
    if (corner[0] < minX) minX = corner[0];
    if (corner[0] > maxX) maxX = corner[0];
    if (corner[1] < minY) minY = corner[1];
    if (corner[1] > maxY) maxY = corner[1];
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// Outward normal of the screen plane, oriented to point toward the camera.
// Computed as the cross product of two non-collinear edges of the quad,
// then flipped if it ends up pointing away from the camera position.
export function computeScreenNormal(screen: ScreenPlane, cameraPositionMeters: Vector3): Vector3 {
  const [topLeft, topRight, , bottomLeft] = screen.vertices;
  const edgeAcross = subtractVectors(topRight, topLeft);
  const edgeDown = subtractVectors(bottomLeft, topLeft);
  const rawNormal = crossProduct(edgeAcross, edgeDown);

  const planeCenter: Vector3 = [
    (screen.vertices[0][0] +
      screen.vertices[1][0] +
      screen.vertices[2][0] +
      screen.vertices[3][0]) /
      4,
    (screen.vertices[0][1] +
      screen.vertices[1][1] +
      screen.vertices[2][1] +
      screen.vertices[3][1]) /
      4,
    (screen.vertices[0][2] +
      screen.vertices[1][2] +
      screen.vertices[2][2] +
      screen.vertices[3][2]) /
      4,
  ];
  const towardCamera = subtractVectors(cameraPositionMeters, planeCenter);

  const orientedNormal: Vector3 =
    dotProduct(rawNormal, towardCamera) >= 0
      ? rawNormal
      : [-rawNormal[0], -rawNormal[1], -rawNormal[2]];

  return normalize(orientedNormal);
}

// Average edge lengths give a "natural" pixel aspect for the offscreen
// content texture: top vs. bottom may differ slightly under perspective,
// but the Blender mesh is rectangular so averaging is safe.
export function computeScreenDimensions(screen: ScreenPlane): {
  widthMeters: number;
  heightMeters: number;
} {
  const [topLeft, topRight, bottomRight, bottomLeft] = screen.vertices;
  const widthMeters =
    (distanceBetween(topLeft, topRight) + distanceBetween(bottomLeft, bottomRight)) / 2;
  const heightMeters =
    (distanceBetween(topLeft, bottomLeft) + distanceBetween(topRight, bottomRight)) / 2;
  return { widthMeters, heightMeters };
}

// Solve the 2D homography H mapping the source rectangle [0,sourceWidth] ×
// [0,sourceHeight] (corners in TL, TR, BR, BL order) to the four destination
// points (also in TL, TR, BR, BL order). Returns the 9 entries of the 3x3
// matrix in row-major order. The closed-form below maps the unit square
// first, then composes with a (1/sourceWidth, 1/sourceHeight) scale.
function solveHomographyToQuad(
  sourceWidth: number,
  sourceHeight: number,
  destination: ProjectedCorners,
): [number, number, number, number, number, number, number, number, number] {
  const [destinationTopLeftX, destinationTopLeftY] = destination.topLeft;
  const [destinationTopRightX, destinationTopRightY] = destination.topRight;
  const [destinationBottomRightX, destinationBottomRightY] = destination.bottomRight;
  const [destinationBottomLeftX, destinationBottomLeftY] = destination.bottomLeft;

  const deltaXAlongTop = destinationTopRightX - destinationBottomRightX;
  const deltaXAlongLeft = destinationBottomLeftX - destinationBottomRightX;
  const sumX =
    destinationTopLeftX - destinationTopRightX + destinationBottomRightX - destinationBottomLeftX;

  const deltaYAlongTop = destinationTopRightY - destinationBottomRightY;
  const deltaYAlongLeft = destinationBottomLeftY - destinationBottomRightY;
  const sumY =
    destinationTopLeftY - destinationTopRightY + destinationBottomRightY - destinationBottomLeftY;

  const determinant = deltaXAlongTop * deltaYAlongLeft - deltaYAlongTop * deltaXAlongLeft;

  let perspectiveX: number;
  let perspectiveY: number;
  if (determinant === 0) {
    perspectiveX = 0;
    perspectiveY = 0;
  } else {
    perspectiveX = (sumX * deltaYAlongLeft - sumY * deltaXAlongLeft) / determinant;
    perspectiveY = (deltaXAlongTop * sumY - deltaYAlongTop * sumX) / determinant;
  }

  // 3x3 in row-major. Maps unit square (0,0),(1,0),(1,1),(0,1) → destination quad.
  const a = destinationTopRightX - destinationTopLeftX + perspectiveX * destinationTopRightX;
  const b = destinationBottomLeftX - destinationTopLeftX + perspectiveY * destinationBottomLeftX;
  const c = destinationTopLeftX;
  const d = destinationTopRightY - destinationTopLeftY + perspectiveX * destinationTopRightY;
  const e = destinationBottomLeftY - destinationTopLeftY + perspectiveY * destinationBottomLeftY;
  const f = destinationTopLeftY;
  const g = perspectiveX;
  const h = perspectiveY;
  const i = 1;

  // Compose with a scale that turns source-pixel coords into unit-square coords:
  // each input column corresponding to x is divided by sourceWidth, y by sourceHeight.
  return [
    a / sourceWidth,
    b / sourceHeight,
    c,
    d / sourceWidth,
    e / sourceHeight,
    f,
    g / sourceWidth,
    h / sourceHeight,
    i,
  ];
}

// Apply a row-major 3x3 homography to a 2D point (using homogeneous coords).
function applyHomography(
  matrixRowMajor: readonly [number, number, number, number, number, number, number, number, number],
  point: Vector2,
): Vector2 {
  const [a, b, c, d, e, f, g, h, i] = matrixRowMajor;
  const w = g * point[0] + h * point[1] + i;
  return [(a * point[0] + b * point[1] + c) / w, (d * point[0] + e * point[1] + f) / w];
}

function invertMatrix3Row(
  matrixRowMajor: readonly [number, number, number, number, number, number, number, number, number],
): [number, number, number, number, number, number, number, number, number] {
  const [a, b, c, d, e, f, g, h, i] = matrixRowMajor;
  const cofactor00 = e * i - f * h;
  const cofactor01 = f * g - d * i;
  const cofactor02 = d * h - e * g;
  const cofactor10 = c * h - b * i;
  const cofactor11 = a * i - c * g;
  const cofactor12 = b * g - a * h;
  const cofactor20 = b * f - c * e;
  const cofactor21 = c * d - a * f;
  const cofactor22 = a * e - b * d;
  const determinant = a * cofactor00 + b * cofactor01 + c * cofactor02;
  if (determinant === 0) {
    throw new Error("Homography matrix is singular and cannot be inverted.");
  }
  const inverseDeterminant = 1 / determinant;
  return [
    cofactor00 * inverseDeterminant,
    cofactor10 * inverseDeterminant,
    cofactor20 * inverseDeterminant,
    cofactor01 * inverseDeterminant,
    cofactor11 * inverseDeterminant,
    cofactor21 * inverseDeterminant,
    cofactor02 * inverseDeterminant,
    cofactor12 * inverseDeterminant,
    cofactor22 * inverseDeterminant,
  ];
}

// Map a viewport-pixel point (relative to the element's transform origin, i.e.
// its un-transformed top-left in viewport coords) back to source-pixel coords
// inside the un-transformed (sourceWidth × sourceHeight) rectangle. Useful for
// pointer interaction with the perspective-warped overlay.
export function inverseProjectViewportPoint(
  viewportPoint: Vector2,
  sourceWidth: number,
  sourceHeight: number,
  destination: ProjectedCorners,
): Vector2 {
  const forward = solveHomographyToQuad(sourceWidth, sourceHeight, destination);
  const inverse = invertMatrix3Row(forward);
  return applyHomography(inverse, viewportPoint);
}

// CSS matrix3d that warps an element of (sourceWidth × sourceHeight) pixels,
// laid out at transform-origin (0, 0), so its four corners land on the four
// destination points (in pixels relative to the same fixed positioning
// origin). The resulting transform is a pure 2D homography embedded in 4x4
// (z column / row are identity), and CSS matrix3d() takes column-major.
export function computeCssMatrix3d(
  sourceWidth: number,
  sourceHeight: number,
  destination: ProjectedCorners,
): string {
  const [a, b, c, d, e, f, g, h, i] = solveHomographyToQuad(sourceWidth, sourceHeight, destination);

  // Row-major 3x3 → column-major 4x4 with identity in z:
  //   [a b 0 c]
  //   [d e 0 f]
  //   [0 0 1 0]
  //   [g h 0 i]
  // matrix3d takes 16 values, columns first.
  const columnMajor = [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i];
  return `matrix3d(${columnMajor.join(",")})`;
}
