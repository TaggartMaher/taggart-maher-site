import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import "./portfolio.css";
import { PWindow } from "./PWindow";
import {
  AboutApp,
  BlogApp,
  ContactApp,
  ExperienceApp,
  HomeApp,
  MysteryApp,
  ProjectsApp,
  ReadmeApp,
  WindowOpenerProvider,
  type AppId,
} from "./apps";

const TASKBAR_HEIGHT = 44;

// Default window sizes from the design handoff. These are tuned for a
// ~1600px-wide working area; we scale them to the actual container so the
// proportions hold whether the screen rect is 600px wide or 2000px wide.
const REFERENCE_CONTAINER_WIDTH = 1600;

interface AppMeta {
  title: string;
  icon: string;
  defaultWidth: number;
  defaultHeight: number;
  Component: ComponentType;
}

const APPS: Record<AppId, AppMeta> = {
  home: {
    title: "Home — File Manager",
    icon: "📁",
    defaultWidth: 880,
    defaultHeight: 560,
    Component: HomeApp,
  },
  about: {
    title: "About Me — Document",
    icon: "👤",
    defaultWidth: 960,
    defaultHeight: 800,
    Component: AboutApp,
  },
  experience: {
    title: "Experience — Document",
    icon: "📅",
    defaultWidth: 1010,
    defaultHeight: 770,
    Component: ExperienceApp,
  },
  projects: {
    title: "Projects — Browser",
    icon: "🛠",
    defaultWidth: 1300,
    defaultHeight: 825,
    Component: ProjectsApp,
  },
  blog: {
    title: "Blog — Reader",
    icon: "📝",
    defaultWidth: 960,
    defaultHeight: 800,
    Component: BlogApp,
  },
  mystery: {
    title: "Mystery — CLASSIFIED",
    icon: "🔒",
    defaultWidth: 960,
    defaultHeight: 745,
    Component: MysteryApp,
  },
  readme: {
    title: "README.md — Editor",
    icon: "📄",
    defaultWidth: 930,
    defaultHeight: 745,
    Component: ReadmeApp,
  },
  contact: {
    title: "Contact",
    icon: "✉",
    defaultWidth: 745,
    defaultHeight: 640,
    Component: ContactApp,
  },
};

interface WindowState {
  id: string;
  appId: AppId;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
}

interface OpenAppOverride {
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
}

