// Desktop shell — wallpaper, desktop icons, taskbar, window manager.

const { useState: dS, useEffect: dE, useRef: dR, useCallback: dC } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  accentColor: "#3daee9",
  wallpaperHue: 215,
  showGrid: false,
  clockFormat: "24h",
}; /*EDITMODE-END*/

// App registry
const APPS = {
  home: { title: "Home — File Manager", icon: "📁", w: 880, h: 560, Comp: () => null }, // filled below
  about: { title: "About Me — Document", icon: "👤", w: 960, h: 800, Comp: AboutApp },
  experience: { title: "Experience — Document", icon: "📅", w: 1010, h: 770, Comp: ExperienceApp },
  projects: { title: "Projects — Browser", icon: "🛠", w: 1300, h: 825, Comp: ProjectsApp },
  blog: { title: "Blog — Reader", icon: "📝", w: 960, h: 800, Comp: BlogApp },
  mystery: { title: "Mystery — CLASSIFIED", icon: "🔒", w: 960, h: 745, Comp: MysteryApp },
  readme: { title: "README.md — Editor", icon: "📄", w: 930, h: 745, Comp: ReadmeApp },
  contact: { title: "Contact", icon: "✉", w: 745, h: 640, Comp: ContactApp },
};

function Desktop() {
  const [t, setT] = useTweaks(TWEAK_DEFAULTS);

  // Window state — array of {id, appId, x, y, w, h, z, minimized, maximized}
  const [wins, setWins] = dS([]);
  const [zCounter, setZ] = dS(10);
  const [launcherOpen, setLauncherOpen] = dS(false);
  const [now, setNow] = dS(new Date());
  const [showStartHint, setShowStartHint] = dS(true);

  // Open README on first load + expose global opener
  dE(() => {
    window.__openApp = (id) => openApp(id);
    // README: 90% of screen height, width = 1/2 of viewport (fat).
    const vh = window.innerHeight - 44; // minus taskbar
    const vw = window.innerWidth;
    const targetH = Math.round(vh * 0.9);
    const targetW = Math.round(vw / 2);
    const x = Math.round((vw - targetW) / 2);
    const y = Math.round((vh - targetH) / 2);
    openApp("readme", { x, y, w: targetW, h: targetH });
    // eslint-disable-next-line
  }, []);

  // Tick clock
  dE(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  // Apply accent
  dE(() => {
    document.documentElement.style.setProperty("--accent", t.accentColor);
  }, [t.accentColor]);

  // Esc closes focused window
  dE(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setWins((prev) => {
          if (prev.length === 0) return prev;
          const top = [...prev].sort((a, b) => b.z - a.z)[0];
          return prev.filter((w) => w.id !== top.id);
        });
        setLauncherOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openApp = dC(
    (appId, override) => {
      setShowStartHint(false);
      setLauncherOpen(false);
      setWins((prev) => {
        // If already open, focus & un-minimize it
        const existing = prev.find((w) => w.appId === appId);
        const newZ = zCounter + 1;
        setZ(newZ);
        if (existing) {
          return prev.map((w) => (w.appId === appId ? { ...w, z: newZ, minimized: false } : w));
        }
        const meta = APPS[appId];
        const wd = override?.w ?? meta.w;
        const ht = override?.h ?? meta.h;
        const cx = override?.x ?? Math.max(20, Math.round((window.innerWidth - wd) / 2));
        const cy = override?.y ?? Math.max(20, Math.round((window.innerHeight - 44 - ht) / 2));
        return [
          ...prev,
          {
            id: appId + "-" + Date.now(),
            appId,
            x: cx,
            y: cy,
            w: wd,
            h: ht,
            z: newZ,
            minimized: false,
            maximized: false,
          },
        ];
      });
    },
    [zCounter],
  );

  const closeWin = (id) => setWins((prev) => prev.filter((w) => w.id !== id));
  const focusWin = (id) => {
    setWins((prev) => {
      const newZ = zCounter + 1;
      setZ(newZ);
      return prev.map((w) => (w.id === id ? { ...w, z: newZ, minimized: false } : w));
    });
  };
  const minimizeWin = (id) =>
    setWins((prev) => prev.map((w) => (w.id === id ? { ...w, minimized: true } : w)));
  const maximizeWin = (id) =>
    setWins((prev) => prev.map((w) => (w.id === id ? { ...w, maximized: !w.maximized } : w)));
  const moveWin = (id, x, y) =>
    setWins((prev) => prev.map((w) => (w.id === id ? { ...w, x, y } : w)));
  const resizeWin = (id, wd, h) =>
    setWins((prev) => prev.map((w) => (w.id === id ? { ...w, w: wd, h } : w)));

  const focusedId = wins.length ? [...wins].sort((a, b) => b.z - a.z)[0].id : null;

  // Desktop icons
  const desktopIcons = [
    { id: "about", label: "About Me", icon: "👤" },
    { id: "experience", label: "Experience", icon: "📅" },
    { id: "projects", label: "Projects", icon: "🛠" },
    { id: "blog", label: "Blog", icon: "📝" },
    { id: "mystery", label: "Mystery", icon: "🔒" },
    { id: "readme", label: "README.md", icon: "📄" },
    { id: "contact", label: "Contact", icon: "✉" },
  ];

  const fmtTime = (d) => {
    if (t.clockFormat === "12h") {
      const h = d.getHours() % 12 || 12;
      const m = String(d.getMinutes()).padStart(2, "0");
      const ap = d.getHours() < 12 ? "AM" : "PM";
      return `${h}:${m} ${ap}`;
    }
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const fmtDate = (d) =>
    d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="desktop" style={{ "--wp-hue": t.wallpaperHue }}>
      {/* Wallpaper accents */}
      <div className="wp-orb wp-orb-1"></div>
      <div className="wp-orb wp-orb-2"></div>
      {t.showGrid && <div className="wp-grid"></div>}

      {/* Desktop icons */}
      <div className="desk-icons">
        {desktopIcons.map((it) => (
          <button
            key={it.id}
            className="desk-icon"
            onDoubleClick={() => openApp(it.id)}
            onClick={(e) => e.currentTarget.classList.add("sel")}
            onBlur={(e) => e.currentTarget.classList.remove("sel")}
          >
            <div className="di-ico">{it.icon}</div>
            <div className="di-label">{it.label}</div>
          </button>
        ))}
      </div>

      {/* First-run hint */}
      {showStartHint && (
        <div className="welcome-hint mono" onClick={() => setShowStartHint(false)}>
          <div className="hint-arrow">↓</div>
          <div>tip: double-click any icon, or use the launcher below</div>
        </div>
      )}

      {/* Windows */}
      {wins.map((w) => {
        const meta = APPS[w.appId];
        const Comp = w.appId === "home" ? () => <HomeApp onOpen={openApp} /> : meta.Comp;
        return (
          <PWindow
            key={w.id}
            id={w.id}
            title={meta.title}
            icon={meta.icon}
            x={w.x}
            y={w.y}
            w={w.w}
            h={w.h}
            z={w.z}
            focused={w.id === focusedId}
            minimized={w.minimized}
            maximized={w.maximized}
            onFocus={() => focusWin(w.id)}
            onClose={() => closeWin(w.id)}
            onMinimize={() => minimizeWin(w.id)}
            onMaximize={() => maximizeWin(w.id)}
            onMove={(x, y) => moveWin(w.id, x, y)}
            onResize={(wd, h) => resizeWin(w.id, wd, h)}
          >
            <Comp />
          </PWindow>
        );
      })}

      {/* Launcher menu */}
      {launcherOpen && (
        <>
          <div className="launcher-bg" onClick={() => setLauncherOpen(false)}></div>
          <div className="launcher" onClick={(e) => e.stopPropagation()}>
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
              {Object.entries(APPS)
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
                {wins.length} window{wins.length === 1 ? "" : "s"} open
              </span>
              <span>esc to close focused</span>
            </div>
          </div>
        </>
      )}

      {/* Taskbar */}
      <div className="taskbar">
        <button
          className={"tb-launcher" + (launcherOpen ? " active" : "")}
          onClick={() => setLauncherOpen((o) => !o)}
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
          {wins.map((w) => {
            const meta = APPS[w.appId];
            const isFocused = w.id === focusedId && !w.minimized;
            return (
              <button
                key={w.id}
                className={
                  "tb-task" + (isFocused ? " focused" : "") + (w.minimized ? " minimized" : "")
                }
                onClick={() => {
                  if (w.minimized) focusWin(w.id);
                  else if (isFocused) minimizeWin(w.id);
                  else focusWin(w.id);
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
            <div className="tb-time">{fmtTime(now)}</div>
            <div className="tb-date">{fmtDate(now)}</div>
          </div>
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accentColor} onChange={(v) => setT("accentColor", v)} />
        <TweakSlider
          label="Wallpaper hue"
          value={t.wallpaperHue}
          min={0}
          max={360}
          unit="°"
          onChange={(v) => setT("wallpaperHue", v)}
        />
        <TweakSection label="Desktop" />
        <TweakToggle
          label="Grid overlay"
          value={t.showGrid}
          onChange={(v) => setT("showGrid", v)}
        />
        <TweakRadio
          label="Clock"
          value={t.clockFormat}
          options={["24h", "12h"]}
          onChange={(v) => setT("clockFormat", v)}
        />
      </TweaksPanel>

      <style>{deskStyle}</style>
      <style>{appsStyle}</style>
    </div>
  );
}

const deskStyle = `
  .desktop{position:fixed;inset:0;overflow:hidden;color:var(--fg)}
  .wp-orb{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;opacity:.5}
  .wp-orb-1{width:600px;height:600px;background:hsl(var(--wp-hue) 80% 50%);top:-200px;right:-150px}
  .wp-orb-2{width:500px;height:500px;background:hsl(calc(var(--wp-hue) + 40) 70% 45%);bottom:-200px;left:-100px;opacity:.3}
  .wp-grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:80px 80px}

  .desk-icons{position:absolute;top:24px;left:24px;display:grid;grid-template-columns:repeat(auto-fill,96px);gap:8px;max-height:calc(100vh - 100px)}
  .desk-icon{appearance:none;background:transparent;border:1px solid transparent;border-radius:6px;padding:10px 6px;width:96px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--fg);transition:.1s}
  .desk-icon:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1)}
  .desk-icon.sel,.desk-icon:focus{background:var(--accent-soft);border-color:var(--accent);outline:none}
  .di-ico{font-size:36px;line-height:1;filter:drop-shadow(0 4px 8px rgba(0,0,0,.4))}
  .di-label{font-size:11.5px;text-align:center;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,.6);max-width:88px}

  .welcome-hint{position:absolute;bottom:64px;left:50%;transform:translateX(-50%);background:rgba(35,38,46,.92);border:1px solid var(--accent);border-radius:8px;padding:8px 14px;font-size:11px;color:var(--fg-2);display:flex;align-items:center;gap:10px;cursor:pointer;backdrop-filter:blur(10px);animation:bob 2s infinite;box-shadow:0 8px 24px rgba(0,0,0,.4)}
  @keyframes bob{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-3px)}}
  .hint-arrow{color:var(--accent);font-size:14px}

  /* Taskbar */
  .taskbar{position:absolute;left:0;right:0;bottom:0;height:44px;background:rgba(22,25,32,.78);backdrop-filter:blur(24px) saturate(160%);border-top:1px solid rgba(255,255,255,.08);display:flex;align-items:stretch;padding:0 6px;z-index:9999}
  .tb-launcher{appearance:none;background:transparent;border:0;color:var(--fg);display:flex;align-items:center;gap:10px;padding:0 14px;cursor:pointer;border-radius:6px;margin:4px 0;font-size:12.5px;font-weight:500;transition:.1s}
  .tb-launcher:hover{background:rgba(255,255,255,.08)}
  .tb-launcher.active{background:var(--accent-soft);color:var(--accent)}
  .tb-launch-ico{display:grid;grid-template-columns:repeat(3,4px);gap:2px}
  .tb-launch-ico .dot{width:4px;height:4px;background:currentColor;border-radius:1px}
  .tb-divider{width:1px;background:rgba(255,255,255,.08);margin:8px 6px}
  .tb-tasks{flex:1;display:flex;align-items:stretch;gap:2px;padding:4px 0;overflow-x:auto;min-width:0}
  .tb-tasks::-webkit-scrollbar{height:0}
  .tb-task{appearance:none;background:rgba(255,255,255,.04);border:0;border-bottom:2px solid transparent;color:var(--fg-2);display:flex;align-items:center;gap:8px;padding:0 12px;cursor:pointer;border-radius:5px 5px 0 0;font-size:12px;max-width:200px;min-width:120px;flex-shrink:0;transition:.1s}
  .tb-task:hover{background:rgba(255,255,255,.08);color:var(--fg)}
  .tb-task.focused{background:rgba(61,174,233,.15);color:var(--fg);border-bottom-color:var(--accent)}
  .tb-task.minimized{opacity:.55}
  .tb-task-ico{font-size:13px}
  .tb-task-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:left}
  .tb-tray{display:flex;align-items:center;gap:14px;padding:0 14px;border-left:1px solid rgba(255,255,255,.08);margin-left:6px}
  .tray-icons{display:flex;gap:8px;color:var(--fg-3);font-size:11px}
  .tray-icons span{cursor:default}
  .tb-clock{text-align:right;line-height:1.1;color:var(--fg-2);cursor:default}
  .tb-time{font-size:13px;font-weight:500;color:var(--fg);font-variant-numeric:tabular-nums}
  .tb-date{font-size:10.5px;color:var(--fg-3)}

  /* Launcher */
  .launcher-bg{position:absolute;inset:0;z-index:9000}
  .launcher{position:absolute;left:8px;bottom:48px;width:380px;background:rgba(35,38,46,.94);backdrop-filter:blur(24px) saturate(160%);border:1px solid var(--border);border-radius:10px;padding:14px;z-index:9100;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:12px}
  .launcher-hdr{display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:1px solid var(--border-soft)}
  .lh-avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#1d99f3);display:grid;place-items:center;color:#fff;font-weight:700;font-size:14px;letter-spacing:.04em}
  .lh-name{font-size:14px;font-weight:500}
  .lh-sub{font-size:11px;color:var(--fg-3)}
  .launcher-search{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.3);border:1px solid var(--border-soft);border-radius:6px;padding:6px 10px;color:var(--fg-3);font-size:12px}
  .ls-prefix{color:var(--fg-3)}
  .launcher-section{font-size:10px;letter-spacing:.14em;color:var(--fg-3);margin-top:4px}
  .launcher-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
  .launcher-item{appearance:none;background:transparent;border:0;color:var(--fg);padding:12px 6px;border-radius:6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;transition:.1s}
  .launcher-item:hover{background:rgba(255,255,255,.06)}
  .li-ico{font-size:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}
  .li-name{font-size:11px;color:var(--fg-2)}
  .launcher-foot{display:flex;justify-content:space-between;font-size:10px;color:var(--fg-3);padding-top:8px;border-top:1px solid var(--border-soft)}
`;

const appsStyle = `
  /* Toolbar (in-window) */
  .toolbar{display:flex;align-items:center;gap:10px;padding:6px 10px;background:var(--panel-2);border-bottom:1px solid var(--border-soft);flex-shrink:0}
  .tb-nav{display:flex;gap:2px}
  .nav-btn{appearance:none;background:transparent;border:0;color:var(--fg-2);width:26px;height:26px;border-radius:4px;cursor:pointer;font-size:14px}
  .nav-btn:hover:not(:disabled){background:rgba(255,255,255,.08)}
  .nav-btn:disabled{opacity:.4;cursor:default}
  .tb-path{flex:1;background:rgba(0,0,0,.25);border:1px solid var(--border-soft);border-radius:4px;padding:4px 10px;font-size:11.5px;color:var(--fg-2)}
  .tb-right{display:flex;gap:4px}
  .vw-toggle{display:flex;background:rgba(0,0,0,.25);border:1px solid var(--border-soft);border-radius:4px;padding:2px}
  .vw-toggle button{appearance:none;background:transparent;border:0;color:var(--fg-3);font-size:11px;padding:3px 8px;border-radius:3px;cursor:pointer}
  .vw-toggle button.on{background:var(--accent);color:#fff}

  /* File-manager view */
  .dol{display:flex;flex-direction:column;height:100%}
  .dol-body{flex:1;display:flex;min-height:0}
  .sidebar{width:170px;background:var(--bg-2);border-right:1px solid var(--border-soft);padding:10px 6px;display:flex;flex-direction:column;gap:1px;flex-shrink:0;overflow-y:auto}
  .sb-section{font-size:10px;letter-spacing:.12em;color:var(--fg-3);padding:4px 8px 6px}
  .sb-item{appearance:none;background:transparent;border:0;color:var(--fg-2);padding:6px 10px;text-align:left;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:12.5px;transition:.1s}
  .sb-item:hover{background:rgba(255,255,255,.05);color:var(--fg)}
  .sb-item.active{background:var(--accent-soft);color:var(--accent)}
  .sb-icon{font-size:14px}
  .dol-grid{flex:1;padding:18px;display:grid;grid-template-columns:repeat(auto-fill,140px);gap:10px;align-content:start;overflow-y:auto;align-items:start}
  .dol-item{appearance:none;background:transparent;border:1px solid transparent;border-radius:6px;padding:14px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--fg);transition:.1s}
  .dol-item:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)}
  .dol-item:focus{background:var(--accent-soft);border-color:var(--accent);outline:none}
  .dol-item.classified .dol-ico{filter:saturate(.7)}
  .dol-ico{font-size:42px;line-height:1}
  .dol-name{font-size:12.5px;font-weight:500;text-align:center}
  .dol-sub{font-size:10px;color:var(--fg-3);text-align:center}
  .statusbar{display:flex;justify-content:space-between;padding:4px 12px;background:var(--bg-2);border-top:1px solid var(--border-soft);font-size:11px;color:var(--fg-3);flex-shrink:0}

  /* Document pages */
  .page-pad{display:flex;flex-direction:column;height:100%}
  .doc-pad{padding:28px 36px 40px;overflow-y:auto;flex:1}
  .doc-pad h1{font-size:34px;margin:6px 0 10px;font-weight:500;letter-spacing:-.01em}
  .doc-pad h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg-3);margin:28px 0 10px;font-weight:600}
  .doc-pad h3.mono{text-transform:none;letter-spacing:0;color:var(--accent);font-size:13px}
  .doc-pad p{font-size:14.5px;line-height:1.6;color:var(--fg-2);max-width:62ch;margin:0 0 12px}
  .lede{font-size:16px;color:var(--fg);max-width:62ch;margin:0 0 8px !important}
  .doc-pad ul{padding-left:20px;color:var(--fg-2);font-size:14.5px;line-height:1.7;max-width:62ch}
  .doc-pad ul li{margin-bottom:4px}
  .doc-pad b{color:var(--fg)}
  .readme-meta{font-size:11px;color:var(--fg-3);padding-bottom:14px;border-bottom:1px dashed var(--border-soft);margin-bottom:18px}
  kbd{display:inline-block;background:var(--panel-2);border:1px solid var(--border);border-bottom-width:2px;border-radius:3px;padding:0 5px;font-family:"JetBrains Mono",monospace;font-size:11px;color:var(--fg)}

  /* Key/value table (about) */
  .kv{width:100%;max-width:580px;border-collapse:collapse;margin:8px 0 0}
  .kv th{text-align:left;font-weight:500;font-size:11px;color:var(--fg-3);letter-spacing:.06em;text-transform:uppercase;padding:8px 16px 8px 0;width:140px;vertical-align:top;border-top:1px solid var(--border-soft)}
  .kv td{padding:8px 0;color:var(--fg);font-size:14px;border-top:1px solid var(--border-soft)}

  /* Links */
  .links{list-style:none;padding:0;margin:8px 0 0;border-top:1px solid var(--border-soft);max-width:none}
  .links li{border-bottom:1px solid var(--border-soft);max-width:none}
  .link-row{display:grid;grid-template-columns:140px 1fr 80px;gap:14px;align-items:center;padding:12px 8px;text-decoration:none;color:var(--fg);transition:.1s}
  .link-row:hover{background:var(--accent-soft)}
  .link-row:hover .link-go{color:var(--accent)}
  .link-name{font-size:15px;font-weight:500}
  .link-hint{font-size:11.5px;color:var(--fg-3)}
  .link-go{font-size:11px;color:var(--fg-3);text-align:right;letter-spacing:.06em}
  .links.big .link-name{font-size:18px}
  .links.big .link-row{padding:16px 8px}

  /* Timeline */
  .timeline{list-style:none;padding:0;margin:18px 0 0}
  .tl-row{display:grid;grid-template-columns:140px 22px 1fr;gap:14px;padding:14px 0;border-top:1px solid var(--border-soft);position:relative}
  .tl-row:first-child{border-top:1px solid var(--border)}
  .tl-row:last-child{border-bottom:1px solid var(--border)}
  .tl-year{font-size:11.5px;color:var(--fg-3);padding-top:4px;font-weight:500}
  .tl-rail{position:relative}
  .tl-rail::before{content:"";position:absolute;left:50%;top:0;bottom:-14px;width:1px;background:var(--border-soft);transform:translateX(-50%)}
  .tl-row:last-child .tl-rail::before{bottom:0}
  .tl-dot{position:relative;display:block;width:10px;height:10px;border-radius:50%;background:var(--panel);border:1.5px solid var(--accent);margin:6px auto 0;z-index:1}
  .tl-school .tl-dot{border-color:var(--fg-3);background:var(--panel)}
  .tl-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:6px}
  .tl-role{font-size:18px;font-weight:500;color:var(--fg);letter-spacing:-.005em}
  .tl-org{font-size:13px;color:var(--accent);font-weight:500}
  .tl-where{font-size:11.5px;color:var(--fg-3);letter-spacing:.04em}
  .tl-bullets{margin:4px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:3px}
  .tl-bullets li{font-size:13.5px;color:var(--fg-2);line-height:1.55;padding-left:14px;position:relative}
  .tl-bullets li::before{content:"›";position:absolute;left:0;color:var(--fg-3)}

  /* Projects split */
  .proj-split{flex:1;display:grid;grid-template-columns:1.2fr 1fr;min-height:0}
  .proj-list{overflow-y:auto;border-right:1px solid var(--border-soft);background:var(--panel)}
  .proj-list.grid .proj-grid{padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .proj-card{appearance:none;background:transparent;border:1px solid transparent;border-radius:6px;padding:8px;cursor:pointer;display:flex;flex-direction:column;gap:6px;text-align:left;color:var(--fg);transition:.1s}
  .proj-card:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)}
  .proj-card.sel{background:var(--accent-soft);border-color:var(--accent)}
  .proj-thumb{aspect-ratio:4/3;border-radius:4px;background:var(--bg-2);position:relative;overflow:hidden;border:1px solid var(--border-soft);display:grid;place-items:center}
  .thumb-stripes{position:absolute;inset:0;background:repeating-linear-gradient(135deg,transparent 0 10px,rgba(255,255,255,.025) 10px 11px)}
  .thumb-ico{font-size:34px;position:relative;z-index:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,.4))}
  .thumb-ico.big{font-size:56px}
  .thumb-tag{position:absolute;bottom:4px;left:6px;font-size:9px;color:var(--fg-3);letter-spacing:.05em}
  .status-pill{position:absolute;top:6px;right:6px;background:var(--warn);color:#1a1a1a;font-size:9px;padding:1px 6px;border-radius:999px;font-weight:600;letter-spacing:.04em}
  .status-pill.inline{position:static;display:inline-block;margin-left:8px}
  .proj-card .proj-name{font-size:13px;font-weight:500;line-height:1.2}
  .proj-card .proj-tag{font-size:10px;color:var(--fg-3);letter-spacing:.04em}

  .proj-list.list{padding:0}
  .proj-table{width:100%;border-collapse:collapse;font-size:13px}
  .proj-table th{text-align:left;background:var(--panel-2);color:var(--fg-3);font-weight:500;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:6px 10px;border-bottom:1px solid var(--border-soft);position:sticky;top:0}
  .proj-table td{padding:6px 10px;border-bottom:1px solid var(--border-soft);color:var(--fg-2)}
  .proj-table tr{cursor:pointer}
  .proj-table tr:hover td{background:rgba(255,255,255,.03)}
  .proj-table tr.sel td{background:var(--accent-soft);color:var(--fg)}
  .row-ico{width:30px;font-size:16px}
  .row-name{font-weight:500;color:var(--fg)}
  .row-tag{font-size:11px;color:var(--fg-3)}
  .row-year{font-size:11px;color:var(--fg-3);width:80px}

  .proj-detail{overflow-y:auto;background:var(--panel-2)}
  .detail-thumb{aspect-ratio:16/9;background:var(--bg-2);position:relative;overflow:hidden;display:grid;place-items:center;border-bottom:1px solid var(--border-soft)}
  .detail-pad{padding:20px 24px 28px}
  .detail-meta{font-size:10.5px;letter-spacing:.1em;color:var(--accent);margin-bottom:6px;text-transform:uppercase}
  .detail-pad h2{font-size:26px;margin:0 0 8px;font-weight:500;letter-spacing:-.01em}
  .kv-mini{display:grid;grid-template-columns:60px 1fr;gap:10px;align-items:center;margin:14px 0;padding:10px 0;border-top:1px solid var(--border-soft);border-bottom:1px solid var(--border-soft)}
  .kv-mini-k{font-size:10px;color:var(--fg-3);letter-spacing:.1em;text-transform:uppercase}
  .kv-mini-v{display:flex;flex-wrap:wrap;gap:5px}
  .chip{font-size:10px;padding:2px 7px;border:1px solid var(--border);border-radius:3px;color:var(--fg-2);background:rgba(0,0,0,.2)}
  .detail-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .btn-go{appearance:none;background:var(--accent);color:#fff;border:0;padding:6px 14px;border-radius:4px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;letter-spacing:.04em}
  .btn-go:hover{background:#1d99f3}

  /* Blog */
  .post-list{list-style:none;padding:0;margin:18px 0 0}
  .post{border-top:1px solid var(--border-soft)}
  .post:last-child{border-bottom:1px solid var(--border-soft)}
  .post-link{display:block;padding:18px 8px;text-decoration:none;color:var(--fg);transition:.1s}
  .post-link:hover{background:rgba(255,255,255,.03);padding-left:14px}
  .post-link:hover .post-go{color:var(--accent)}
  .post-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
  .post-tag{font-size:10px;letter-spacing:.12em;color:var(--accent);text-transform:uppercase;font-weight:600}
  .post-meta{font-size:10.5px;color:var(--fg-3)}
  .post h3{font-size:20px;margin:0 0 6px;font-weight:500;color:var(--fg);letter-spacing:-.01em}
  .post-ex{font-size:13.5px;color:var(--fg-2);margin:0 0 6px;max-width:62ch;line-height:1.5}
  .post-go{font-size:11px;color:var(--fg-3);letter-spacing:.04em}

  /* Mystery */
  .mystery .doc-pad{background:linear-gradient(180deg,var(--panel) 0%,#1f1217 100%)}
  .cls-banner{display:inline-block;background:var(--classified);color:#fff;font-size:10px;letter-spacing:.18em;padding:4px 12px;border-radius:3px;font-weight:600;margin-bottom:14px;animation:pulse 2.4s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.65}}
  .mys-grid{display:flex;flex-direction:column;gap:12px;margin-top:18px}
  .mys-card{background:rgba(0,0,0,.35);border:1px solid var(--classified);border-radius:6px;padding:16px 18px;position:relative;overflow:hidden}
  .mys-card::before{content:"CLASSIFIED";position:absolute;top:8px;right:-30px;background:var(--classified);color:#fff;font-family:"JetBrains Mono",monospace;font-size:9px;padding:2px 36px;transform:rotate(35deg);letter-spacing:.18em;font-weight:600}
  .mys-hdr{display:flex;justify-content:space-between;align-items:baseline}
  .mys-codename{font-size:22px;font-weight:600;color:var(--fg);letter-spacing:.06em}
  .mys-eta{font-size:10px;color:var(--fg-3);letter-spacing:.1em}
  .mys-expansion{font-size:11px;color:var(--classified);letter-spacing:.1em;margin:2px 0 10px;font-weight:500}
  .mys-hint{font-size:14px;color:var(--fg-2);margin:0 0 14px;max-width:55ch;line-height:1.5}
  .mys-redacted{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
  .redact-line{height:11px;background:#000;border-radius:1px;width:90%}
  .redact-line.short{width:55%}
  .redact-line.med{width:72%}
  .mys-foot{font-size:10px;color:var(--fg-3);font-style:italic;letter-spacing:.04em}

  /* Responsive */
  @media (max-width: 720px){
    .desk-icons{grid-template-columns:repeat(auto-fill,80px)}
    .desk-icon{width:80px}
    .di-ico{font-size:30px}
    .di-label{font-size:10.5px}
    .proj-split{grid-template-columns:1fr}
    .proj-list{border-right:0;border-bottom:1px solid var(--border-soft);max-height:50%}
    .sidebar{display:none}
    .doc-pad{padding:18px}
    .tb-task{min-width:0;padding:0 8px}
    .tb-task-label{display:none}
    .launcher{width:calc(100vw - 16px)}
  }
`;

ReactDOM.createRoot(document.getElementById("root")).render(<Desktop />);
