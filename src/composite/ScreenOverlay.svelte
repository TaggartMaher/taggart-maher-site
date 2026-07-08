<script lang="ts">
  import { onMount, untrack, type Snippet } from "svelte";
  import { detectHtmlInCanvasSupport } from "./htmlInCanvas";
  import {
    rasterizerFps,
    rasterizerFpsEcoMode,
    screenDimensions,
    screenProjectedCorners,
  } from "../config";
  import type { PerfMetrics } from "./perfMetrics";
  import type { ValueRef } from "../shared/valueRef";
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
    textureCanvasRef: ValueRef<HTMLCanvasElement | null>;
    // Monotonic revision counter we increment every time we paint the
    // texture canvas. The compositors compare their last-uploaded value
    // and skip texImage2D when nothing has changed since.
    textureRevisionRef: ValueRef<number>;
    // Live perf-metrics ref. The rasterization loop publishes its
    // sliding-window FPS into `rasterizerFps` so the debug menu can show
    // it; nothing in this component reads from it.
    perfMetricsRef: ValueRef<PerfMetrics>;
    // The DOM mounted inside the simulated screen — desktop emulator
    // (Portfolio) in FULL_MODE, the lite interface in LIGHTWEIGHT_MODE.
    // Stays mounted even when image/color overlays are showing, because
    // the offscreen texture-paint pass uses it as the foreignObject
    // rasterization source.
    children: Snippet;
  }

  let {
    settings,
    onSettingsChange,
    textureCanvasRef,
    textureRevisionRef,
    perfMetricsRef,
    children,
  }: ScreenOverlayProps = $props();

  // Per-key deriveds so the effects below only re-run when the value
  // they care about actually changes — the parent replaces the whole
  // settings object on every debug-menu tweak, and re-running the
  // rasterizer loop on an unrelated slider drag would drop its state.
  const ecoModeEnabled = $derived(settings.ecoMode);
  const imageBackgroundEnabled = $derived(settings.imageBackgroundEnabled);
  const imageBackgroundUrl = $derived(settings.imageBackgroundUrl);
  const colorBackgroundEnabled = $derived(settings.colorBackgroundEnabled);
  const colorBackgroundColor = $derived(settings.colorBackgroundColor);

  // Walk the live tree and the clone in lockstep; for every element
  // whose live counterpart has a non-zero scrollTop / scrollLeft, set
  // `overflow: hidden` on the clone and translate each of its child
  // elements by the negative scroll offset. The serialized SVG then
  // renders the same content the user actually sees through each
  // scroll container's viewport, instead of always-from-the-top. The
  // scrolled clone gets `overflow: hidden` (instead of `visible`) so
  // content past the viewport is clipped exactly like the live element,
  // preventing items below the scroll viewport from leaking onto the
  // rasterized image.
  function applyScrollOffsetsToClone(liveRoot: HTMLElement, cloneRoot: HTMLElement): void {
    const liveWalker = document.createTreeWalker(liveRoot, NodeFilter.SHOW_ELEMENT);
    const cloneWalker = document.createTreeWalker(cloneRoot, NodeFilter.SHOW_ELEMENT);
    let liveElement = liveRoot as Element | null;
    let cloneElement = cloneRoot as Element | null;
    while (liveElement && cloneElement) {
      const liveHtmlElement = liveElement as HTMLElement;
      const cloneHtmlElement = cloneElement as HTMLElement;
      const scrollLeft = liveHtmlElement.scrollLeft;
      const scrollTop = liveHtmlElement.scrollTop;
      if (scrollLeft !== 0 || scrollTop !== 0) {
        cloneHtmlElement.style.overflow = "hidden";
        const translate = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
        for (const child of Array.from(cloneHtmlElement.children) as HTMLElement[]) {
          const existingTransform = child.style.transform;
          child.style.transform = existingTransform
            ? `${translate} ${existingTransform}`
            : translate;
          child.style.transformOrigin = "top left";
        }
      }
      liveElement = liveWalker.nextNode() as Element | null;
      cloneElement = cloneWalker.nextNode() as Element | null;
    }
  }

  // Serialize an HTMLElement into a canvas via SVG <foreignObject>. The
  // element's own markup plus the page's full inlined stylesheet text are
  // dropped into a self-contained SVG, then decoded as an image and
  // drawn to the destination canvas. The decode happens off the main
  // thread, so the per-call work that competes with pointer-event
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

    // foreignObject doesn't preserve serialized scroll containers' UA
    // scrollTop / scrollLeft — without compensation, the rasterized
    // image always shows content scrolled to the top. Both the root
    // element (lite-mode shell, which scrolls inside the screen rect)
    // and any descendant scroll container (FULL_MODE Portfolio windows
    // each have their own scrollable body) need offsets applied.
    // Always work on a clone so we can mutate styles freely; walk both
    // trees in parallel and translate each scrolled container's clone
    // children by its current scroll offset.
    const elementClone = element.cloneNode(true) as HTMLElement;
    applyScrollOffsetsToClone(element, elementClone);
    const serializer = new XMLSerializer();
    const elementMarkup = serializer.serializeToString(elementClone);

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

    // This must stay a percent-encoded data: URL. The obvious
    // optimizations both fail in Chromium for SVG containing
    // <foreignObject>: drawing an image loaded from a Blob object URL
    // taints the destination canvas (the compositors' texImage2D then
    // throws SecurityError), and createImageBitmap can't decode SVG
    // blobs at all. The encodeURIComponent round-trip is the price of
    // an untainted canvas.
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
    context.drawImage(image, 0, 0, visibleWidth, visibleHeight, 0, 0, canvas.width, canvas.height);
  }

  let surfaceContainer = $state<HTMLDivElement | null>(null);
  let internalCanvas: HTMLCanvasElement | null = null;
  let loadedImage: { url: string; image: HTMLImageElement } | null = null;
  // Dirty flag for the surface-mode rAF loop. When true the next tick
  // re-rasterizes; when false the tick only repaints the square overlay
  // on top of the existing snapshot. Listeners and observers below set
  // this true on any change; the loop clears it before each snapshot.
  // Initial true so the first paint always runs.
  let surfaceDirty = true;
  // Set by the surface-mode rAF loop so the visibilitychange listener
  // below can wake it back up after a hidden-tab park. Null in image /
  // color modes, where there's no loop to resume.
  let wakeup: (() => void) | null = null;

  // Allocate the texture canvas on mount, and re-allocate when eco
  // mode toggles so the smaller eco-size canvas / GPU texture takes
  // effect immediately. Re-running this effect bumps the revision so
  // the compositors notice the new canvas and re-upload. Declared
  // before the paint-driving effect below so it runs first on both
  // mount and eco-mode flips.
  $effect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = ecoModeEnabled ? TEXTURE_WIDTH_ECO_MODE : TEXTURE_WIDTH;
    canvas.height = ecoModeEnabled ? TEXTURE_HEIGHT_ECO_MODE : TEXTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    internalCanvas = canvas;
    textureCanvasRef.current = canvas;
    textureRevisionRef.current = (textureRevisionRef.current ?? 0) + 1;
    // Force the rasterizer to capture into the freshly-allocated
    // canvas on its next tick — otherwise the bounce light shows the
    // initial black fill until the next external dirty signal.
    surfaceDirty = true;
    return () => {
      if (textureCanvasRef.current === canvas) {
        textureCanvasRef.current = null;
      }
    };
  });

  // One-time log if the user has Chrome's HTML-in-Canvas flag enabled —
  // the compositor would benefit from `texElementImage2D`, but wiring
  // it requires moving the Portfolio DOM into the compositor canvas.
  onMount(() => {
    if (detectHtmlInCanvasSupport()) {
      console.info(
        "[overlay] HTML-in-Canvas (texElementImage2D) detected. Faster path " +
          "available — currently using the foreignObject rasterizer. See " +
          "src/composite/htmlInCanvas.ts.",
      );
    }
  });

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
  $effect(() => {
    // Register the effect's dependencies up front. Only these five
    // restart the loop; everything else (square position, colors) is
    // read live from `settings` inside the loop's closures, which run
    // outside dependency tracking. Eco mode is a dependency so the
    // closure picks up the freshly-allocated half-size texture canvas
    // from the allocation effect above.
    const imageEnabledNow = imageBackgroundEnabled;
    const colorEnabledNow = colorBackgroundEnabled;
    const colorValueNow = colorBackgroundColor;
    void imageBackgroundUrl;
    void ecoModeEnabled;

    // Everything below reads `settings` freely (square position, live
    // eco flag, image URL); untrack so those reads don't also become
    // dependencies — the five keys above are the only restart triggers.
    return untrack(() => runTextureDrive(imageEnabledNow, colorEnabledNow, colorValueNow));
  });

  function runTextureDrive(
    imageEnabledNow: boolean,
    colorEnabledNow: boolean,
    colorValueNow: string,
  ): (() => void) | undefined {
    const canvas = internalCanvas;
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
      if (!settings.squareEnabled) return;
      const sideInPixels = canvas.width * SQUARE_FRACTION;
      const xInPixels = settings.squareNormalizedX * canvas.width;
      const yInPixels = settings.squareNormalizedY * canvas.height;
      context.fillStyle = settings.squareColor;
      context.fillRect(xInPixels, yInPixels, sideInPixels, sideInPixels);
    }

    async function loadImageBackground(): Promise<void> {
      if (!canvas || !context) return;
      let cached = loadedImage;
      if (!cached || cached.url !== settings.imageBackgroundUrl) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        const imageUrl = settings.imageBackgroundUrl;
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("[overlay] background image failed to load"));
          image.src = imageUrl;
        });
        if (cancelled) return;
        cached = { url: imageUrl, image };
        loadedImage = cached;
      }
      context.drawImage(cached.image, 0, 0, canvas.width, canvas.height);
    }

    async function snapshotSurface(): Promise<void> {
      if (rasterizing) return;
      const source = surfaceContainer;
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

    if (imageEnabledNow) {
      void (async () => {
        try {
          await loadImageBackground();
        } catch (error) {
          // Without this catch a failed image load would reject the
          // floating promise (unhandled rejection) and skip the square
          // paint below entirely.
          console.warn("[overlay] background image failed to load:", error);
        }
        if (cancelled || !context) return;
        if (settings.colorBackgroundEnabled) {
          context.fillStyle = settings.colorBackgroundColor;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        paintSquare();
        bumpRevision();
      })();
    } else if (colorEnabledNow) {
      context.fillStyle = colorValueNow;
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
      surfaceDirty = true;
      const container = surfaceContainer;
      let lastRasterizationTimestamp = 0;
      // Sliding-window timestamps (ms) of recent successful rasterizations.
      // Same shape as the compositor's displayFps measurement: count
      // entries within the last second, divide by elapsed window.
      const recentRasterizationTimestamps: number[] = [];
      function markDirty(): void {
        surfaceDirty = true;
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
        let measuredRasterizerFps = 0;
        if (sampleCount >= 2) {
          const elapsedSeconds = (nowMs - recentRasterizationTimestamps[0]) / 1000;
          if (elapsedSeconds > 0) {
            measuredRasterizerFps = (sampleCount - 1) / elapsedSeconds;
          }
        }
        if (perfMetricsRef.current) {
          perfMetricsRef.current.rasterizerFps = measuredRasterizerFps;
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
        // up by calling wakeup.
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
        const effectiveFps = settings.ecoMode ? rasterizerFpsEcoMode : rasterizerFps;
        const frameIntervalMs = 1000 / effectiveFps;
        if (surfaceDirty && now - lastRasterizationTimestamp >= frameIntervalMs) {
          // Clear the flag BEFORE awaiting the snapshot so any change
          // observed during the in-flight capture re-marks dirty and is
          // picked up on the next tick.
          surfaceDirty = false;
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
      wakeup = () => {
        if (cancelled || rafId !== 0) return;
        if (document.hidden) return;
        // DOM may have mutated while we were parked (route change,
        // clock tick, etc.) — force a re-rasterization on resume.
        surfaceDirty = true;
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      return () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        wakeup = null;
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
  }

  // The square overlay sits outside the Portfolio container, so the
  // container's pointer/mutation observers do not see square drags. Mark
  // the rAF loop dirty whenever a square-affecting setting changes so
  // the next tick re-rasterizes — otherwise the previous square pixels
  // would ghost on top of the cached snapshot.
  const squareEnabled = $derived(settings.squareEnabled);
  const squareColor = $derived(settings.squareColor);
  const squareNormalizedX = $derived(settings.squareNormalizedX);
  const squareNormalizedY = $derived(settings.squareNormalizedY);
  $effect(() => {
    void squareEnabled;
    void squareColor;
    void squareNormalizedX;
    void squareNormalizedY;
    surfaceDirty = true;
  });

  // Resume the surface-mode rAF loop when the tab becomes visible.
  // wakeup is null in image / color background modes (no loop to
  // wake) — the listener is then a no-op.
  onMount(() => {
    function handleVisibilityChange(): void {
      if (!document.hidden) wakeup?.();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  // Recompute the perspective transform on viewport size change. The
  // projected-corner positions are in normalized [0, 1] viewport coords;
  // multiply by current pixel dimensions to get destination pixels for
  // the homography solver.
  let viewportSize = $state({
    width: typeof window === "undefined" ? 1 : window.innerWidth,
    height: typeof window === "undefined" ? 1 : window.innerHeight,
  });
  onMount(() => {
    function handleResize(): void {
      viewportSize = { width: window.innerWidth, height: window.innerHeight };
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  const viewportProjectedCornersInPixels: ProjectedCorners = $derived.by(() => {
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
  });

  const overlayTransform = $derived(
    computeCssMatrix3d(
      OVERLAY_NATURAL_WIDTH,
      OVERLAY_NATURAL_HEIGHT,
      viewportProjectedCornersInPixels,
    ),
  );

  // Square drag handling — pointer-based so it works for mouse and touch.
  // Pointer viewport coords are inverse-projected back to the overlay's
  // un-transformed natural-pixel space, then divided by the natural width
  // and height to give a stable normalized position (0..1) inside the
  // logical screen content, independent of the perspective warp.
  function handleSquarePointerDown(event: PointerEvent): void {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const sideFractionX = SQUARE_FRACTION;
    const sideFractionY = (SQUARE_FRACTION * OVERLAY_NATURAL_WIDTH) / OVERLAY_NATURAL_HEIGHT;
    const cornersAtDragStart = viewportProjectedCornersInPixels;

    function pointerToNormalized(clientX: number, clientY: number): Vector2 {
      // The overlay element is position: fixed at (0, 0) with
      // transform-origin at its top-left, so client coords are already
      // in the same frame as the matrix3d projection — no
      // getBoundingClientRect needed.
      const naturalPoint = inverseProjectViewportPoint(
        [clientX, clientY],
        OVERLAY_NATURAL_WIDTH,
        OVERLAY_NATURAL_HEIGHT,
        cornersAtDragStart,
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

  // Natural overlay aspect equals the screen plane's real-world aspect
  // (the height was sized that way), so a true square in texture space
  // maps to a square in natural-pixel space too.
  const squareSideFractionY = (SQUARE_FRACTION * OVERLAY_NATURAL_WIDTH) / OVERLAY_NATURAL_HEIGHT;

  // showImage / showSquare drive the DOM-side rendering only; the
  // off-screen canvas-side painting (which feeds the bounce-light
  // texture) keys directly off imageBackgroundEnabled / squareEnabled
  // so the user can hide the on-screen overlay while still seeing the
  // composited bounce reflecting the image / square.
  const showImage = $derived(settings.imageBackgroundEnabled && !settings.hideImageOverlay);
  const showSquare = $derived(settings.squareEnabled && !settings.hideSquareOverlay);
  const showColor = $derived(settings.colorBackgroundEnabled);
  // The screen surface (Portfolio or LiteInterface) stays mounted
  // whenever there's no image/color background, even when the user has
  // hidden the page overlay — the offscreen texture-paint pass needs
  // its DOM as a source. visibility:hidden (vs display:none) keeps
  // layout + computed styles intact so the rasterizer can capture the
  // live element.
  const surfaceMounted = $derived(!showImage && !showColor);
  const surfaceVisible = $derived(surfaceMounted && !settings.hidePageOverlay);
  // Drop the overlay's white fill when nothing visible should occlude
  // the composite, so the user can see the rendered scene through the
  // screen-rect area.
  const overlayHasVisibleContent = $derived(surfaceVisible || showImage || showColor);
</script>

<div
  class="screen-overlay"
  style:left="0"
  style:top="0"
  style:width="{OVERLAY_NATURAL_WIDTH}px"
  style:height="{OVERLAY_NATURAL_HEIGHT}px"
  style:transform-origin="0 0"
  style:transform={overlayTransform}
  style:background={overlayHasVisibleContent ? undefined : "transparent"}
>
  {#if surfaceMounted}
    <div
      bind:this={surfaceContainer}
      class="screen-overlay-content"
      style:visibility={surfaceVisible ? undefined : "hidden"}
    >
      {@render children()}
    </div>
  {/if}
  {#if showImage}
    <img class="screen-overlay-image" src={settings.imageBackgroundUrl} alt="" draggable="false" />
  {/if}
  {#if showColor}
    <div class="screen-overlay-color" style:background={settings.colorBackgroundColor}></div>
  {/if}
  {#if showSquare}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="screen-overlay-square"
      style:left="{settings.squareNormalizedX * 100}%"
      style:top="{settings.squareNormalizedY * 100}%"
      style:width="{SQUARE_FRACTION * 100}%"
      style:height="{squareSideFractionY * 100}%"
      style:background={settings.squareColor}
      onpointerdown={handleSquarePointerDown}
    ></div>
  {/if}
</div>
