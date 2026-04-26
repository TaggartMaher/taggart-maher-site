# Handoff: Taggart Maher Portfolio Site

## Overview

A personal portfolio site for Taggart Maher, a Full Stack Developer based in Newark, DE. The site presents bio, experience, projects, blog posts, and "mystery" (in-development) work. The defining concept is that **the entire portfolio is presented as a KDE Plasma-style desktop OS** — sections live as folders/apps, and the visitor explores them through a working window manager (drag, resize, minimize, maximize, focus, taskbar, app launcher).

The site is optimized for **skim-first** consumption: every section opens with a one-line summary, the projects view is a split-pane (list on the left, detail on the right) so a recruiter can glance at every project in seconds, and the README is what loads first.

## About the Design Files

The files in `source/` are **design references created in HTML/JSX** — a working prototype showing intended look and behavior. They are not production code to copy directly.

Your task is to **recreate this design in a real codebase** using whatever stack is appropriate (Next.js + React is the natural fit; Astro or Remix also work). The prototype is high-enough fidelity that you can lift colors, typography, spacing, and interaction logic directly, but you should restructure the code into proper components, add real routing, and back the data with whatever CMS/MDX/JSON source the user prefers.

## Fidelity

**High fidelity.** Final colors, typography, spacing, and interactions are all settled. Recreate pixel-perfectly.

## Concept & Metaphor

The portfolio is a fake desktop environment ("tm-portfolio") inspired by **KDE Plasma 6**. Visitors interact with it as if logging into someone's computer:

- A **wallpaper** with two colored orbs (blurred radial gradients).
- **Desktop icons** along the top-left edge (one per section).
- A **taskbar** pinned to the bottom with: app launcher (left), running window list (middle), system tray + clock (right).
- An **app launcher** menu that opens above the launcher button (avatar, search field placeholder, app grid).
- **Windows** with titlebars (icon + title + min/max/close), draggable by titlebar, resizable from the bottom-right corner, focusable (click to bring to front), and minimizable (taskbar icon dims).

When the page first loads, the **README.md window opens automatically**, centered, at half the viewport width and 90% height.

## Screens / Views

The site has one route. All "screens" are windows that open inside the desktop.

### 1. Desktop Shell

- **Wallpaper**: dark radial gradient (`#1d2027` → `#161920` → `#0f1115`, 160deg) with two blurred orbs (one top-right, one bottom-left) tinted by `--wp-hue` (default 215°).
- **Desktop icons**: grid `repeat(auto-fill, 96px)`, gap 8px, top:24px, left:24px. Each icon is a 96px-wide button with 36px emoji + label below (11.5px, drop-shadow). Hover = subtle bg + border. Selected = accent-tinted bg + accent border.
- **Welcome hint**: a floating pill above the taskbar on first load, with a bouncing arrow ("tip: double-click any icon, or use the launcher below"). Dismisses on first interaction.

### 2. Taskbar (44px tall, fixed bottom)

- Background: `rgba(22,25,32,.78)` with `backdrop-filter: blur(24px) saturate(160%)` and a 1px top border at `rgba(255,255,255,.08)`.
- **Launcher button** (left): a 3x3 dot grid icon + "tm-portfolio" label (mono). Active state uses accent tint.
- **Running tasks** (middle): horizontal list of buttons, one per open window. Focused window has accent-tinted bg + 2px accent bottom border. Minimized = 0.55 opacity. Click focused = minimize. Click minimized = restore. Click unfocused = focus.
- **System tray** (right): three small mono characters (●, ⌁, ▮) + a two-line clock (time on top, "Mon Apr 26" below). Tabular numerics.

### 3. App Launcher (popup)

Opens above the launcher button. 380px wide. Backdrop blur. Contains:

- **Header**: 42px circular avatar (gradient `135deg, accent → #1d99f3`, "TM" initials) + name + `taggart@tm-portfolio` mono.
- **Fake search bar**: ⌕ icon + placeholder text.
- **App grid**: 4 columns of icon buttons with labels.
- **Footer**: open-window count + esc hint.

### 4. Window Chrome (`PWindow` component)

- **Border**: 1px `var(--border)` (`#3a3f4b`); 8px radius.
- **Focused border**: `var(--accent)` (`#3daee9`) with a soft glow (`0 14px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(61,174,233,.25)`).
- **Titlebar**: 32px tall, gradient bg when focused, 1px bottom border. Drag = pointer-events on titlebar move the window. Double-click titlebar = maximize toggle.
- **Buttons** (right side): minimize, maximize (8x8 rounded square), close. Close hovers red. Maximize fills viewport minus taskbar.
- **Body**: scrolls vertically. Custom scrollbar (10px, thin, faint thumb).
- **Resize handle**: 16px bottom-right corner with diagonal lines. Min size 360×280.