const DESKTOP_ICONS: Array<{ id: AppId; label: string; icon: string }> = [
  { id: "about", label: "About Me", icon: "👤" },
  { id: "experience", label: "Experience", icon: "📅" },
  { id: "projects", label: "Projects", icon: "🛠" },
  { id: "blog", label: "Blog", icon: "📝" },
  { id: "mystery", label: "Mystery", icon: "🔒" },
  { id: "readme", label: "README.md", icon: "📄" },
  { id: "contact", label: "Contact", icon: "✉" },
];

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function Portfolio() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [zCounter, setZCounter] = useState(10);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [showStartHint, setShowStartHint] = useState(true);
  const [readmeOpenedRef, setReadmeOpenedRef] = useState(false);

  // Track container size — all window math is container-relative because
  // the Portfolio is mounted inside the screen-rect overlay, not the
  // viewport. Use offsetWidth/offsetHeight (CSS layout pixels), not
  // getBoundingClientRect (post-transform viewport pixels): the parent
  // .screen-overlay applies a matrix3d perspective, and we want window
  // positions and sizes to live in the un-transformed natural space
  // that positionX/Y / width / height are interpreted against.
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    function updateSize(): void {
      if (!node) return;
      setContainerSize({ width: node.offsetWidth, height: node.offsetHeight });
    }
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Tick the clock once a minute.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  const openApp = useCallback(
    (appId: AppId, override?: OpenAppOverride): void => {
      setShowStartHint(false);
      setLauncherOpen(false);
      setWindows((previous) => {
        const nextZ = zCounter + 1;
        setZCounter(nextZ);
        const existing = previous.find((window) => window.appId === appId);
        if (existing) {
          return previous.map((window) =>
            window.appId === appId ? { ...window, zIndex: nextZ, minimized: false } : window,
          );
        }
        const meta = APPS[appId];
        const scale = Math.min(containerSize.width / REFERENCE_CONTAINER_WIDTH, 1);
        const scaledWidth = override?.width ?? Math.round(meta.defaultWidth * scale);
        const scaledHeight = override?.height ?? Math.round(meta.defaultHeight * scale);
        const usableHeight = containerSize.height - TASKBAR_HEIGHT;
        const clampedWidth = Math.max(360, Math.min(scaledWidth, containerSize.width - 20));
        const clampedHeight = Math.max(280, Math.min(scaledHeight, usableHeight - 20));
        const positionX =
          override?.positionX ?? Math.max(20, Math.round((containerSize.width - clampedWidth) / 2));
        const positionY =
          override?.positionY ?? Math.max(20, Math.round((usableHeight - clampedHeight) / 2));
        return [
          ...previous,
          {
            id: appId + "-" + Date.now(),
            appId,
            positionX,
            positionY,
            width: clampedWidth,
            height: clampedHeight,
            zIndex: nextZ,
            minimized: false,
            maximized: false,
          },
        ];
      });
    },
    [zCounter, containerSize.width, containerSize.height],
  );

  // Open README on first load (once the container has measured).
  useEffect(() => {
    if (readmeOpenedRef) return;
    if (containerSize.width === 0 || containerSize.height === 0) return;
    const usableHeight = containerSize.height - TASKBAR_HEIGHT;
    const targetHeight = Math.round(usableHeight * 0.9);
    const targetWidth = Math.round(containerSize.width / 2);
    const positionX = Math.round((containerSize.width - targetWidth) / 2);
    const positionY = Math.round((usableHeight - targetHeight) / 2);
    openApp("readme", { positionX, positionY, width: targetWidth, height: targetHeight });
    setReadmeOpenedRef(true);
  }, [containerSize.width, containerSize.height, readmeOpenedRef, openApp]);

  // Esc closes top window or the launcher.
  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      if (launcherOpen) {
        setLauncherOpen(false);
        return;
      }
      setWindows((previous) => {
        if (previous.length === 0) return previous;
        const top = [...previous].sort((a, b) => b.zIndex - a.zIndex)[0];
        return previous.filter((window) => window.id !== top.id);
      });
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [launcherOpen]);

  function closeWindow(id: string): void {
    setWindows((previous) => previous.filter((window) => window.id !== id));
  }

  function focusWindow(id: string): void {
    setWindows((previous) => {
      const nextZ = zCounter + 1;
      setZCounter(nextZ);
      return previous.map((window) =>
        window.id === id ? { ...window, zIndex: nextZ, minimized: false } : window,
      );
    });
  }

  function minimizeWindow(id: string): void {
    setWindows((previous) =>
      previous.map((window) => (window.id === id ? { ...window, minimized: true } : window)),
    );
  }

  function toggleMaximize(id: string): void {
    setWindows((previous) =>
      previous.map((window) =>
        window.id === id ? { ...window, maximized: !window.maximized } : window,
      ),
    );
  }

  function moveWindow(id: string, positionX: number, positionY: number): void {
    setWindows((previous) =>
      previous.map((window) => (window.id === id ? { ...window, positionX, positionY } : window)),
    );
  }

  function resizeWindow(id: string, width: number, height: number): void {
    setWindows((previous) =>
      previous.map((window) => (window.id === id ? { ...window, width, height } : window)),
    );
  }

  const focusedId =
    windows.length > 0 ? [...windows].sort((a, b) => b.zIndex - a.zIndex)[0].id : null;

  return (
    <WindowOpenerProvider opener={{ openApp }}>
      <div className="portfolio" ref={containerRef}>
        <div className="wp-orb wp-orb-1"></div>
        <div className="wp-orb wp-orb-2"></div>

        <div className="desk-icons">
          {DESKTOP_ICONS.map((item) => (
            <button
              key={item.id}
              className="desk-icon"
              onDoubleClick={() => openApp(item.id)}
              onClick={(event) => event.currentTarget.classList.add("sel")}
              onBlur={(event) => event.currentTarget.classList.remove("sel")}
            >
              <div className="di-ico">{item.icon}</div>
              <div className="di-label">{item.label}</div>
            </button>
          ))}
        </div>

        {showStartHint && (
          <div className="welcome-hint mono" onClick={() => setShowStartHint(false)}>
            <div className="hint-arrow">↓</div>
            <div>tip: double-click any icon, or use the launcher below</div>
          </div>
        )}

        {windows.map((window) => {
          const meta = APPS[window.appId];
          const Component = meta.Component;
          return (
            <PWindow
              key={window.id}
              title={meta.title}
              icon={meta.icon}
              positionX={window.positionX}
              positionY={window.positionY}
              width={window.width}
              height={window.height}
              zIndex={window.zIndex}
              focused={window.id === focusedId}
              minimized={window.minimized}
              maximized={window.maximized}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              onFocus={() => focusWindow(window.id)}
              onClose={() => closeWindow(window.id)}
              onMinimize={() => minimizeWindow(window.id)}
              onMaximize={() => toggleMaximize(window.id)}
              onMove={(positionX, positionY) => moveWindow(window.id, positionX, positionY)}
              onResize={(width, height) => resizeWindow(window.id, width, height)}
            >
              <Component />
            </PWindow>
          );
        })}

        {launcherOpen && (
          <>
            <div className="launcher-bg" onClick={() => setLauncherOpen(false)}></div>
            <div className="launcher" onClick={(event) => event.stopPropagation()}>
              <div className="launcher-hdr">
                <div className="lh-avatar">TM</div>
                <div className="lh-info">
                  <div className="lh-name">Taggart Maher</div>
                  <div className="lh-sub mono">taggart@tm-portfolio</div>
                </div>
              </div>
              <div className="launcher-search mono">
                <span className="ls-prefix">⌕</span>
                <span className="ls-placeholder">type / pick / open ...</span>
              </div>
              <div className="launcher-section mono">APPLICATIONS</div>
              <div className="launcher-grid">
                {(Object.entries(APPS) as Array<[AppId, AppMeta]>)
                  .filter(([id]) => id !== "home")
                  .map(([id, app]) => (
                    <button key={id} className="launcher-item" onClick={() => openApp(id)}>
                      <div className="li-ico">{app.icon}</div>
                      <div className="li-name">{id.charAt(0).toUpperCase() + id.slice(1)}</div>
                    </button>
                  ))}
                <button className="launcher-item" onClick={() => openApp("home")}>
                  <div className="li-ico">📁</div>
                  <div className="li-name">Home</div>
                </button>
              </div>
              <div className="launcher-foot mono">
                <span>
                  {windows.length} window{windows.length === 1 ? "" : "s"} open
                </span>
                <span>esc to close focused</span>
              </div>
            </div>
          </>
        )}

        <div className="taskbar">
          <button
            className={"tb-launcher" + (launcherOpen ? " active" : "")}
            onClick={() => setLauncherOpen((open) => !open)}
          >
            <div className="tb-launch-ico">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
            <span className="mono">tm-portfolio</span>
          </button>
          <div className="tb-divider"></div>
          <div className="tb-tasks">
            {windows.map((window) => {
              const meta = APPS[window.appId];
              const isFocused = window.id === focusedId && !window.minimized;
              return (
                <button
                  key={window.id}
                  className={
                    "tb-task" +
                    (isFocused ? " focused" : "") +
                    (window.minimized ? " minimized" : "")
                  }
                  onClick={() => {
                    if (window.minimized) focusWindow(window.id);
                    else if (isFocused) minimizeWindow(window.id);
                    else focusWindow(window.id);
                  }}
                >
                  <span className="tb-task-ico">{meta.icon}</span>
                  <span className="tb-task-label">{meta.title.split(" — ")[0]}</span>
                </button>
              );
            })}
          </div>
          <div className="tb-tray">
            <div className="tray-icons mono">
              <span title="Notifications">●</span>
              <span title="Network">⌁</span>
              <span title="Battery">▮</span>
            </div>
            <div className="tb-clock mono">
              <div className="tb-time">{formatTime(now)}</div>
              <div className="tb-date">{formatDate(now)}</div>
            </div>
          </div>
        </div>
      </div>
    </WindowOpenerProvider>
  );
}
