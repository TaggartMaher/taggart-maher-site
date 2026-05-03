import { memo, useEffect, useRef, type ReactNode } from "react";

const TASKBAR_HEIGHT = 56;
const TITLEBAR_HEIGHT = 32;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;
const DRAG_KEEP_VISIBLE_PIXELS = 80;

export interface PWindowProps {
  // Stable id of the window in the Portfolio's state. Passed back to
  // every callback so Portfolio can keep its handlers stable across
  // renders — without that, React.memo on PWindow can't bail out
  // during a drag (each render produces fresh inline arrows).
  windowId: string;
  title: string;
  icon: string;
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
  children: ReactNode;
}

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

function PWindowInner({
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
}: PWindowProps) {
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<DragState | null>(null);
  // High-poll-rate mice fire pointermove faster than the display refreshes;
  // committing every move straight to React state would re-render the
  // Portfolio tree more often than the screen can show it, and each
  // commit mutates DOM that snapDOM (the screen-content rasterizer)
  // observes globally. Latest computed position/size is stashed in a
  // ref and flushed once per rAF, so React work is capped at the
  // display rate regardless of mouse polling rate.
  const pendingMoveRef = useRef<{ positionX: number; positionY: number } | null>(null);
  const pendingResizeRef = useRef<{ width: number; height: number } | null>(null);
  const moveRafHandleRef = useRef<number | null>(null);
  const resizeRafHandleRef = useRef<number | null>(null);

  // Make sure no rAF survives unmount — if a PWindow closes mid-drag
  // the queued callback would otherwise fire on a vanished window id.
  useEffect(() => {
    return () => {
      if (moveRafHandleRef.current !== null) {
        cancelAnimationFrame(moveRafHandleRef.current);
        moveRafHandleRef.current = null;
      }
      if (resizeRafHandleRef.current !== null) {
        cancelAnimationFrame(resizeRafHandleRef.current);
        resizeRafHandleRef.current = null;
      }
    };
  }, []);

  function handleTitleBarPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
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
    event.currentTarget.setPointerCapture(event.pointerId);
    const scale = readViewportScale(event.currentTarget);
    // Dragging a maximized window restores it to its pre-maximize size,
    // pinned under the cursor — same gesture Windows/macOS use to undock
    // a snapped window. width/height are preserved on the WindowState
    // even while maximized, so we just clear the flag and reposition.
    let dragStartWindowX = positionX;
    let dragStartWindowY = positionY;
    if (maximized) {
      const portfolioContainer = (event.currentTarget as HTMLElement).closest(
        ".portfolio",
      ) as HTMLElement | null;
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
    dragRef.current = {
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

  function handleTitleBarPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const minPositionX = -width + DRAG_KEEP_VISIBLE_PIXELS;
    const maxPositionX = Math.max(0, containerWidth - DRAG_KEEP_VISIBLE_PIXELS);
    const maxPositionY = Math.max(0, containerHeight - TASKBAR_HEIGHT - TITLEBAR_HEIGHT);
    const nextX = drag.startWindowX + (event.clientX - drag.startMouseX) / drag.viewportScaleX;
    const nextY = drag.startWindowY + (event.clientY - drag.startMouseY) / drag.viewportScaleY;
    const clampedX = Math.min(Math.max(nextX, minPositionX), maxPositionX);
    const clampedY = Math.min(Math.max(nextY, 0), maxPositionY);
    pendingMoveRef.current = { positionX: clampedX, positionY: clampedY };
    if (moveRafHandleRef.current === null) {
      moveRafHandleRef.current = requestAnimationFrame(() => {
        moveRafHandleRef.current = null;
        const pending = pendingMoveRef.current;
        if (pending) {
          pendingMoveRef.current = null;
          onMove(windowId, pending.positionX, pending.positionY);
        }
      });
    }
  }

  function flushPendingMove(): void {
    if (moveRafHandleRef.current !== null) {
      cancelAnimationFrame(moveRafHandleRef.current);
      moveRafHandleRef.current = null;
    }
    const pending = pendingMoveRef.current;
    if (pending) {
      pendingMoveRef.current = null;
      onMove(windowId, pending.positionX, pending.positionY);
    }
  }

  function handleTitleBarPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    flushPendingMove();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (maximized) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onFocus(windowId);
    event.currentTarget.setPointerCapture(event.pointerId);
    const scale = readViewportScale(event.currentTarget);
    resizeRef.current = {
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

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextWidth = Math.max(
      MIN_WIDTH,
      resize.startWidth + (event.clientX - resize.startMouseX) / resize.viewportScaleX,
    );
    const nextHeight = Math.max(
      MIN_HEIGHT,
      resize.startHeight + (event.clientY - resize.startMouseY) / resize.viewportScaleY,
    );
    pendingResizeRef.current = { width: nextWidth, height: nextHeight };
    if (resizeRafHandleRef.current === null) {
      resizeRafHandleRef.current = requestAnimationFrame(() => {
        resizeRafHandleRef.current = null;
        const pending = pendingResizeRef.current;
        if (pending) {
          pendingResizeRef.current = null;
          onResize(windowId, pending.width, pending.height);
        }
      });
    }
  }

  function flushPendingResize(): void {
    if (resizeRafHandleRef.current !== null) {
      cancelAnimationFrame(resizeRafHandleRef.current);
      resizeRafHandleRef.current = null;
    }
    const pending = pendingResizeRef.current;
    if (pending) {
      pendingResizeRef.current = null;
      onResize(windowId, pending.width, pending.height);
    }
  }

  function handleResizePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    flushPendingResize();
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (minimized) return null;

  const style: React.CSSProperties = maximized
    ? {
        left: 0,
        top: 0,
        width: containerWidth,
        height: containerHeight - TASKBAR_HEIGHT,
        zIndex,
      }
    : { left: positionX, top: positionY, width, height, zIndex };

  const className = "pwin" + (focused ? " focused" : "") + (maximized ? " maximized" : "");

  // Focus only on a non-titlebar pointerdown — the titlebar's own handler
  // already calls onFocus, and binding focus to the parent caused mouse
  // clicks to fire focus twice (mousedown bubbled up while pointerdown
  // ran), which raced with the drag-start state.
  function handleBodyPointerDown(): void {
    onFocus(windowId);
  }

  return (
    <div className={className} style={style}>
      <div
        className="pwin-tb"
        onPointerDown={handleTitleBarPointerDown}
        onPointerMove={handleTitleBarPointerMove}
        onPointerUp={handleTitleBarPointerUp}
        onPointerCancel={handleTitleBarPointerUp}
        onDoubleClick={() => onMaximize(windowId)}
      >
        <div className="pwin-tb-l">
          <span className="pwin-icon">{icon}</span>
          <span className="pwin-title">{title}</span>
        </div>
        <div className="pwin-tb-r">
          <button
            className="pwin-btn min"
            onClick={(event) => {
              event.stopPropagation();
              onMinimize(windowId);
            }}
            aria-label="Minimize"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 7h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="pwin-btn max"
            onClick={(event) => {
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
                strokeWidth="1.3"
              />
            </svg>
          </button>
          <button
            className="pwin-btn close"
            onClick={(event) => {
              event.stopPropagation();
              onClose(windowId);
            }}
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M3 3l6 6M9 3l-6 6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="pwin-body" onPointerDown={handleBodyPointerDown}>
        {children}
      </div>
      {!maximized && (
        <div
          className="pwin-resize"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path
              d="M3 13L13 3M7 13L13 7M11 13L13 11"
              stroke="currentColor"
              strokeWidth="1"
              opacity=".5"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

// Memoized so a drag of one window doesn't reconcile every other window
// (their props don't change). Relies on Portfolio passing stable
// id-aware handlers — see useCallback'd focusWindow/moveWindow/etc.
export const PWindow = memo(PWindowInner);
