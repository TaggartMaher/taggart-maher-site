<script lang="ts">
  import { onMount } from "svelte";
  import "./portfolio.css";
  import Icon, { type IconName } from "./Icon.svelte";
  import PWindow from "./PWindow.svelte";
  import {
    setSelectionState,
    setWindowOpener,
    type AppId,
    type SelectionState,
  } from "./apps/appsContext";
  import AboutApp from "./apps/AboutApp.svelte";
  import BlogApp from "./apps/BlogApp.svelte";
  import ContactApp from "./apps/ContactApp.svelte";
  import ExperienceApp from "./apps/ExperienceApp.svelte";
  import HomeApp from "./apps/HomeApp.svelte";
  import MysteryApp from "./apps/MysteryApp.svelte";
  import ProjectsApp from "./apps/ProjectsApp.svelte";
  import ReadmeApp from "./apps/ReadmeApp.svelte";
  import SettingsApp from "./apps/SettingsApp.svelte";
  import { PROJECTS } from "./content/projects";
  import { setInternalLinkHandler } from "./content/internalLink";
  import { getRouter } from "../router/routerContext";
  import { pathForState, targetForPath, type DesktopRouterTarget } from "./desktopRouter";
  import type { Component } from "svelte";

  const TASKBAR_HEIGHT = 56;

  // Default window sizes from the design handoff. These are tuned for a
  // ~1600px-wide working area; we scale them to the actual container so the
  // proportions hold whether the screen rect is 600px wide or 2000px wide.
  const REFERENCE_CONTAINER_WIDTH = 1600;

  interface AppMeta {
    title: string;
    icon: IconName;
    defaultWidth: number;
    defaultHeight: number;
    AppComponent: Component;
  }

  const APPS: Record<AppId, AppMeta> = {
    home: {
      title: "Home — File Manager",
      icon: "folder",
      defaultWidth: 1400,
      defaultHeight: 826,
      AppComponent: HomeApp,
    },
    about: {
      title: "About Me — Document",
      icon: "person",
      defaultWidth: 1400,
      defaultHeight: 1087,
      AppComponent: AboutApp,
    },
    experience: {
      title: "Experience — Document",
      icon: "list",
      defaultWidth: 1400,
      defaultHeight: 989,
      AppComponent: ExperienceApp,
    },
    projects: {
      title: "Projects — Browser",
      icon: "wrench",
      defaultWidth: 1400,
      defaultHeight: 825,
      AppComponent: ProjectsApp,
    },
    blog: {
      title: "Blog — Reader",
      icon: "pencil",
      defaultWidth: 1400,
      defaultHeight: 1087,
      AppComponent: BlogApp,
    },
    mystery: {
      title: "Mystery — CLASSIFIED",
      icon: "lock",
      defaultWidth: 1400,
      defaultHeight: 1006,
      AppComponent: MysteryApp,
    },
    readme: {
      title: "README.md — Editor",
      icon: "document",
      defaultWidth: 1400,
      defaultHeight: 1039,
      AppComponent: ReadmeApp,
    },
    contact: {
      title: "Contact",
      icon: "envelope",
      defaultWidth: 1400,
      defaultHeight: 1110,
      AppComponent: ContactApp,
    },
    settings: {
      title: "Site Settings",
      icon: "gear",
      defaultWidth: 1400,
      defaultHeight: 1126,
      AppComponent: SettingsApp,
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

  const DESKTOP_ICONS: Array<{ id: AppId; label: string; icon: IconName }> = [
    { id: "about", label: "About Me", icon: "person" },
    { id: "experience", label: "Experience", icon: "list" },
    { id: "projects", label: "Projects", icon: "wrench" },
    { id: "blog", label: "Blog", icon: "pencil" },
    { id: "mystery", label: "Mystery", icon: "lock" },
    { id: "readme", label: "README.md", icon: "document" },
    { id: "contact", label: "Contact", icon: "envelope" },
  ];

  // Apps shown in the launcher grid. Settings is intentionally absent —
  // it has its own taskbar entry and is reachable via /settings or the
  // README link, but doesn't sit in the launcher next to content apps.
  const LAUNCHER_EXCLUDED_APPS: ReadonlySet<AppId> = new Set(["home", "settings"]);

  const launcherApps = (Object.entries(APPS) as Array<[AppId, AppMeta]>).filter(
    ([id]) => !LAUNCHER_EXCLUDED_APPS.has(id),
  );

  function formatHour12(date: Date): string {
    const hour24 = date.getHours();
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return String(hour12);
  }

  function formatMeridiem(date: Date): string {
    return date.getHours() < 12 ? "AM" : "PM";
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

  let { ecoMode, onToggleEcoMode }: PortfolioProps = $props();

  const router = getRouter();

  let containerElement: HTMLDivElement | null = null;
  // Wallpaper-orb elements. The orb positions are driven from JS (not
  // CSS animations) so the ScreenOverlay foreignObject rasterizer
  // captures their current transform inline. CSS animations are
  // re-parsed inside each SVG snapshot and restart from frame 0, which
  // would freeze the orbs in the bounce-light texture.
  let wallpaperOrbit1Element: HTMLDivElement | null = null;
  let wallpaperOrbit2Element: HTMLDivElement | null = null;
  let wallpaperOrb1Element: HTMLDivElement | null = null;
  let wallpaperOrb2Element: HTMLDivElement | null = null;

  let containerSize = $state({ width: 0, height: 0 });
  let windows = $state<WindowState[]>([]);
  // zCounter is read from inside callbacks but never rendered — a plain
  // variable, so bringing a window forward doesn't invalidate anything
  // else.
  let zCounter = 10;
  let launcherOpen = $state(false);
  let now = $state(new Date());
  let showStartHint = $state(true);
  // Selection state for the projects/blog windows is held here so the
  // URL ↔ state sync below can read and write it directly.
  let projectsSelectedId = $state<string>(PROJECTS[0].id);
  let blogSelectedId = $state<string | null>(null);
  // Has the URL→state effect already kicked in once? Until it does we
  // suppress the bootstrap "open the readme on first mount" flow,
  // because the URL might say something like /blog/foo and we don't
  // want the wrong window opening first.
  let hasRunUrlBootstrap = false;

  // Track container size — all window math is container-relative because
  // the Portfolio is mounted inside the screen-rect overlay, not the
  // viewport. Use offsetWidth/offsetHeight (CSS layout pixels), not
  // getBoundingClientRect (post-transform viewport pixels): the parent
  // .screen-overlay applies a matrix3d perspective, and we want window
  // positions and sizes to live in the un-transformed natural space
  // that positionX/Y / width / height are interpreted against.
  onMount(() => {
    const node = containerElement;
    if (!node) return;
    function updateSize(): void {
      if (!node) return;
      containerSize = { width: node.offsetWidth, height: node.offsetHeight };
    }
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  });

  // Tick the clock twice a minute so the displayed minute stays fresh.
  onMount(() => {
    const interval = setInterval(() => (now = new Date()), 30 * 1000);
    return () => clearInterval(interval);
  });

  // Animate the wallpaper orbs by writing inline transforms each frame.
  // The MutationObserver inside ScreenOverlay flips its dirty flag on
  // these style writes, so the bounce-light texture re-rasterizes and
  // the orbs animate in the reflection too.
  onMount(() => {
    const containerNode = containerElement;
    if (!containerNode) return;
    const startTimestamp = performance.now();
    let animationFrameHandle: number | null = null;

    const orbit1PeriodSeconds = 24;
    const orbit2PeriodSeconds = 29;
    const spiral1PeriodSeconds = 11;
    const spiral2PeriodSeconds = 15;

    function easeInOutCubic(progress: number): number {
      return progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    }

    function alternatingPhase(elapsedSeconds: number, periodSeconds: number): number {
      const phase = (elapsedSeconds % (periodSeconds * 2)) / periodSeconds;
      return phase > 1 ? 2 - phase : phase;
    }

    function tick(): void {
      const orbit1 = wallpaperOrbit1Element;
      const orbit2 = wallpaperOrbit2Element;
      const orb1 = wallpaperOrb1Element;
      const orb2 = wallpaperOrb2Element;
      if (containerNode && orbit1 && orbit2 && orb1 && orb2) {
        const elapsedSeconds = (performance.now() - startTimestamp) / 1000;
        const containerWidth = containerNode.clientWidth;
        const containerHeight = containerNode.clientHeight;

        const orbit1AngleDeg = (elapsedSeconds / orbit1PeriodSeconds) * 360;
        const orbit2AngleDeg = -(elapsedSeconds / orbit2PeriodSeconds) * 360;
        orbit1.style.transform = `rotate(${orbit1AngleDeg}deg)`;
        orbit2.style.transform = `rotate(${orbit2AngleDeg}deg)`;

        const spiral1Progress = easeInOutCubic(
          alternatingPhase(elapsedSeconds, spiral1PeriodSeconds),
        );
        const orb1XPercent = 28 + (20 - 28) * spiral1Progress;
        const orb1YPercent = -28 + (-18 - -28) * spiral1Progress;
        orb1.style.transform = `translate(${(orb1XPercent / 100) * containerWidth}px, ${
          (orb1YPercent / 100) * containerHeight
        }px)`;

        const spiral2Progress = easeInOutCubic(
          alternatingPhase(elapsedSeconds, spiral2PeriodSeconds),
        );
        const orb2XPercent = -26 + (-18 - -26) * spiral2Progress;
        const orb2YPercent = 26 + (18 - 26) * spiral2Progress;
        orb2.style.transform = `translate(${(orb2XPercent / 100) * containerWidth}px, ${
          (orb2YPercent / 100) * containerHeight
        }px)`;
      }
      animationFrameHandle = requestAnimationFrame(tick);
    }

    animationFrameHandle = requestAnimationFrame(tick);
    return () => {
      if (animationFrameHandle !== null) cancelAnimationFrame(animationFrameHandle);
    };
  });

  function openApp(appId: AppId, override?: OpenAppOverride): void {
    showStartHint = false;
    launcherOpen = false;
    zCounter += 1;
    const nextZ = zCounter;
    const existing = windows.find((windowState) => windowState.appId === appId);
    if (existing) {
      existing.zIndex = nextZ;
      existing.minimized = false;
      return;
    }
    const meta = APPS[appId];
    const containerWidth = containerSize.width;
    const containerHeight = containerSize.height;
    // If the container hasn't been measured yet (or a transient
    // ResizeObserver write returned 0), fall back to a scale of 1 and
    // skip the upper clamp — otherwise the math collapses every new
    // window to the 360×280 floor (scale 0 → scaledWidth 0 → upper
    // clamp containerWidth-20 = -20 → Math.max(360, -20) = 360).
    const hasMeasuredContainer = containerWidth > 0 && containerHeight > 0;
    const scale = hasMeasuredContainer
      ? Math.min(containerWidth / REFERENCE_CONTAINER_WIDTH, 1)
      : 1;
    const scaledWidth = override?.width ?? Math.round(meta.defaultWidth * scale);
    const scaledHeight = override?.height ?? Math.round(meta.defaultHeight * scale);
    const usableHeight = containerHeight - TASKBAR_HEIGHT;
    const clampedWidth = hasMeasuredContainer
      ? Math.max(360, Math.min(scaledWidth, containerWidth - 20))
      : Math.max(360, scaledWidth);
    const clampedHeight = hasMeasuredContainer
      ? Math.max(280, Math.min(scaledHeight, usableHeight - 20))
      : Math.max(280, scaledHeight);
    const positionX = override?.positionX ?? 180;
    const positionY = override?.positionY ?? 0;
    windows = [
      ...windows,
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
  }

  // URL → state. Whenever the live router path changes (initial mount
  // included) translate it into a desktop window action: open or focus
  // the matching app, plus apply any sub-selection.
  let lastDispatchedPath: string | null = null;
  $effect(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return;
    if (lastDispatchedPath === router.path) return;
    lastDispatchedPath = router.path;
    const target: DesktopRouterTarget | null = targetForPath(router.path);
    if (!target) return;
    if (target.appId === "projects" && target.projectsSubId) {
      projectsSelectedId = target.projectsSubId;
    }
    if (target.appId === "blog") {
      blogSelectedId = target.blogSubId ?? null;
    }
    openApp(target.appId);
    hasRunUrlBootstrap = true;
  });

  // Esc closes top window or the launcher. The handler reads the live
  // state, so a single mount-scoped listener suffices.
  onMount(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      if (launcherOpen) {
        launcherOpen = false;
        return;
      }
      if (windows.length === 0) return;
      const top = [...windows].sort((a, b) => b.zIndex - a.zIndex)[0];
      windows = windows.filter((windowState) => windowState.id !== top.id);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  // Single-window updates mutate the window's $state object in place —
  // Svelte's deep proxy makes that fine-grained, so a drag frame only
  // touches the dragged window's style bindings instead of rebuilding
  // the windows array. Adding and removing windows still reassign the
  // array (openApp, closeWindow, the Esc handler).
  function findWindow(id: string): WindowState | undefined {
    return windows.find((windowState) => windowState.id === id);
  }

  function closeWindow(id: string): void {
    windows = windows.filter((windowState) => windowState.id !== id);
  }

  function focusWindow(id: string): void {
    const windowState = findWindow(id);
    if (!windowState) return;
    zCounter += 1;
    windowState.zIndex = zCounter;
    windowState.minimized = false;
  }

  function minimizeWindow(id: string): void {
    const windowState = findWindow(id);
    if (!windowState) return;
    windowState.minimized = true;
  }

  function toggleMaximize(id: string): void {
    const windowState = findWindow(id);
    if (!windowState) return;
    windowState.maximized = !windowState.maximized;
  }

  function moveWindow(id: string, positionX: number, positionY: number): void {
    const windowState = findWindow(id);
    if (!windowState) return;
    windowState.positionX = positionX;
    windowState.positionY = positionY;
  }

  function resizeWindow(id: string, width: number, height: number): void {
    const windowState = findWindow(id);
    if (!windowState) return;
    windowState.width = width;
    windowState.height = height;
  }

  const focusedWindow = $derived(
    windows.length > 0
      ? ([...windows]
          .filter((windowState) => !windowState.minimized)
          .sort((a, b) => b.zIndex - a.zIndex)[0] ?? null)
      : null,
  );
  const focusedId = $derived(focusedWindow ? focusedWindow.id : null);
  const focusedAppId: AppId | null = $derived(focusedWindow ? focusedWindow.appId : null);

  // State → URL. When focus or selection changes, replaceState to the
  // matching path so a same-tab refresh / "copy link" lands the user
  // back where they were. Selection changes use replace (not push) so
  // back/forward walks across windows, not across selections — the
  // only push entries come from <Link> clicks via the router.
  let lastWrittenPath: string | null = null;
  $effect(() => {
    const nextPath = pathForState({
      focusedAppId,
      projectsSelectedId,
      blogSelectedId,
    });
    if (!hasRunUrlBootstrap) return;
    if (lastWrittenPath === nextPath) return;
    lastWrittenPath = nextPath;
    if (router.path === nextPath) return;
    router.replace(nextPath);
  });

  // Markdown links inside the screen surface route through the same
  // global router so /about → opens the about window with no reload.
  // Paths without an app mapping fall through to a full reload, which
  // re-runs chooseMode and lands the user in the lite view.
  function handleInternalNavigate(href: string): void {
    const target = targetForPath(href);
    if (!target) {
      window.location.assign(href);
      return;
    }
    router.navigate(href);
  }

  setWindowOpener({ openApp });

  const selectionState: SelectionState = {
    get projectsSelectedId() {
      return projectsSelectedId;
    },
    setProjectsSelectedId: (id: string) => {
      projectsSelectedId = id;
    },
    get blogSelectedId() {
      return blogSelectedId;
    },
    setBlogSelectedId: (id: string | null) => {
      blogSelectedId = id;
    },
  };
  setSelectionState(selectionState);

  setInternalLinkHandler(handleInternalNavigate);
</script>

<div class="portfolio" bind:this={containerElement}>
  <div class="wp-orbit wp-orbit-1" bind:this={wallpaperOrbit1Element}>
    <div class="wp-orb wp-orb-1" bind:this={wallpaperOrb1Element}></div>
  </div>
  <div class="wp-orbit wp-orbit-2" bind:this={wallpaperOrbit2Element}>
    <div class="wp-orb wp-orb-2" bind:this={wallpaperOrb2Element}></div>
  </div>

  <div class="desk-icons">
    {#each DESKTOP_ICONS as item (item.id)}
      <button
        class="desk-icon"
        ondblclick={() => openApp(item.id)}
        onclick={(event) => event.currentTarget.classList.add("sel")}
        onblur={(event) => event.currentTarget.classList.remove("sel")}
      >
        <div class="di-ico"><Icon name={item.icon} /></div>
        <div class="di-label">{item.label}</div>
      </button>
    {/each}
  </div>

  {#if showStartHint}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="welcome-hint mono" onclick={() => (showStartHint = false)}>
      <div class="hint-arrow">↓</div>
      <div>tip: double-click any icon, or use the launcher below</div>
    </div>
  {/if}

  {#each windows as windowState (windowState.id)}
    {@const meta = APPS[windowState.appId]}
    <PWindow
      windowId={windowState.id}
      title={meta.title}
      icon={meta.icon}
      positionX={windowState.positionX}
      positionY={windowState.positionY}
      width={windowState.width}
      height={windowState.height}
      zIndex={windowState.zIndex}
      focused={windowState.id === focusedId}
      minimized={windowState.minimized}
      maximized={windowState.maximized}
      containerWidth={containerSize.width}
      containerHeight={containerSize.height}
      onFocus={focusWindow}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={toggleMaximize}
      onMove={moveWindow}
      onResize={resizeWindow}
    >
      <meta.AppComponent />
    </PWindow>
  {/each}

  {#if launcherOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="launcher-bg" onclick={() => (launcherOpen = false)}></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="launcher" onclick={(event) => event.stopPropagation()}>
      <div class="launcher-hdr">
        <div class="lh-avatar">TM</div>
        <div class="lh-info">
          <div class="lh-name">Taggart Maher</div>
          <div class="lh-sub mono">taggart@tm-portfolio</div>
        </div>
      </div>
      <div class="launcher-section mono">APPLICATIONS</div>
      <div class="launcher-grid">
        {#each launcherApps as [id, app] (id)}
          <button class="launcher-item" onclick={() => openApp(id)}>
            <div class="li-ico"><Icon name={app.icon} /></div>
            <div class="li-name">{id.charAt(0).toUpperCase() + id.slice(1)}</div>
          </button>
        {/each}
        <button class="launcher-item" onclick={() => openApp("home")}>
          <div class="li-ico">
            <Icon name="folder" />
          </div>
          <div class="li-name">Home</div>
        </button>
      </div>
      <div class="launcher-foot mono">
        <span>{windows.length} window{windows.length === 1 ? "" : "s"} open</span>
        <span>esc to close focused</span>
      </div>
    </div>
  {/if}

  <div class="taskbar">
    <button
      class={"tb-launcher" + (launcherOpen ? " active" : "")}
      onclick={() => (launcherOpen = !launcherOpen)}
    >
      <div class="tb-launch-ico">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
      <span class="mono">tm-portfolio</span>
    </button>
    <div class="tb-divider"></div>
    <div class="tb-tasks">
      {#each windows as windowState (windowState.id)}
        {@const meta = APPS[windowState.appId]}
        {@const isFocused = windowState.id === focusedId && !windowState.minimized}
        <button
          class={"tb-task" +
            (isFocused ? " focused" : "") +
            (windowState.minimized ? " minimized" : "")}
          onclick={() => {
            if (windowState.minimized) focusWindow(windowState.id);
            else if (isFocused) minimizeWindow(windowState.id);
            else focusWindow(windowState.id);
          }}
        >
          <span class="tb-task-ico"><Icon name={meta.icon} /></span>
          <span class="tb-task-label">{meta.title.split(" — ")[0]}</span>
        </button>
      {/each}
    </div>
    <div class="tb-mode-buttons">
      <button
        type="button"
        class="tb-mode-button tb-eco mono"
        title={ecoMode ? "Restore full-quality rendering." : "Reduce GPU and bandwidth use."}
        onclick={onToggleEcoMode}
      >
        <Icon name="leaf" />
        {ecoMode ? "DISABLE ECO MODE" : "ECO MODE"}
      </button>
      <button
        type="button"
        class="tb-mode-button tb-settings mono"
        title="Choose how this site is rendered."
        onclick={() => openApp("settings")}
      >
        <Icon name="gear" /> Site Settings
      </button>
    </div>
    <div class="tb-tray">
      <div class="tb-clock mono">
        <div class="tb-date">{formatDate(now)}</div>
        <div class="tb-clock-divider" aria-hidden="true"></div>
        <div class="tb-time">
          <div class="tb-hour">{formatHour12(now)}</div>
          <div class="tb-meridiem">{formatMeridiem(now)}</div>
          <div class="tb-minute">{formatMinute(now)}</div>
        </div>
      </div>
    </div>
  </div>
</div>
