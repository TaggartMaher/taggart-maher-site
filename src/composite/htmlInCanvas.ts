// Feature-detect Chrome's experimental HTML-in-Canvas API
// (chrome://flags/#html-in-canvas as of April 2026). When present,
// `texElementImage2D` uploads a DOM element directly into a WebGL
// texture without a 2D-canvas intermediate or SVG round-trip — by far
// the fastest DOM-to-texture path.
//
// We don't activate the path yet: it requires the rasterized DOM to
// live as a child of a `<canvas layoutsubtree>`, which would mean
// moving the Portfolio out of `<ScreenOverlay>` and into the compositor
// canvas. Detection-only for now so we can warn loudly when a user has
// the flag on and would benefit from us doing that work.

interface TexElementImage2DContext {
  texElementImage2D: (
    target: number,
    level: number,
    internalformat: number,
    format: number,
    type: number,
    element: HTMLElement,
  ) => void;
}

let cached: boolean | null = null;

export function detectHtmlInCanvasSupport(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined") {
    cached = false;
    return cached;
  }
  const probe = document.createElement("canvas");
  const gl = probe.getContext("webgl2");
  cached = Boolean(
    gl && typeof (gl as unknown as TexElementImage2DContext).texElementImage2D === "function",
  );
  return cached;
}
