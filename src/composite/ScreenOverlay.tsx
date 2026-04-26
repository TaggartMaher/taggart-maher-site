import { useEffect, useLayoutEffect, useRef } from "react";
import { detectHtmlInCanvasSupport } from "./htmlInCanvas";
import { Portfolio } from "../portfolio/Portfolio";
import { screenPlane, screenRect } from "../config";
import type { DebugSettings } from "../debug/debugSettings";
import "./screenOverlay.css";

// Resolution of the offscreen canvas that backs the screen-content texture.
// Width chosen to be roughly the on-screen pixel width of the screen plane
// at common viewport sizes; height keeps the screen plane's true world
// aspect so the bounce-light texture maps without distortion.
const TEXTURE_WIDTH = 4 * 1024;
const TEXTURE_HEIGHT = Math.round(
  (TEXTURE_WIDTH * screenPlane.heightMeters) / screenPlane.widthMeters,
);

const SQUARE_FRACTION = 1 / 5;

interface ScreenOverlayProps {
  settings: DebugSettings;
  onSettingsChange: (next: DebugSettings) => void;
  // Canvas the compositor will sample as the screen-content texture. We
  // assign it on mount so the parent's ref points at our offscreen canvas.
  textureCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

// Serialize an HTMLElement into a canvas via SVG <foreignObject>. The
// element's own styles plus all currently-loaded stylesheets are inlined
// so the rendered SVG is self-contained. Cross-origin images and external
// fonts won't load through this path — for the text-only Portfolio that's
// fine; richer screen content will need a different pipeline.
async function renderHtmlElementToCanvas(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const styleText = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        // Cross-origin sheets throw on cssRules access — skip them.
        return "";
      }
    })
    .join("\n");

  const serializer = new XMLSerializer();
  const elementMarkup = serializer.serializeToString(element);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${canvas.width}px;height:${canvas.height}px;background:#fafafa;overflow:hidden;">` +
    `<style>${styleText}</style>` +
    elementMarkup +
    `</div>` +
    `</foreignObject>` +
    `</svg>`;

  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("[overlay] foreignObject SVG image failed to load"));
    image.src = dataUrl;
  });

  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
}

