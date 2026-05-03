import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { detectHtmlInCanvasSupport } from "./htmlInCanvas";
import {
  rasterizerFps,
  rasterizerFpsEcoMode,
  screenDimensions,
  screenProjectedCorners,
} from "../config";
import type { PerfMetrics } from "./perfMetrics";
import {
  computeCssMatrix3d,
  inverseProjectViewportPoint,
  type ProjectedCorners,
  type Vector2,
} from "../screenRect";
import type { DebugSettings } from "../debug/debugSettings";
import "./screenOverlay.css";

// Resolution of the offscreen canvas that backs the screen-content texture.
// The bounce light dual-Kawase-blurs this texture before multiplying it
// into the emitter, so high resolution gets blurred away — width is
// sized roughly to the on-screen pixel width of the screen plane at
// common viewport sizes. Height keeps the screen plane's true world
// aspect so the bounce-light texture maps without distortion.
const TEXTURE_WIDTH = 1920 / 2;
const TEXTURE_HEIGHT = Math.round(
  (TEXTURE_WIDTH * screenDimensions.heightMeters) / screenDimensions.widthMeters,
);
// Eco-mode texture dimensions. Halving each axis cuts the GPU upload
// cost ~4× and shrinks every level of the dual-Kawase blur chain that
// the static + steam compositors run on the texture. The foreignObject
// SVG is still rasterized at the full natural size and downscaled by
// drawImage, so the on-page surface layout doesn't change — only the
// bounce-light source resolution does, which the heavy blur masks.
const TEXTURE_WIDTH_ECO_MODE = Math.round(TEXTURE_WIDTH / 2);
const TEXTURE_HEIGHT_ECO_MODE = Math.round(TEXTURE_HEIGHT / 2);

// Natural pixel size of the un-transformed overlay. The matrix3d transform
// warps these pixels onto the projected screen quad in viewport space.
// Width is sized so HTML content lays out at a reasonable resolution;
// height preserves the plane's real-world aspect so square texture pixels
// stay square once projected.
const OVERLAY_NATURAL_WIDTH = 1600;
const OVERLAY_NATURAL_HEIGHT = Math.round(
  (OVERLAY_NATURAL_WIDTH * screenDimensions.heightMeters) / screenDimensions.widthMeters,
);

const SQUARE_FRACTION = 1 / 5;

// Cached concatenation of every CSS rule in document.styleSheets,
// inlined into each captured SVG so the rasterized DOM lays out the
// same way it does on the page. Building this is the single biggest
// per-call cost of the foreignObject path on a rich page (hundreds of
// CSS rules). Cache invalidates when the count of stylesheets changes
// — sufficient for HMR / async CSS chunk loads, which is the only
// realistic source of changes after first paint.
let cachedStyleSheetText: string | null = null;
let cachedStyleSheetCount = -1;
function getInlinedStyleSheetText(): string {
  if (cachedStyleSheetText !== null && cachedStyleSheetCount === document.styleSheets.length) {
    return cachedStyleSheetText;
  }
  cachedStyleSheetCount = document.styleSheets.length;
  cachedStyleSheetText = Array.from(document.styleSheets)
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
  return cachedStyleSheetText;
}

interface ScreenOverlayProps {
  settings: DebugSettings;
  onSettingsChange: (next: DebugSettings) => void;
  // Canvas the compositor will sample as the screen-content texture. We
  // assign it on mount so the parent's ref points at our offscreen canvas.
  textureCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Monotonic revision counter we increment every time we paint the
  // texture canvas. The compositors compare their last-uploaded value
  // and skip texImage2D when nothing has changed since.
  textureRevisionRef: React.RefObject<number>;
  // Live perf-metrics ref. The rasterization loop publishes its
  // sliding-window FPS into `rasterizerFps` so the debug menu can show
  // it; nothing in this component reads from it.
  perfMetricsRef: React.RefObject<PerfMetrics>;
  // The DOM mounted inside the simulated screen — desktop emulator
  // (Portfolio) in FULL_MODE, the lite interface in LIGHTWEIGHT_MODE.
  // Stays mounted even when image/color overlays are showing, because
  // the offscreen texture-paint pass uses it as the foreignObject
  // rasterization source.
  children: ReactNode;
}

