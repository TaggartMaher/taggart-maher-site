// Window component — KDE Plasma-flavored window chrome.
// Drag by titlebar, close/minimize/maximize, focus brings to front.

const { useState: wuS, useEffect: wuE, useRef: wuR, useCallback: wuC } = React;

function PWindow({
  id,
  title,
  icon,
  x,
  y,
  w,
  h,
  z,
  focused,
  minimized,
  maximized,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onMove,
  onResize,
  children,
}) {
  const dragging = wuR(false);
  const startRef = wuR({ mx: 0, my: 0, x: 0, y: 0 });

  const onTitleDown = (e) => {
    if (maximized) return;
    onFocus();
    dragging.current = true;
    startRef.current = { mx: e.clientX, my: e.clientY, x, y };
    const move = (ev) => {
      if (!dragging.current) return;
      onMove(
        Math.max(-w + 80, startRef.current.x + (ev.clientX - startRef.current.mx)),
        Math.max(0, startRef.current.y + (ev.clientY - startRef.current.my)),
      );
    };
    const up = () => {
      dragging.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onResizeDown = (e) => {
    if (maximized) return;
    e.stopPropagation();
    onFocus();
    const sx = e.clientX,
      sy = e.clientY,
      sw = w,
      sh = h;
    const move = (ev) => {
      onResize(Math.max(360, sw + (ev.clientX - sx)), Math.max(280, sh + (ev.clientY - sy)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (minimized) return null;

  const style = maximized
    ? { left: 0, top: 0, width: "100vw", height: "calc(100vh - 44px)", zIndex: z }
    : { left: x, top: y, width: w, height: h, zIndex: z };

  return (
    <div
      className={"pwin" + (focused ? " focused" : "") + (maximized ? " maximized" : "")}
      style={style}
      onMouseDown={onFocus}
    >
      <div className="pwin-tb" onPointerDown={onTitleDown} onDoubleClick={onMaximize}>
        <div className="pwin-tb-l">
          <span className="pwin-icon">{icon}</span>
          <span className="pwin-title">{title}</span>
        </div>
        <div className="pwin-tb-r">
          <button
            className="pwin-btn min"
            onClick={(e) => {
              e.stopPropagation();
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
            onClick={(e) => {
              e.stopPropagation();
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
            onClick={(e) => {
              e.stopPropagation();
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
      <div className="pwin-body">{children}</div>
      {!maximized && (
        <div className="pwin-resize" onPointerDown={onResizeDown}>
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

      <style>{`
        .pwin{position:absolute;background:var(--panel);color:var(--fg);
          border:1px solid var(--border);border-radius:8px;
          box-shadow: var(--shadow);
          display:flex;flex-direction:column;overflow:hidden;
          transition:box-shadow .15s, border-color .15s}
        .pwin.focused{border-color:var(--accent);box-shadow: 0 14px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(61,174,233,.25)}
        .pwin.maximized{border-radius:0;border-left:0;border-right:0;border-bottom:0;border-top-color:var(--accent)}
        .pwin-tb{display:flex;align-items:center;justify-content:space-between;
          height:32px;padding:0 4px 0 10px;background:var(--panel-2);
          border-bottom:1px solid var(--border-soft);user-select:none;cursor:grab}
        .pwin-tb:active{cursor:grabbing}
        .pwin.focused .pwin-tb{background:linear-gradient(180deg,#2d323d 0%,#262a33 100%)}
        .pwin-tb-l{display:flex;align-items:center;gap:8px;min-width:0}
        .pwin-icon{font-size:14px;line-height:1}
        .pwin-title{font-size:12.5px;font-weight:500;color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pwin:not(.focused) .pwin-title{color:var(--fg-3)}
        .pwin-tb-r{display:flex;gap:2px}
        .pwin-btn{appearance:none;width:26px;height:24px;background:transparent;border:0;
          border-radius:4px;color:var(--fg-2);cursor:pointer;display:grid;place-items:center;
          transition:.1s}
        .pwin-btn:hover{background:rgba(255,255,255,.08)}
        .pwin-btn.close:hover{background:#c0392b;color:#fff}
        .pwin-body{flex:1;overflow:auto;background:var(--panel);position:relative}
        .pwin-resize{position:absolute;right:0;bottom:0;width:16px;height:16px;
          cursor:nwse-resize;color:var(--fg-3);display:grid;place-items:center;z-index:5}
      `}</style>
    </div>
  );
}

window.PWindow = PWindow;