export function ScreenOverlay({
  settings,
  onSettingsChange,
  textureCanvasRef,
}: ScreenOverlayProps) {
  const portfolioContainerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<{ url: string; image: HTMLImageElement } | null>(null);
  // Mirror settings into a ref so the rAF rasterization loop can read
  // the latest values (square pos, colors) without tearing down on
  // every settings change — the loop only needs to restart when the
  // background MODE switches.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Allocate the texture canvas on mount and expose it via the parent ref.
  useLayoutEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#fafafa";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    internalCanvasRef.current = canvas;
    textureCanvasRef.current = canvas;
    return () => {
      if (textureCanvasRef.current === canvas) {
        textureCanvasRef.current = null;
      }
    };
  }, [textureCanvasRef]);

  // One-time log if the user has Chrome's HTML-in-Canvas flag enabled —
  // the compositor would benefit from `texElementImage2D`, but wiring
  // it requires moving the Portfolio DOM into the compositor canvas.
  useEffect(() => {
    if (detectHtmlInCanvasSupport()) {
      console.info(
        "[overlay] HTML-in-Canvas (texElementImage2D) detected. Faster path " +
          "available — currently using the foreignObject fallback. See " +
          "src/composite/htmlInCanvas.ts.",
      );
    }
  }, []);

  // Drive the screen-content texture. Three modes:
  //   - Image background: load once, paint once.
  //   - Color background: paint once.
  //   - Portfolio (default): rAF loop, single in-flight snapshot, so
  //     the bounce-light texture tracks live UI changes (drag, focus,
  //     window state) at whatever rate the foreignObject pipeline can
  //     sustain.
  // The square overlay is painted on top of whichever background is
  // current — for the rAF mode that means it gets re-painted after
  // each Portfolio snapshot.
  useEffect(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let cancelled = false;
    let rafId = 0;
    let rasterizing = false;

    function paintSquare(): void {
      if (!canvas || !context) return;
      const current = settingsRef.current;
      if (!current.squareEnabled) return;
      const sideInPixels = canvas.width * SQUARE_FRACTION;
      const xInPixels = current.squareNormalizedX * canvas.width;
      const yInPixels = current.squareNormalizedY * canvas.height;
      context.fillStyle = current.squareColor;
      context.fillRect(xInPixels, yInPixels, sideInPixels, sideInPixels);
    }

    async function loadImageBackground(): Promise<void> {
      if (!canvas || !context) return;
      const current = settingsRef.current;
      let cached = loadedImageRef.current;
      if (!cached || cached.url !== current.imageBackgroundUrl) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("[overlay] background image failed to load"));
          image.src = current.imageBackgroundUrl;
        });
        if (cancelled) return;
        cached = { url: current.imageBackgroundUrl, image };
        loadedImageRef.current = cached;
      }
      context.drawImage(cached.image, 0, 0, canvas.width, canvas.height);
    }

    async function snapshotPortfolio(): Promise<void> {
      if (rasterizing) return;
      const source = portfolioContainerRef.current;
      if (!source || !canvas) return;
      rasterizing = true;
      try {
        await renderHtmlElementToCanvas(source, canvas);
      } catch (error) {
        if (!context) return;
        console.warn("[overlay] failed to rasterize Portfolio DOM:", error);
        context.fillStyle = "#fafafa";
        context.fillRect(0, 0, canvas.width, canvas.height);
      } finally {
        rasterizing = false;
      }
    }

    if (settings.imageBackgroundEnabled) {
      void (async () => {
        await loadImageBackground();
        if (cancelled || !context) return;
        if (settingsRef.current.colorBackgroundEnabled) {
          context.fillStyle = settingsRef.current.colorBackgroundColor;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        paintSquare();
      })();
    } else if (settings.colorBackgroundEnabled) {
      context.fillStyle = settings.colorBackgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      paintSquare();
    } else {
      // Portfolio mode — drive a self-paced rAF loop. The next frame
      // schedules only after the previous snapshot resolves, so we
      // never queue more than one foreignObject decode at a time.
      function tick(): void {
        if (cancelled) return;
        void snapshotPortfolio().then(() => {
          if (cancelled) return;
          paintSquare();
          rafId = requestAnimationFrame(tick);
        });
      }
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    settings.imageBackgroundEnabled,
    settings.imageBackgroundUrl,
    settings.colorBackgroundEnabled,
    settings.colorBackgroundColor,
  ]);

  // Square drag handling — pointer-based so it works for mouse and touch.
  // Coordinates are converted to normalized [0, 1] relative to the overlay
  // div so they're independent of viewport size.
  function handleSquarePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    const overlay = overlayRef.current;
    if (!overlay) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const overlayRectInPixels = overlay.getBoundingClientRect();
    const sideFractionX = SQUARE_FRACTION;
    const sideFractionY =
      (SQUARE_FRACTION * overlayRectInPixels.width) / overlayRectInPixels.height;

    // Cursor offset within the square at drag start, normalized.
    const offsetNormalizedX =
      (event.clientX - overlayRectInPixels.left) / overlayRectInPixels.width -
      settings.squareNormalizedX;
    const offsetNormalizedY =
      (event.clientY - overlayRectInPixels.top) / overlayRectInPixels.height -
      settings.squareNormalizedY;

    let latest = settings;

    function handleMove(moveEvent: PointerEvent): void {
      const overlayRect = overlay!.getBoundingClientRect();
      const pointerNormalizedX = (moveEvent.clientX - overlayRect.left) / overlayRect.width;
      const pointerNormalizedY = (moveEvent.clientY - overlayRect.top) / overlayRect.height;
      const nextX = Math.min(
        Math.max(pointerNormalizedX - offsetNormalizedX, 0),
        1 - sideFractionX,
      );
      const nextY = Math.min(
        Math.max(pointerNormalizedY - offsetNormalizedY, 0),
        1 - sideFractionY,
      );
      latest = { ...latest, squareNormalizedX: nextX, squareNormalizedY: nextY };
      onSettingsChange(latest);
    }

    function handleUp(): void {
      target.releasePointerCapture(event.pointerId);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  const overlayStyle: React.CSSProperties = {
    left: `${screenRect.left * 100}%`,
    top: `${screenRect.top * 100}%`,
    width: `${screenRect.width * 100}%`,
    height: `${screenRect.height * 100}%`,
  };

  // The square's height in CSS is computed so that it remains a square in
  // the texture's normalized space — which means a rectangle in the
  // (perspectively projected) overlay. This keeps the bounce-light shape
  // and the visible square in agreement.
  const squareSideFractionY =
    overlayRef.current && overlayRef.current.getBoundingClientRect().height > 0
      ? (SQUARE_FRACTION * overlayRef.current.getBoundingClientRect().width) /
        overlayRef.current.getBoundingClientRect().height
      : SQUARE_FRACTION;

  const showImage = settings.imageBackgroundEnabled;
  const showColor = settings.colorBackgroundEnabled;
  // Portfolio stays mounted whenever there's no image/color background,
  // even when the user has hidden the page overlay — the offscreen
  // texture-paint pass needs its DOM as a source. visibility:hidden
  // (vs display:none) keeps layout + computed styles intact for the
  // foreignObject rasterization to work.
  const portfolioMounted = !showImage && !showColor;
  const portfolioVisible = portfolioMounted && !settings.hidePageOverlay;
  // Drop the overlay's white fill when nothing visible should occlude
  // the composite, so the user can see the rendered scene through the
  // screen-rect area.
  const overlayHasVisibleContent = portfolioVisible || showImage || showColor;

  return (
    <div
      ref={overlayRef}
      className="screen-overlay"
      style={{
        ...overlayStyle,
        background: overlayHasVisibleContent ? undefined : "transparent",
      }}
    >
      {portfolioMounted && (
        <div
          ref={portfolioContainerRef}
          className="screen-overlay-content"
          style={portfolioVisible ? undefined : { visibility: "hidden" }}
        >
          <Portfolio />
        </div>
      )}
      {showImage && (
        <img
          className="screen-overlay-image"
          src={settings.imageBackgroundUrl}
          alt=""
          draggable={false}
        />
      )}
      {showColor && (
        <div
          className="screen-overlay-color"
          style={{ background: settings.colorBackgroundColor }}
        />
      )}
      {settings.squareEnabled && (
        <div
          className="screen-overlay-square"
          style={{
            left: `${settings.squareNormalizedX * 100}%`,
            top: `${settings.squareNormalizedY * 100}%`,
            width: `${SQUARE_FRACTION * 100}%`,
            height: `${squareSideFractionY * 100}%`,
            background: settings.squareColor,
          }}
          onPointerDown={handleSquarePointerDown}
        />
      )}
    </div>
  );
}
