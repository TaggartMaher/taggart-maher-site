// Placeholder "user screen content" — what the React DOM-to-texture pipeline
// will eventually feed in (Phase D). For now this is a procedural test
// pattern: a bright rectangle that cycles through the four corners every
// four seconds. Direction of bounce light around the scene tracks the
// rectangle, giving a fast visual check that the position-pass math is wired
// up correctly. The pattern doubles as the Phase F debug-menu corner test.
//
// The canvas aspect mirrors the Blender screen plane (width 0.569m / height
// 0.35m ≈ 1.626) so the placeholder isn't visually pre-distorted relative to
// the live DOM target.

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 315;
const CYCLE_DURATION_MS = 4000;
const CORNERS_PER_CYCLE = 4;

export function createScreenContentCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  return canvas;
}

export function drawScreenContent(context: CanvasRenderingContext2D, elapsedMs: number): void {
  const { width, height } = context.canvas;

  // Dim background — gives the bounce light something subtle to sample even
  // when the corner indicator is far away.
  context.fillStyle = "#1a1a1a";
  context.fillRect(0, 0, width, height);

  const corners: ReadonlyArray<{ x: number; y: number; color: string; label: string }> = [
    { x: 0, y: 0, color: "#ff3b30", label: "TL" },
    { x: width / 2, y: 0, color: "#34c759", label: "TR" },
    { x: width / 2, y: height / 2, color: "#007aff", label: "BR" },
    { x: 0, y: height / 2, color: "#ffcc00", label: "BL" },
  ];

  const cornerIndex =
    Math.floor(elapsedMs / (CYCLE_DURATION_MS / CORNERS_PER_CYCLE)) % CORNERS_PER_CYCLE;
  const activeCorner = corners[cornerIndex];

  context.fillStyle = activeCorner.color;
  context.fillRect(activeCorner.x, activeCorner.y, width / 2, height / 2);

  context.fillStyle = "#ffffff";
  context.font = `${Math.floor(height * 0.18)}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(activeCorner.label, width / 2, height / 2);
}