### 5. App: Home (File Manager)

File-manager analog of the desktop icons. Uses Plasma's Dolphin layout:

- **Toolbar** (top): back/forward/up arrows (disabled placeholders), breadcrumb path field (`/home/taggart`).
- **Sidebar** (left, 170px): "PLACES" section with all main apps as clickable items. Active item = accent tint.
- **Grid** (right): icons in `repeat(auto-fill, 140px)` grid. Single-click selects (accent-tinted bg + border). Double-click opens. Items have 42px emoji + name + mono `sub` line.
- **Statusbar** (bottom): item count + selection hint.

### 6. App: About Me

Document layout with sidebar:

- Toolbar path: `/home/taggart/About Me`.
- "about.md · ~ · last edited [date]" mono meta line.
- `h1` headline (Noto Serif, 34px, weight 500, letter-spacing -0.01em).
- Lede paragraph (16px, full-color text).
- **Fact sheet**: 2-column kv table (key in mono uppercase 11px, value 14px, divider lines).
- **Long form**: 2–3 paragraphs.
- **Channels**: link rows in a 3-col grid (label / mono hint / "open ↗"). Hover = accent-tinted bg.

### 7. App: Experience

Timeline view. Each row is a 3-col grid: `[year mono] [rail+dot] [content]`. Vertical line connects rail dots. School entries use a muted dot, work entries use accent-bordered. Bullets use a mono `›` instead of bullets.

### 8. App: Projects

Split view (1.2fr / 1fr):

- **Left pane**: grid (default) or list (toggle button top-right of toolbar) of project cards. Each card has a 4:3 thumbnail with stripes pattern + emoji + "[ thumb ]" placeholder + optional "Upcoming" warn-orange pill. Click to select.
- **Right pane**: detail. 16:9 thumbnail at top + padded body with tag/year/status meta line (uppercase, accent-tinted), `h2` name, lede oneliner, body details, stack chips, and link buttons (accent-filled `btn-go`).

### 9. App: Blog

Plain reader. List of posts with `tag · year · readtime` headers, serif title, excerpt paragraph, "read post →" mono CTA. Hover indents the link by 6px.

### 10. App: Mystery (CLASSIFIED)

Dark/red themed:

- Pulsing red `CLASSIFIED — IN DEVELOPMENT` banner.
- Each card has a diagonal "CLASSIFIED" ribbon stamp in the top-right corner.
- Codename in big mono, expansion in small red mono, hint paragraph, then redacted black bars (varying widths) standing in for hidden detail.

### 11. App: README.md

The default-open window. Plain markdown-style document explaining navigation. Includes `<kbd>` styled keys for keyboard hints.

### 12. App: Contact

Same channel-list as About, but bigger.

## Interactions & Behavior

### Window manager

- **Drag**: pointermove on titlebar updates `x/y`. Don't allow dragging fully off-screen — clamp `x` to `>= -w + 80`, `y >= 0`.
- **Resize**: pointermove on bottom-right handle updates `w/h`. Min 360×280.
- **Focus**: any pointerdown on a window bumps its `z` to `zCounter + 1`. Focused window's border becomes accent.
- **Maximize**: fills viewport (`width:100vw; height:calc(100vh - 44px); border-radius:0`). Toggle.
- **Minimize**: hides the window but keeps state; taskbar entry dims.
- **Close**: removes from window list.
- **Open already-open app**: focuses + un-minimizes existing window (does NOT spawn duplicate).
- **First-load behavior**: open README centered at `width = vw / 2`, `height = (vh - 44) * 0.9`.

### Keyboard

- **Esc**: closes the focused (top-z) window. Also closes the launcher if open.

### Animations

- Welcome hint bobs (`bob` keyframes, 2s).
- Classified banner pulses opacity 1 → 0.65 → 1 over 2.4s.
- Hover transitions on buttons/items: `0.1s` ease.
- Border-color/box-shadow on focused window: `0.15s`.

### State Management

A single `<Desktop>` component holds:

