import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { snapdom, preCache } from "@zumer/snapdom";
import { detectHtmlInCanvasSupport } from "./htmlInCanvas";
import {
  ecoModeRasterizerScaleMultiplier,
  rasterizerFps,
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

// Natural pixel size of the un-transformed overlay. The matrix3d transform
// warps these pixels onto the projected screen quad in viewport space.
// Width is sized so HTML content lays out at a reasonable resolution;
// height preserves the plane's real-world aspect so square texture pixels
// stay square once projected.
const OVERLAY_NATURAL_WIDTH = 1600;
const OVERLAY_NATURAL_HEIGHT = Math.round(
  (OVERLAY_NATURAL_WIDTH * screenDimensions.heightMeters) / screenDimensions.widthMeters,
);

// snapDOM rasterizes the live element at element-natural size by default
// (1600px wide). The texture canvas is smaller, so we'd then drawImage-
// downscale. Asking snapDOM for a smaller raster directly cuts the SVG
// decode cost roughly quadratically, with no perceptual loss because the
// bounce light is dual-Kawase-blurred downstream.
const RASTERIZER_SCALE = TEXTURE_WIDTH / OVERLAY_NATURAL_WIDTH;

const SQUARE_FRACTION = 1 / 5;

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
  // the offscreen texture-paint pass uses it as a snapDOM source.
  children: ReactNode;
}

// Rasterize an HTMLElement onto the supplied texture canvas via snapDOM.
// snapDOM clones the live element into a self-contained SVG with computed
// styles and (with embedFonts) the relevant @font-face data inlined, so
// cross-origin Google Fonts render correctly. cache: 'full' keeps the
// inlined CSS / font URIs across captures so steady-state cost is
// dominated by the SVG decode rather than style discovery.
async function renderHtmlElementToCanvas(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
  rasterScale: number,
): Promise<void> {
  const result = await snapdom(element, {
    fast: true,
    embedFonts: true,
    cache: "full",
    backgroundColor: "#fafafa",
    scale: rasterScale,
  });
  const sourceCanvas = await result.toCanvas();
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
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
  // Tracks the surface container element identity that snapDOM has
  // already pre-cached for. Re-runs preCache if the container ref points
  // at a different element (mode toggles cause remounts).
  const precachedContainerRef = useRef<HTMLElement | null>(null);
  // Dirty flag for the surface-mode rAF loop. When true the next tick
  // re-rasterizes; when false the tick only repaints the square overlay
  // on top of the existing snapshot. Listeners and observers below set
  // this true on any change; the loop clears it before each snapshot.
  // Initial true so the first paint always runs.
  const dirtyRef = useRef(true);
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
    textureRevisionRef.current = (textureRevisionRef.current ?? 0) + 1;
    return () => {
      if (textureCanvasRef.current === canvas) {
        textureCanvasRef.current = null;
      }
    };
  }, [textureCanvasRef, textureRevisionRef]);

  // One-time log if the user has Chrome's HTML-in-Canvas flag enabled —
  // the compositor would benefit from `texElementImage2D`, but wiring
  // it requires moving the Portfolio DOM into the compositor canvas.
  useEffect(() => {
    if (detectHtmlInCanvasSupport()) {
      console.info(
        "[overlay] HTML-in-Canvas (texElementImage2D) detected. Faster path " +
          "available — currently using the snapDOM rasterizer. See " +
          "src/composite/htmlInCanvas.ts.",
      );
    }
  }, []);

  // Drive the screen-content texture. Three modes:
  //   - Image background: load once, paint once.
  //   - Color background: paint once.
  //   - Portfolio (default): rAF loop, single in-flight snapshot, so
  //     the bounce-light texture tracks live UI changes (drag, focus,
  //     window state). A dirty flag gates the snapshot so idle frames
  //     skip the snapDOM capture entirely, and an FPS throttle with a
  //     low-power fallback caps the rasterizer's worst-case CPU cost.
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

    async function snapshotSurface(rasterScale: number): Promise<void> {
      if (rasterizing) return;
      const source = surfaceContainerRef.current;
      if (!source || !canvas) return;
      rasterizing = true;
      try {
        if (precachedContainerRef.current !== source) {
          precachedContainerRef.current = source;
          await preCache(source, { embedFonts: true });
          if (cancelled) return;
        }
        await renderHtmlElementToCanvas(source, canvas, rasterScale);
      } catch (error) {
        if (!context) return;
        console.warn("[overlay] failed to rasterize surface DOM:", error);
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
      // never queue more than one snapDOM capture at a time. The dirty
      // flag gates the snapshot: in steady-state idle the loop only
      // re-paints the square overlay onto the previous snapshot, which
      // is effectively free.
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
      const containerEventOptions: AddEventListenerOptions = { capture: true };
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
          container.addEventListener(eventName, markDirty, containerEventOptions);
        }
      }

      function tick(): void {
        if (cancelled) return;
        const now = performance.now();
        // Refresh rasterizerFps every tick so it decays toward 0 during
        // idle — recordRasterization alone wouldn't update it once
        // snapshots stop arriving.
        publishRasterizerFps(now);
        // Eco mode is a user-controlled debug toggle; when on we render
        // snapDOM at a smaller scale (cheaper SVG raster). The cap on
        // raster fps stays the same in either mode — eco only affects
        // resolution.
        const rasterScale = settingsRef.current.ecoMode
          ? RASTERIZER_SCALE * ecoModeRasterizerScaleMultiplier
          : RASTERIZER_SCALE;
        const frameIntervalMs = 1000 / rasterizerFps;
        if (dirtyRef.current && now - lastRasterizationTimestamp >= frameIntervalMs) {
          // Clear the flag BEFORE awaiting the snapshot so any change
          // observed during the in-flight capture re-marks dirty and is
          // picked up on the next tick.
          dirtyRef.current = false;
          lastRasterizationTimestamp = now;
          void snapshotSurface(rasterScale).then(() => {
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
      rafId = requestAnimationFrame(tick);

      return () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        if (container) {
          for (const eventName of containerEventNames) {
            container.removeEventListener(eventName, markDirty, containerEventOptions);
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
      const overlayRect = overlay!.getBoundingClientRect();
      // The overlay element's transform-origin is its top-left, which is
      // positioned at viewport (0, 0) thanks to position: fixed; top: 0;
      // left: 0. Pointer client coords are therefore already relative to
      // that origin. (Bounding rect retrieval here just guards against
      // edge cases where layout hasn't settled.)
      void overlayRect;
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
