import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import "./portfolio.css";
import { Icon } from "./Icon";
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
  SelectionProvider,
  SettingsApp,
  WindowOpenerProvider,
  type AppId,
  type SelectionState,
} from "./apps";
import { PROJECTS } from "./content/projects";
import { InternalLinkProvider } from "./content/Markdown";
import { useRouter } from "../router/useRouter";
import { pathForState, targetForPath, type DesktopRouterTarget } from "./useDesktopRouter";

const TASKBAR_HEIGHT = 56;

// Default window sizes from the design handoff. These are tuned for a
// ~1600px-wide working area; we scale them to the actual container so the
// proportions hold whether the screen rect is 600px wide or 2000px wide.
const REFERENCE_CONTAINER_WIDTH = 1600;

interface AppMeta {
  title: string;
  icon: ReactNode;
  defaultWidth: number;
  defaultHeight: number;
  Component: ComponentType;
}

const APPS: Record<AppId, AppMeta> = {
  home: {
    title: "Home — File Manager",
    icon: <Icon name="folder" />,
    defaultWidth: 880,
    defaultHeight: 560,
    Component: HomeApp,
  },
  about: {
    title: "About Me — Document",
    icon: <Icon name="person" />,
    defaultWidth: 960,
    defaultHeight: 800,
    Component: AboutApp,
  },
  experience: {
    title: "Experience — Document",
    icon: <Icon name="brain" />,
    defaultWidth: 1010,
    defaultHeight: 770,
    Component: ExperienceApp,
  },
  projects: {
    title: "Projects — Browser",
    icon: <Icon name="wrench" />,
    defaultWidth: 1300,
    defaultHeight: 825,
    Component: ProjectsApp,
  },
  blog: {
    title: "Blog — Reader",
    icon: <Icon name="pencil" />,
    defaultWidth: 960,
    defaultHeight: 800,
    Component: BlogApp,
  },
  mystery: {
    title: "Mystery — CLASSIFIED",
    icon: <Icon name="lock" />,
    defaultWidth: 960,
    defaultHeight: 745,
    Component: MysteryApp,
  },
  readme: {
    title: "README.md — Editor",
    icon: <Icon name="document" />,
    defaultWidth: 930,
    defaultHeight: 745,
    Component: ReadmeApp,
  },
  contact: {
    title: "Contact",
    icon: <Icon name="envelope" />,
    defaultWidth: 745,
    defaultHeight: 640,
    Component: ContactApp,
  },
  settings: {
    title: "Site Settings",
    icon: <Icon name="gear" />,
    defaultWidth: 880,
    defaultHeight: 760,
    Component: SettingsApp,
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

const DESKTOP_ICONS: Array<{ id: AppId; label: string; icon: ReactNode }> = [
  { id: "about", label: "About Me", icon: <Icon name="person" /> },
  { id: "experience", label: "Experience", icon: <Icon name="brain" /> },
  { id: "projects", label: "Projects", icon: <Icon name="wrench" /> },
  { id: "blog", label: "Blog", icon: <Icon name="pencil" /> },
  { id: "mystery", label: "Mystery", icon: <Icon name="lock" /> },
  { id: "readme", label: "README.md", icon: <Icon name="document" /> },
  { id: "contact", label: "Contact", icon: <Icon name="envelope" /> },
];

// Apps shown in the launcher grid. Settings is intentionally absent —
// it has its own taskbar entry and is reachable via /settings or the
// README link, but doesn't sit in the launcher next to content apps.
const LAUNCHER_EXCLUDED_APPS: ReadonlySet<AppId> = new Set(["home", "settings"]);

function formatHourLabel(date: Date): string {
  const hour24 = date.getHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const meridiem = hour24 < 12 ? "AM" : "PM";
  return `${hour12} ${meridiem}`;
}

function formatMinute(date: Date): string {
  return String(date.getMinutes()).padStart(2, "0");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface PortfolioProps {
  // Reflects the user's eco-mode debug setting. The taskbar toggle
  // button reads this for its label and calls back through
  // `onToggleEcoMode` to flip it.
  ecoMode: boolean;
  onToggleEcoMode: () => void;
}

export function Portfolio({ ecoMode, onToggleEcoMode }: PortfolioProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [windows, setWindows] = useState<WindowState[]>([]);
  // zCounter is read from inside callbacks but never rendered; a ref
  // avoids re-rendering Portfolio every time we bring a window forward,
  // and keeps the per-window callbacks stable so React.memo'd PWindow
  // can bail out on unrelated drag updates.
  const zCounterRef = useRef(10);
  // Mirror containerSize so openApp can stay a stable useCallback —
  // openApp reads it for first-time window placement only, so a ref
  // read per call is enough.
  const containerSizeRef = useRef(containerSize);
  containerSizeRef.current = containerSize;
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [showStartHint, setShowStartHint] = useState(true);
  // Selection state for the projects/blog windows is held here so the
  // URL ↔ state sync below can read and write it directly.
  const [projectsSelectedId, setProjectsSelectedId] = useState<string>(PROJECTS[0].id);
  const [blogSelectedId, setBlogSelectedId] = useState<string | null>(null);
  // Has the URL→state effect already kicked in once? Until it does we
  // suppress the bootstrap "open the readme on first mount" flow,
  // because the URL might say something like /blog/foo and we don't
  // want the wrong window opening first.
  const hasRunUrlBootstrapRef = useRef(false);

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

  const openApp = useCallback((appId: AppId, override?: OpenAppOverride): void => {
    setShowStartHint(false);
    setLauncherOpen(false);
    setWindows((previous) => {
      zCounterRef.current += 1;
      const nextZ = zCounterRef.current;
      const existing = previous.find((window) => window.appId === appId);
      if (existing) {
        return previous.map((window) =>
          window.appId === appId ? { ...window, zIndex: nextZ, minimized: false } : window,
        );
      }
      const meta = APPS[appId];
      const containerWidth = containerSizeRef.current.width;
      const containerHeight = containerSizeRef.current.height;
      const scale = Math.min(containerWidth / REFERENCE_CONTAINER_WIDTH, 1);
      const scaledWidth = override?.width ?? Math.round(meta.defaultWidth * scale);
      const scaledHeight = override?.height ?? Math.round(meta.defaultHeight * scale);
      const usableHeight = containerHeight - TASKBAR_HEIGHT;
      const clampedWidth = Math.max(360, Math.min(scaledWidth, containerWidth - 20));
      const clampedHeight = Math.max(280, Math.min(scaledHeight, usableHeight - 20));
      const positionX =
        override?.positionX ?? Math.max(20, Math.round((containerWidth - clampedWidth) / 2));
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
  }, []);

  // URL → state. Whenever the live router path changes (initial mount
  // included) translate it into a desktop window action: open or focus
  // the matching app, plus apply any sub-selection.
  const lastDispatchedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return;
    if (lastDispatchedPathRef.current === router.path) return;
    lastDispatchedPathRef.current = router.path;
    const target: DesktopRouterTarget | null = targetForPath(router.path);
    if (!target) return;
    if (target.appId === "projects" && target.projectsSubId) {
      setProjectsSelectedId(target.projectsSubId);
    }
    if (target.appId === "blog") {
      setBlogSelectedId(target.blogSubId ?? null);
    }
    // The readme is the home target — open it with the larger
    // bootstrap layout that the original code used so first-load
    // doesn't reuse the small default size for this special window.
    if (target.appId === "readme" && !hasRunUrlBootstrapRef.current) {
      const usableHeight = containerSize.height - TASKBAR_HEIGHT;
      const targetHeight = Math.round(usableHeight * 0.9);
      const targetWidth = Math.round(containerSize.width / 2);
      const positionX = Math.round((containerSize.width - targetWidth) / 2);
      const positionY = Math.round((usableHeight - targetHeight) / 2);
      openApp("readme", { positionX, positionY, width: targetWidth, height: targetHeight });
    } else {
      openApp(target.appId);
    }
    hasRunUrlBootstrapRef.current = true;
  }, [router.path, containerSize.width, containerSize.height, openApp]);

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

  // All window mutations go through stable useCallbacks so React.memo'd
  // PWindow only reconciles when its own props change — a drag of one
  // window leaves the others untouched.
  const closeWindow = useCallback((id: string): void => {
    setWindows((previous) => previous.filter((window) => window.id !== id));
  }, []);

  const focusWindow = useCallback((id: string): void => {
    setWindows((previous) => {
      zCounterRef.current += 1;
      const nextZ = zCounterRef.current;
      return previous.map((window) =>
        window.id === id ? { ...window, zIndex: nextZ, minimized: false } : window,
      );
    });
  }, []);

  const minimizeWindow = useCallback((id: string): void => {
    setWindows((previous) =>
      previous.map((window) => (window.id === id ? { ...window, minimized: true } : window)),
    );
  }, []);

  const toggleMaximize = useCallback((id: string): void => {
    setWindows((previous) =>
      previous.map((window) =>
        window.id === id ? { ...window, maximized: !window.maximized } : window,
      ),
    );
  }, []);

  const moveWindow = useCallback((id: string, positionX: number, positionY: number): void => {
    setWindows((previous) =>
      previous.map((window) => (window.id === id ? { ...window, positionX, positionY } : window)),
    );
  }, []);

  const resizeWindow = useCallback((id: string, width: number, height: number): void => {
    setWindows((previous) =>
      previous.map((window) => (window.id === id ? { ...window, width, height } : window)),
    );
  }, []);

  const focusedWindow =
    windows.length > 0
      ? ([...windows]
          .filter((window) => !window.minimized)
          .sort((a, b) => b.zIndex - a.zIndex)[0] ?? null)
      : null;
  const focusedId = focusedWindow ? focusedWindow.id : null;
  const focusedAppId: AppId | null = focusedWindow ? focusedWindow.appId : null;

  // State → URL. When focus or selection changes, replaceState to the
  // matching path so a same-tab refresh / "copy link" lands the user
  // back where they were. Selection changes use replace (not push) so
  // back/forward walks across windows, not across selections — the
  // only push entries come from <Link> clicks via the router.
  const lastWrittenPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasRunUrlBootstrapRef.current) return;
    const nextPath = pathForState({
      focusedAppId,
      projectsSelectedId,
      blogSelectedId,
    });
    if (lastWrittenPathRef.current === nextPath) return;
    lastWrittenPathRef.current = nextPath;
    if (router.path === nextPath) return;
    router.replace(nextPath);
  }, [focusedAppId, projectsSelectedId, blogSelectedId, router]);

  // Markdown links inside the screen surface route through the same
  // global router so /about → opens the about window with no reload.
  // Paths without an app mapping fall through to a full reload, which
  // re-runs chooseMode and lands the user in the lite view.
  const handleInternalNavigate = useCallback(
    (href: string) => {
      const target = targetForPath(href);
      if (!target) {
        window.location.assign(href);
        return;
      }
      router.navigate(href);
    },
    [router],
  );

  const selectionState = useMemo<SelectionState>(
    () => ({
      projectsSelectedId,
      setProjectsSelectedId,
      blogSelectedId,
      setBlogSelectedId,
    }),
    [projectsSelectedId, blogSelectedId],
  );

  const windowOpener = useMemo(() => ({ openApp }), [openApp]);

  return (
    <WindowOpenerProvider opener={windowOpener}>
      <SelectionProvider state={selectionState}>
        <InternalLinkProvider onNavigate={handleInternalNavigate}>
          <div className="portfolio" ref={containerRef}>
            <div className="wp-orbit wp-orbit-1">
              <div className="wp-orb wp-orb-1"></div>
            </div>
            <div className="wp-orbit wp-orbit-2">
              <div className="wp-orb wp-orb-2"></div>
            </div>

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
                  windowId={window.id}
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
                  onFocus={focusWindow}
                  onClose={closeWindow}
                  onMinimize={minimizeWindow}
                  onMaximize={toggleMaximize}
                  onMove={moveWindow}
                  onResize={resizeWindow}
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
                  <div className="launcher-section mono">APPLICATIONS</div>
                  <div className="launcher-grid">
                    {(Object.entries(APPS) as Array<[AppId, AppMeta]>)
                      .filter(([id]) => !LAUNCHER_EXCLUDED_APPS.has(id))
                      .map(([id, app]) => (
                        <button key={id} className="launcher-item" onClick={() => openApp(id)}>
                          <div className="li-ico">{app.icon}</div>
                          <div className="li-name">{id.charAt(0).toUpperCase() + id.slice(1)}</div>
                        </button>
                      ))}
                    <button className="launcher-item" onClick={() => openApp("home")}>
                      <div className="li-ico">
                        <Icon name="folder" />
                      </div>
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
              <div className="tb-mode-buttons">
                <button
                  type="button"
                  className="tb-mode-button tb-eco mono"
                  title={
                    ecoMode ? "Restore full-quality rendering." : "Reduce GPU and bandwidth use."
                  }
                  onClick={onToggleEcoMode}
                >
                  <Icon name="leaf" /> {ecoMode ? "DISABLE ECO MODE" : "ECO MODE"}
                </button>
                <button
                  type="button"
                  className="tb-mode-button tb-settings mono"
                  title="Choose how this site is rendered."
                  onClick={() => openApp("settings")}
                >
                  <Icon name="gear" /> Site Settings
                </button>
              </div>
              <div className="tb-tray">
                <div className="tb-clock mono">
                  <div className="tb-date">{formatDate(now)}</div>
                  <div className="tb-time">
                    <div className="tb-hour">{formatHourLabel(now)}</div>
                    <div className="tb-minute">{formatMinute(now)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </InternalLinkProvider>
      </SelectionProvider>
    </WindowOpenerProvider>
  );
}