- `wins`: array of `{id, appId, x, y, w, h, z, minimized, maximized}`.
- `zCounter`: monotonic counter for stacking order.
- `launcherOpen`: boolean.
- `now`: current Date for the clock (updated every 30s).
- `showStartHint`: boolean (dismisses on first app open).
- A `__openApp` global is exposed on `window` so child apps (sidebars) can open siblings.

## Design Tokens

```css
--bg: #1d2027;
--bg-2: #161920;
--panel: #23262e;
--panel-2: #2a2e38;
--panel-hover: #323743;
--border: #3a3f4b;
--border-soft: #2e333d;
--fg: #eff0f1;
--fg-2: #bcc1c7;
--fg-3: #7d828c;
--accent: #3daee9; /* Plasma blue (tweakable) */
--accent-2: #1d99f3;
--accent-soft: rgba(61, 174, 233, 0.18);
--selection: rgba(61, 174, 233, 0.35);
--warn: #f67400; /* "Upcoming" pill, tray attention */
--classified: #c0392b; /* Mystery banner / ribbons */
--shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
```

### Typography

- **Sans (UI)**: `"Noto Sans", ui-sans-serif, system-ui, sans-serif` — 14px base.
- **Serif (headings, role labels)**: `"Noto Serif", Georgia, serif`.
- **Mono (paths, mono meta, codenames)**: `"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`.
- Antialiasing: `-webkit-font-smoothing: antialiased`.

### Spacing

- Window default sizes scaled ~1.33× from initial: e.g. About 960×800, Projects 1300×825, Contact 745×640.
- Doc padding: `28px 36px 40px`.
- Sidebar width: 170px.

### Radius

- Windows: 8px.
- Buttons / toolbar fields: 4–6px.
- Pills / chips: 3px or 999px (pills).

### Shadows

- Default window: `0 10px 40px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.3)`.
- Focused window: `0 14px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(61,174,233,.25)`.

## Tweaks (User-Adjustable Settings)

The prototype exposes a tweaks panel for accent color, wallpaper hue (0–360°), grid overlay toggle, and 12/24h clock format. Reproduce these as a settings panel only if the production site needs it; otherwise treat the **defaults** as canonical:

```js
{ accentColor: "#3daee9", wallpaperHue: 215, showGrid: false, clockFormat: "24h" }
```

## Content / Data

All content lives in `source/data.jsx` as a `PORTFOLIO` object: `about`, `experience` (array, most recent first), `projects` (array, most recent first), `blog` (array), `mystery` (array). Real resume data is filled in for About + Experience and the projects sourced from the resume (Respiratory Model, One Click Docs, Bond Synth, Wholesale Miner, Cold Glass CAD). Other projects (Waybranch, Token Monster, RC Audio, Project Blueshift) and all blog posts have `[ bracketed placeholders ]` for the user to fill in.

## Assets

- No image assets — all icons are emoji and all "thumbnails" are placeholders (emoji on striped bg + `[ thumb ]` mono text). Replace with real screenshots before launch.
- No iconography library — use emoji or swap for an SVG icon set (Material Symbols Outlined or Lucide would both fit).
- Fonts: Google Fonts (Noto Sans, Noto Serif, JetBrains Mono).

## Files

```
source/
  portfolio.html       # Entry point, font imports, root CSS variables, script loading order.
  desktop.jsx          # <Desktop> component: wallpaper, window manager, taskbar, launcher, tweaks integration.
  window.jsx           # <PWindow>: titlebar, drag, resize, focus, min/max/close.
  apps.jsx             # All app components: HomeApp, AboutApp, ExperienceApp, ProjectsApp, BlogApp, MysteryApp, ReadmeApp, ContactApp + shared Toolbar/Sidebar/Statusbar.
  data.jsx             # PORTFOLIO content object (real resume data).
  tweaks-panel.jsx     # Reusable tweak-panel form controls (TweaksPanel, TweakColor, TweakSlider, etc.).
```

## Recommended Implementation Notes

- Next.js App Router + React is the obvious target. One page; client components for the window manager.
- Replace inline `<style>` blocks with Tailwind, CSS Modules, or vanilla-extract. Token values above map directly.
- Keep the global `window.__openApp` pattern only if you don't want to thread an opener through context — otherwise, a `WindowManagerContext` is cleaner.
- For mobile, the responsive media queries (`@media (max-width: 720px)`) collapse the projects sidebar and shrink desktop icons; consider a dedicated mobile fallback view (single scrolling page) instead of trying to make the window manager work at <720px.
- Real thumbnails should be 4:3 in the project grid and 16:9 in the detail pane.