// Serialize an HTMLElement into a canvas via SVG <foreignObject>. The
// element's own markup plus the page's full inlined stylesheet text are
// dropped into a self-contained SVG, then decoded as an image and
// drawn to the destination canvas. The decode happens off the main
// thread, so the per-call work that competes with React/pointer-event
// handling is dominated by the (cached) stylesheet inlining and the
// XML serialization — both bulk operations that the browser optimizes
// well, unlike a per-element computed-style walk.
//
// Cross-origin fonts (Google Fonts) won't load through this path; the
// resulting bounce-light texture renders with system-font fallbacks.
// That's fine — the texture is dual-Kawase-blurred to mush before it
// reaches the emitter, so the font fallback is invisible. The on-page
// Portfolio still uses the real fonts via normal CSS.
async function renderHtmlElementToCanvas(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const styleText = getInlinedStyleSheetText();

  // foreignObject doesn't preserve a serialized scroll container's UA
  // scrollTop / scrollLeft — without compensation, the rasterized
  // image always shows content scrolled to the top. Lite mode (where
  // the surface scrolls inside the screen rect) needs this to track
  // user scroll. Portfolio mode never scrolls the surface container
  // (windows are absolutely positioned), so the fast path skips the
  // clone entirely and the per-call cost stays the same as before.
  const scrollLeft = element.scrollLeft;
  const scrollTop = element.scrollTop;
  const serializer = new XMLSerializer();
  let elementMarkup: string;
  if (scrollLeft === 0 && scrollTop === 0) {
    elementMarkup = serializer.serializeToString(element);
  } else {
    // Detached deep clone so we can override `overflow` (so the
    // children visibly extend past the viewport) and apply the
    // negative-scroll translate without touching the live element.
    // The CSS class on the clone still resolves `position: absolute`
    // against our outer wrapper, so the layout inside is unchanged.
    const elementClone = element.cloneNode(true) as HTMLElement;
    elementClone.style.overflow = "visible";
    elementClone.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    elementClone.style.transformOrigin = "top left";
    elementMarkup = serializer.serializeToString(elementClone);
  }

  // Visible viewport size — what the live element clips to (offsetWidth
  // × offsetHeight). The surface container sits inside a matrix3d-
  // projected parent, so getBoundingClientRect would return post-
  // projection viewport pixels; offsetWidth/Height are the natural-
  // space dimensions windows / square overlays are positioned against.
  const visibleWidth = Math.max(1, element.offsetWidth);
  const visibleHeight = Math.max(1, element.offsetHeight);
  // Inner content size including overflowed (scrolled) area. The SVG
  // viewport is sized to this so CSS viewport-percentage units (vh /
  // vw) inside the foreignObject resolve to the same values they had
  // in the live document — without it, content using `min-height:
  // 100vh` (the lite-mode shell) renders shorter in the capture than
  // it does on the page, and scrolling near the bottom exposes the
  // black wrapper background as a phantom area beyond the content.
  const innerWidth = Math.max(visibleWidth, element.scrollWidth);
  const innerHeight = Math.max(visibleHeight, element.scrollHeight);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${innerWidth}" height="${innerHeight}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${innerWidth}px;height:${innerHeight}px;background:#000;overflow:hidden;">` +
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
  // The clone's transform aligned the visible scroll viewport to the
  // image's top-left, so taking visibleWidth × visibleHeight from there
  // and stretching to the texture canvas reproduces what the user sees
  // on the page — no scaling artifacts even when the SVG is rendered
  // at the larger inner size.
  context.drawImage(
    image,
    0,
    0,
    visibleWidth,
    visibleHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

export function ScreenOverlay({
  settings,
  onSettingsChange,
  textureCanvasRef,
  textureRevisionRef,
  perfMetricsRef,
  children,
}: ScreenOverlayProps) {
  const surfaceContainerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<{ url: string; image: HTMLImageElement } | null>(null);
  // Dirty flag for the surface-mode rAF loop. When true the next tick
  // re-rasterizes; when false the tick only repaints the square overlay
  // on top of the existing snapshot. Listeners and observers below set
  // this true on any change; the loop clears it before each snapshot.
  // Initial true so the first paint always runs.
  const dirtyRef = useRef(true);
  // Set by the surface-mode rAF loop so the visibilitychange effect
  // below can wake it back up after a hidden-tab park. Null in image /
  // color modes, where there's no loop to resume.
  const wakeupRef = useRef<(() => void) | null>(null);
  // Mirror settings into a ref so the rAF rasterization loop can read
  // the latest values (square pos, colors) without tearing down on
  // every settings change — the loop only needs to restart when the
  // background MODE switches.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Allocate the texture canvas on mount, and re-allocate when eco
  // mode toggles so the smaller eco-size canvas / GPU texture takes
  // effect immediately. Re-running this effect bumps the revision so
  // the compositors notice the new canvas and re-upload.
  useLayoutEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = settings.ecoMode ? TEXTURE_WIDTH_ECO_MODE : TEXTURE_WIDTH;
    canvas.height = settings.ecoMode ? TEXTURE_HEIGHT_ECO_MODE : TEXTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    internalCanvasRef.current = canvas;
    textureCanvasRef.current = canvas;
    textureRevisionRef.current = (textureRevisionRef.current ?? 0) + 1;
    // Force the rasterizer to capture into the freshly-allocated
    // canvas on its next tick — otherwise the bounce light shows the
    // initial black fill until the next external dirty signal.
    dirtyRef.current = true;
    return () => {
      if (textureCanvasRef.current === canvas) {
        textureCanvasRef.current = null;
      }
    };
  }, [textureCanvasRef, textureRevisionRef, settings.ecoMode]);

  // One-time log if the user has Chrome's HTML-in-Canvas flag enabled —
  // the compositor would benefit from `texElementImage2D`, but wiring
  // it requires moving the Portfolio DOM into the compositor canvas.
  useEffect(() => {
    if (detectHtmlInCanvasSupport()) {
      console.info(
        "[overlay] HTML-in-Canvas (texElementImage2D) detected. Faster path " +
          "available — currently using the foreignObject rasterizer. See " +
          "src/composite/htmlInCanvas.ts.",
      );
    }
  }, []);

  // Drive the screen-content texture. Three modes:
  //   - Image background: load once, paint once.
  //   - Color background: paint once.
  //   - Surface (default): rAF loop, single in-flight foreignObject
  //     snapshot, so the bounce-light texture tracks live UI changes
  //     (drag, focus, window state). A dirty flag gates the snapshot
  //     so idle frames skip the capture entirely, and an FPS throttle
  //     (`rasterizerFps`, or `rasterizerFpsEcoMode` when the user has
  //     eco mode on) caps the rasterizer's worst-case CPU cost.
  // The square overlay is painted on top of whichever background is
  // current — for the rAF mode that means it gets re-painted after
  // each surface snapshot.
  useEffect(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let cancelled = false;
    let rafId = 0;
    let rasterizing = false;

    function bumpRevision(): void {
      textureRevisionRef.current = (textureRevisionRef.current ?? 0) + 1;
    }

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

    async function snapshotSurface(): Promise<void> {
      if (rasterizing) return;
      const source = surfaceContainerRef.current;
      if (!source || !canvas) return;
      rasterizing = true;
      try {
        await renderHtmlElementToCanvas(source, canvas);
      } catch (error) {
        if (!context) return;
        console.warn("[overlay] failed to rasterize surface DOM:", error);
        context.fillStyle = "#000";
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
        bumpRevision();
      })();
    } else if (settings.colorBackgroundEnabled) {
      context.fillStyle = settings.colorBackgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      paintSquare();
      bumpRevision();
    } else {
      // Surface mode — drive a self-paced rAF loop. The next frame
      // schedules only after the previous snapshot resolves, so we
      // never queue more than one foreignObject capture at a time. The
      // dirty flag gates the snapshot: in steady-state idle the loop
      // only re-paints the square overlay onto the previous snapshot,
      // which is effectively free.
      dirtyRef.current = true;
      const container = surfaceContainerRef.current;
      let lastRasterizationTimestamp = 0;
      // Sliding-window timestamps (ms) of recent successful rasterizations.
      // Same shape as the compositor's displayFps measurement: count
      // entries within the last second, divide by elapsed window.
      const recentRasterizationTimestamps: number[] = [];
      function markDirty(): void {
        dirtyRef.current = true;
      }
      function evictOldRasterizationTimestamps(nowMs: number): void {
        while (
          recentRasterizationTimestamps.length > 0 &&
          nowMs - recentRasterizationTimestamps[0] > 1000
        ) {
          recentRasterizationTimestamps.shift();
        }
      }
      function publishRasterizerFps(nowMs: number): void {
        evictOldRasterizationTimestamps(nowMs);
        const sampleCount = recentRasterizationTimestamps.length;
        let rasterizerFps = 0;
        if (sampleCount >= 2) {
          const elapsedSeconds = (nowMs - recentRasterizationTimestamps[0]) / 1000;
          if (elapsedSeconds > 0) {
            rasterizerFps = (sampleCount - 1) / elapsedSeconds;
          }
        }
        if (perfMetricsRef.current) {
          perfMetricsRef.current.rasterizerFps = rasterizerFps;
        }
      }
      function recordRasterization(timestampMs: number): void {
        recentRasterizationTimestamps.push(timestampMs);
        publishRasterizerFps(timestampMs);
      }
      const containerEventNames = [
        "pointermove",
        "pointerdown",
        "pointerup",
        "focusin",
        "focusout",
        "scroll",
      ] as const;
      const captureListenerOptions: AddEventListenerOptions = { capture: true };
      let mutationObserver: MutationObserver | null = null;
      let resizeObserver: ResizeObserver | null = null;
      if (container) {
        mutationObserver = new MutationObserver(markDirty);
        mutationObserver.observe(container, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        resizeObserver = new ResizeObserver(markDirty);
        resizeObserver.observe(container);
        for (const eventName of containerEventNames) {
          container.addEventListener(eventName, markDirty, captureListenerOptions);
        }
      }

      function tick(): void {
        if (cancelled) return;
        // Park when the tab is hidden — the foreignObject capture's
        // image-decode work is still scheduled even when rAF is
        // throttled, and there's nothing visible to display. A
        // visibilitychange listener at component scope wakes us back
        // up by calling wakeupRef.
        if (document.hidden) {
          rafId = 0;
          return;
        }
        const now = performance.now();
        // Refresh rasterizerFps every tick so it decays toward 0 during
        // idle — recordRasterization alone wouldn't update it once
        // snapshots stop arriving.
        publishRasterizerFps(now);
        // Eco mode lowers the rasterizer's target FPS; the per-call
        // foreignObject cost is unchanged but each capture has more
        // breathing room between it and the next.
        const effectiveFps = settingsRef.current.ecoMode ? rasterizerFpsEcoMode : rasterizerFps;
        const frameIntervalMs = 1000 / effectiveFps;
        if (dirtyRef.current && now - lastRasterizationTimestamp >= frameIntervalMs) {
          // Clear the flag BEFORE awaiting the snapshot so any change
          // observed during the in-flight capture re-marks dirty and is
          // picked up on the next tick.
          dirtyRef.current = false;
          lastRasterizationTimestamp = now;
          void snapshotSurface().then(() => {
            if (cancelled) return;
            paintSquare();
            bumpRevision();
            recordRasterization(performance.now());
            rafId = requestAnimationFrame(tick);
          });
        } else {
          paintSquare();
          rafId = requestAnimationFrame(tick);
        }
      }
      function wakeup(): void {
        if (cancelled || rafId !== 0) return;
        if (document.hidden) return;
        // DOM may have mutated while we were parked (route change,
        // clock tick, etc.) — force a re-rasterization on resume.
        dirtyRef.current = true;
        rafId = requestAnimationFrame(tick);
      }
      wakeupRef.current = wakeup;
      rafId = requestAnimationFrame(tick);

      return () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        wakeupRef.current = null;
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        if (container) {
          for (const eventName of containerEventNames) {
            container.removeEventListener(eventName, markDirty, captureListenerOptions);
          }
        }
      };
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
    // Re-run the rAF loop when eco mode toggles so the closure picks up
    // the freshly-allocated texture canvas (the layout effect above
    // swaps `internalCanvasRef.current` to a new half-size canvas).
    settings.ecoMode,
    perfMetricsRef,
    textureRevisionRef,
  ]);

  // The square overlay sits outside the Portfolio container, so the
  // container's pointer/mutation observers do not see square drags. Mark
  // the rAF loop dirty whenever a square-affecting setting changes so
  // the next tick re-rasterizes — otherwise the previous square pixels
  // would ghost on top of the cached snapshot.
  useEffect(() => {
    dirtyRef.current = true;
  }, [
    settings.squareEnabled,
    settings.squareColor,
    settings.squareNormalizedX,
    settings.squareNormalizedY,
  ]);

  // Resume the surface-mode rAF loop when the tab becomes visible.
  // wakeupRef is null in image / color background modes (no loop to
  // wake) — the listener is then a no-op.
  useEffect(() => {
    function handleVisibilityChange(): void {
      if (!document.hidden) wakeupRef.current?.();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Recompute the perspective transform on viewport size change. The
  // projected-corner positions are in normalized [0, 1] viewport coords;
  // multiply by current pixel dimensions to get destination pixels for
  // the homography solver.
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window === "undefined" ? 1 : window.innerWidth,
    height: typeof window === "undefined" ? 1 : window.innerHeight,
  }));
  useEffect(() => {
    function handleResize(): void {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const viewportProjectedCornersInPixels: ProjectedCorners = useMemo(() => {
    const widthInPixels = viewportSize.width;
    const heightInPixels = viewportSize.height;
    const toPixels = (corner: Vector2): Vector2 => [
      corner[0] * widthInPixels,
      corner[1] * heightInPixels,
    ];
    return {
      topLeft: toPixels(screenProjectedCorners.topLeft),
      topRight: toPixels(screenProjectedCorners.topRight),
      bottomRight: toPixels(screenProjectedCorners.bottomRight),
      bottomLeft: toPixels(screenProjectedCorners.bottomLeft),
    };
  }, [viewportSize.width, viewportSize.height]);

  const overlayTransform = useMemo(
    () =>
      computeCssMatrix3d(
        OVERLAY_NATURAL_WIDTH,
        OVERLAY_NATURAL_HEIGHT,
        viewportProjectedCornersInPixels,
      ),
    [viewportProjectedCornersInPixels],
  );
  // Square drag handling — pointer-based so it works for mouse and touch.
  // Pointer viewport coords are inverse-projected back to the overlay's
  // un-transformed natural-pixel space, then divided by the natural width
  // and height to give a stable normalized position (0..1) inside the
  // logical screen content, independent of the perspective warp.
  function handleSquarePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    const overlay = overlayRef.current;
    if (!overlay) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const sideFractionX = SQUARE_FRACTION;
    const sideFractionY = (SQUARE_FRACTION * OVERLAY_NATURAL_WIDTH) / OVERLAY_NATURAL_HEIGHT;

    function pointerToNormalized(clientX: number, clientY: number): Vector2 {
      // The overlay element is position: fixed at (0, 0) with
      // transform-origin at its top-left, so client coords are already
      // in the same frame as the matrix3d projection — no
      // getBoundingClientRect needed.
      const naturalPoint = inverseProjectViewportPoint(
        [clientX, clientY],
        OVERLAY_NATURAL_WIDTH,
        OVERLAY_NATURAL_HEIGHT,
        viewportProjectedCornersInPixels,
      );
      return [naturalPoint[0] / OVERLAY_NATURAL_WIDTH, naturalPoint[1] / OVERLAY_NATURAL_HEIGHT];
    }

    const startNormalized = pointerToNormalized(event.clientX, event.clientY);
    const offsetNormalizedX = startNormalized[0] - settings.squareNormalizedX;
    const offsetNormalizedY = startNormalized[1] - settings.squareNormalizedY;

    let latest = settings;

    function handleMove(moveEvent: PointerEvent): void {
      const pointerNormalized = pointerToNormalized(moveEvent.clientX, moveEvent.clientY);
      const nextX = Math.min(
        Math.max(pointerNormalized[0] - offsetNormalizedX, 0),
        1 - sideFractionX,
      );
      const nextY = Math.min(
        Math.max(pointerNormalized[1] - offsetNormalizedY, 0),
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
    left: 0,
    top: 0,
    width: `${OVERLAY_NATURAL_WIDTH}px`,
    height: `${OVERLAY_NATURAL_HEIGHT}px`,
    transformOrigin: "0 0",
    transform: overlayTransform,
  };

  // Natural overlay aspect equals the screen plane's real-world aspect
  // (the height was sized that way), so a true square in texture space
  // maps to a square in natural-pixel space too.
  const squareSideFractionY = (SQUARE_FRACTION * OVERLAY_NATURAL_WIDTH) / OVERLAY_NATURAL_HEIGHT;

  // showImage / showSquare drive the DOM-side rendering only; the
  // off-screen canvas-side painting (which feeds the bounce-light
  // texture) keys directly off imageBackgroundEnabled / squareEnabled
  // so the user can hide the on-screen overlay while still seeing the
  // composited bounce reflecting the image / square.
  const showImage = settings.imageBackgroundEnabled && !settings.hideImageOverlay;
  const showSquare = settings.squareEnabled && !settings.hideSquareOverlay;
  const showColor = settings.colorBackgroundEnabled;
  // The screen surface (Portfolio or LiteInterface) stays mounted
  // whenever there's no image/color background, even when the user has
  // hidden the page overlay — the offscreen texture-paint pass needs
  // its DOM as a source. visibility:hidden (vs display:none) keeps
  // layout + computed styles intact so snapDOM can rasterize the live
  // element.
  const surfaceMounted = !showImage && !showColor;
  const surfaceVisible = surfaceMounted && !settings.hidePageOverlay;
  // Drop the overlay's white fill when nothing visible should occlude
  // the composite, so the user can see the rendered scene through the
  // screen-rect area.
  const overlayHasVisibleContent = surfaceVisible || showImage || showColor;

  return (
    <div
      ref={overlayRef}
      className="screen-overlay"
      style={{
        ...overlayStyle,
        background: overlayHasVisibleContent ? undefined : "transparent",
      }}
    >
      {surfaceMounted && (
        <div
          ref={surfaceContainerRef}
          className="screen-overlay-content"
          style={surfaceVisible ? undefined : { visibility: "hidden" }}
        >
          {children}
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
      {showSquare && (
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
