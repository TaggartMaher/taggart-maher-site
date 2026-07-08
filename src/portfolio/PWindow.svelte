<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import Icon, { type IconName } from "./Icon.svelte";

  const TASKBAR_HEIGHT = 56;
  const TITLEBAR_HEIGHT = 32;
  const MIN_WIDTH = 360;
  const MIN_HEIGHT = 280;
  const DRAG_KEEP_VISIBLE_PIXELS = 80;

  interface PWindowProps {
    // Stable id of the window in the Portfolio's state. Passed back to
    // every callback so Portfolio's handlers stay id-agnostic.
    windowId: string;
    title: string;
    icon: IconName;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    zIndex: number;
    focused: boolean;
    minimized: boolean;
    maximized: boolean;
    containerWidth: number;
    containerHeight: number;
    onFocus: (windowId: string) => void;
    onClose: (windowId: string) => void;
    onMinimize: (windowId: string) => void;
    onMaximize: (windowId: string) => void;
    onMove: (windowId: string, positionX: number, positionY: number) => void;
    onResize: (windowId: string, width: number, height: number) => void;
    children: Snippet;
  }

  let {
    windowId,
    title,
    icon,
    positionX,
    positionY,
    width,
    height,
    zIndex,
    focused,
    minimized,
    maximized,
    containerWidth,
    containerHeight,
    onFocus,
    onClose,
    onMinimize,
    onMaximize,
    onMove,
    onResize,
    children,
  }: PWindowProps = $props();

  interface DragState {
    pointerId: number;
    startMouseX: number;
    startMouseY: number;
    startWindowX: number;
    startWindowY: number;
    startWidth: number;
    startHeight: number;
    // Viewport-pixels-per-natural-pixel scale captured at pointer-down.
    // The Portfolio sits inside a matrix3d-transformed parent; pointer
    // client-coord deltas are in viewport space while positionX/Y, width,
    // and height live in the untransformed natural space, so we divide
    // viewport deltas by this scale before applying them.
    viewportScaleX: number;
    viewportScaleY: number;
  }

  function readViewportScale(element: HTMLElement): { x: number; y: number } {
    const portfolioContainer = element.closest(".portfolio") as HTMLElement | null;
    if (!portfolioContainer) return { x: 1, y: 1 };
    const naturalWidth = portfolioContainer.offsetWidth;
    const naturalHeight = portfolioContainer.offsetHeight;
    const projectedRect = portfolioContainer.getBoundingClientRect();
    const x = naturalWidth > 0 ? projectedRect.width / naturalWidth : 1;
    const y = naturalHeight > 0 ? projectedRect.height / naturalHeight : 1;
    return { x, y };
  }

  let dragState: DragState | null = null;
  let resizeState: DragState | null = null;
  // High-poll-rate mice fire pointermove faster than the display refreshes;
  // committing every move straight to state would update the DOM more
  // often than the screen can show it, and each commit mutates DOM that
  // the screen-content rasterizer observes globally. Latest computed
  // position/size is stashed and flushed once per rAF, so update work is
  // capped at the display rate regardless of mouse polling rate.
  let pendingMove: { positionX: number; positionY: number } | null = null;
  let pendingResize: { width: number; height: number } | null = null;
  let moveRafHandle: number | null = null;
  let resizeRafHandle: number | null = null;

  // Make sure no rAF survives unmount — if a PWindow closes mid-drag
  // the queued callback would otherwise fire on a vanished window id.
  onMount(() => {
    return () => {
      if (moveRafHandle !== null) {
        cancelAnimationFrame(moveRafHandle);
        moveRafHandle = null;
      }
      if (resizeRafHandle !== null) {
        cancelAnimationFrame(resizeRafHandle);
        resizeRafHandle = null;
      }
    };
  });

  function handleTitleBarPointerDown(event: PointerEvent): void {
    // Window control buttons (close/min/max) live inside the title bar.
    // Without this guard, the title bar's setPointerCapture below would
    // steal subsequent pointer events from the button, preventing its
    // click from ever firing.
    const eventTarget = event.target as HTMLElement;
    if (eventTarget.closest(".pwin-btn")) return;
    // Only react to the primary button on mouse, ignore multi-touch.
    if (event.button !== 0) return;
    event.preventDefault();
    onFocus(windowId);
    const currentTarget = event.currentTarget as HTMLElement;
    currentTarget.setPointerCapture(event.pointerId);
    const scale = readViewportScale(currentTarget);
    // Dragging a maximized window restores it to its pre-maximize size,
    // pinned under the cursor — same gesture Windows/macOS use to undock
    // a snapped window. width/height are preserved on the WindowState
    // even while maximized, so we just clear the flag and reposition.
    let dragStartWindowX = positionX;
    let dragStartWindowY = positionY;
    if (maximized) {
      const portfolioContainer = currentTarget.closest(".portfolio") as HTMLElement | null;
      if (portfolioContainer) {
        const projectedRect = portfolioContainer.getBoundingClientRect();
        const cursorNaturalX = (event.clientX - projectedRect.left) / scale.x;
        const cursorNaturalY = (event.clientY - projectedRect.top) / scale.y;
        dragStartWindowX = Math.max(0, cursorNaturalX - width / 2);
        dragStartWindowY = Math.max(0, cursorNaturalY - TITLEBAR_HEIGHT / 2);
        onMaximize(windowId);
        onMove(windowId, dragStartWindowX, dragStartWindowY);
      }
    }
    dragState = {
      pointerId: event.pointerId,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startWindowX: dragStartWindowX,
      startWindowY: dragStartWindowY,
      startWidth: width,
      startHeight: height,
      viewportScaleX: scale.x,
      viewportScaleY: scale.y,
    };
  }

  function handleTitleBarPointerMove(event: PointerEvent): void {
    const drag = dragState;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const minPositionX = -width + DRAG_KEEP_VISIBLE_PIXELS;
    const maxPositionX = Math.max(0, containerWidth - DRAG_KEEP_VISIBLE_PIXELS);
    const maxPositionY = Math.max(0, containerHeight - TASKBAR_HEIGHT - TITLEBAR_HEIGHT);
    const nextX = drag.startWindowX + (event.clientX - drag.startMouseX) / drag.viewportScaleX;
    const nextY = drag.startWindowY + (event.clientY - drag.startMouseY) / drag.viewportScaleY;
    const clampedX = Math.min(Math.max(nextX, minPositionX), maxPositionX);
    const clampedY = Math.min(Math.max(nextY, 0), maxPositionY);
    pendingMove = { positionX: clampedX, positionY: clampedY };
    if (moveRafHandle === null) {
      moveRafHandle = requestAnimationFrame(() => {
        moveRafHandle = null;
        const pending = pendingMove;
        if (pending) {
          pendingMove = null;
          onMove(windowId, pending.positionX, pending.positionY);
        }
      });
    }
  }

  function flushPendingMove(): void {
    if (moveRafHandle !== null) {
      cancelAnimationFrame(moveRafHandle);
      moveRafHandle = null;
    }
    const pending = pendingMove;
    if (pending) {
      pendingMove = null;
      onMove(windowId, pending.positionX, pending.positionY);
    }
  }

  function handleTitleBarPointerUp(event: PointerEvent): void {
    const drag = dragState;
    if (!drag || drag.pointerId !== event.pointerId) return;
    flushPendingMove();
    dragState = null;
    const currentTarget = event.currentTarget as HTMLElement;
    if (currentTarget.hasPointerCapture(event.pointerId)) {
      currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizePointerDown(event: PointerEvent): void {
    if (maximized) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onFocus(windowId);
    const currentTarget = event.currentTarget as HTMLElement;
    currentTarget.setPointerCapture(event.pointerId);
    const scale = readViewportScale(currentTarget);
    resizeState = {
      pointerId: event.pointerId,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startWindowX: positionX,
      startWindowY: positionY,
      startWidth: width,
      startHeight: height,
      viewportScaleX: scale.x,
      viewportScaleY: scale.y,
    };
  }

  function handleResizePointerMove(event: PointerEvent): void {
    const resize = resizeState;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextWidth = Math.max(
      MIN_WIDTH,
      resize.startWidth + (event.clientX - resize.startMouseX) / resize.viewportScaleX,
    );
    const nextHeight = Math.max(
      MIN_HEIGHT,
      resize.startHeight + (event.clientY - resize.startMouseY) / resize.viewportScaleY,
    );
    pendingResize = { width: nextWidth, height: nextHeight };
    if (resizeRafHandle === null) {
      resizeRafHandle = requestAnimationFrame(() => {
        resizeRafHandle = null;
        const pending = pendingResize;
        if (pending) {
          pendingResize = null;
          onResize(windowId, pending.width, pending.height);
        }
      });
    }
  }

  function flushPendingResize(): void {
    if (resizeRafHandle !== null) {
      cancelAnimationFrame(resizeRafHandle);
      resizeRafHandle = null;
    }
    const pending = pendingResize;
    if (pending) {
      pendingResize = null;
      onResize(windowId, pending.width, pending.height);
    }
  }

  function handleResizePointerUp(event: PointerEvent): void {
    const resize = resizeState;
    if (!resize || resize.pointerId !== event.pointerId) return;
    flushPendingResize();
    resizeState = null;
    const currentTarget = event.currentTarget as HTMLElement;
    if (currentTarget.hasPointerCapture(event.pointerId)) {
      currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // Focus only on a non-titlebar pointerdown — the titlebar's own handler
  // already calls onFocus, and binding focus to the parent caused mouse
  // clicks to fire focus twice (mousedown bubbled up while pointerdown
  // ran), which raced with the drag-start state.
  function handleBodyPointerDown(): void {
    onFocus(windowId);
  }

  const className = $derived(
    "pwin" + (focused ? " focused" : "") + (maximized ? " maximized" : ""),
  );
</script>

{#if !minimized}
  <div
    class={className}
    style:left="{maximized ? 0 : positionX}px"
    style:top="{maximized ? 0 : positionY}px"
    style:width="{maximized ? containerWidth : width}px"
    style:height="{maximized ? containerHeight - TASKBAR_HEIGHT : height}px"
    style:z-index={zIndex}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pwin-tb"
      onpointerdown={handleTitleBarPointerDown}
      onpointermove={handleTitleBarPointerMove}
      onpointerup={handleTitleBarPointerUp}
      onpointercancel={handleTitleBarPointerUp}
      ondblclick={() => onMaximize(windowId)}
    >
      <div class="pwin-tb-l">
        <span class="pwin-icon"><Icon name={icon} /></span>
        <span class="pwin-title">{title}</span>
      </div>
      <div class="pwin-tb-r">
        <button
          class="pwin-btn min"
          onclick={(event) => {
            event.stopPropagation();
            onMinimize(windowId);
          }}
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 7h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="pwin-btn max"
          onclick={(event) => {
            event.stopPropagation();
            onMaximize(windowId);
          }}
          aria-label="Maximize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect
              x="2"
              y="2"
              width="8"
              height="8"
              rx="1"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
            />
          </svg>
        </button>
        <button
          class="pwin-btn close"
          onclick={(event) => {
            event.stopPropagation();
            onClose(windowId);
          }}
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="pwin-body" onpointerdown={handleBodyPointerDown}>
      {@render children()}
    </div>
    {#if !maximized}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="pwin-resize"
        onpointerdown={handleResizePointerDown}
        onpointermove={handleResizePointerMove}
        onpointerup={handleResizePointerUp}
        onpointercancel={handleResizePointerUp}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path
            d="M3 13L13 3M7 13L13 7M11 13L13 11"
            stroke="currentColor"
            stroke-width="1"
            opacity=".5"
          />
        </svg>
      </div>
    {/if}
  </div>
{/if}
