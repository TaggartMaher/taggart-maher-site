import { useRef, type ReactNode } from "react";

const TASKBAR_HEIGHT = 44;
const TITLEBAR_HEIGHT = 32;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;
const DRAG_KEEP_VISIBLE_PIXELS = 80;

export interface PWindowProps {
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
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (positionX: number, positionY: number) => void;
  onResize: (width: number, height: number) => void;
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
}

export function PWindow({
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

  function handleTitleBarPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (maximized) return;
    // Only react to the primary button on mouse, ignore multi-touch.
    if (event.button !== 0) return;
    event.preventDefault();
    onFocus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startWindowX: positionX,
      startWindowY: positionY,
      startWidth: width,
      startHeight: height,
    };
  }

  function handleTitleBarPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const minPositionX = -width + DRAG_KEEP_VISIBLE_PIXELS;
    const maxPositionX = Math.max(0, containerWidth - DRAG_KEEP_VISIBLE_PIXELS);
    const maxPositionY = Math.max(0, containerHeight - TASKBAR_HEIGHT - TITLEBAR_HEIGHT);
    const nextX = drag.startWindowX + (event.clientX - drag.startMouseX);
    const nextY = drag.startWindowY + (event.clientY - drag.startMouseY);
    const clampedX = Math.min(Math.max(nextX, minPositionX), maxPositionX);
    const clampedY = Math.min(Math.max(nextY, 0), maxPositionY);
    onMove(clampedX, clampedY);
  }

  function handleTitleBarPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
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
    onFocus();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startWindowX: positionX,
      startWindowY: positionY,
      startWidth: width,
      startHeight: height,
    };
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextWidth = Math.max(MIN_WIDTH, resize.startWidth + (event.clientX - resize.startMouseX));
    const nextHeight = Math.max(
      MIN_HEIGHT,
      resize.startHeight + (event.clientY - resize.startMouseY),
    );
    onResize(nextWidth, nextHeight);
  }

  function handleResizePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
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
    onFocus();
  }

  return (
    <div className={className} style={style}>
      <div
        className="pwin-tb"
        onPointerDown={handleTitleBarPointerDown}
        onPointerMove={handleTitleBarPointerMove}
        onPointerUp={handleTitleBarPointerUp}
        onPointerCancel={handleTitleBarPointerUp}
        onDoubleClick={onMaximize}
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
              onMinimize();
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
              onMaximize();
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
              onClose();
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
