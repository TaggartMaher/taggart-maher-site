---
name: verify
description: Build, launch, and drive this site end-to-end to verify changes at the real surface (the three rendering modes in a browser).
---

# Verifying taggart-maher-site

## Build / check / test

- `pnpm` may not be on PATH in agent shells — use `corepack pnpm <cmd>`.
- `corepack pnpm check` — svelte-check + tsc (node project).
- `corepack pnpm test` — vitest (jsdom). jsdom logs `Not implemented: window.scrollTo` noise from the lite Layout; harmless.
- `corepack pnpm build` — full type-gate + vite build. Verify the chunk split: the `FallbackEntry` chunk must stay tiny and must not pull compositor code.

## Launch

```bash
(set -a; source .env; set +a; corepack pnpm dev --port 5199 --strictPort > /tmp/vite.log 2>&1 &)
```

Compositor assets live in `public/composite/` (beauty.png, position.exr, steam atlas) — when present, FULL_MODE boots fully in headless Chrome.

## Drive (headless Chrome + playwright-core)

System Chrome at `/usr/bin/google-chrome` renders the WebGL2 compositor
under swiftshader:

```js
chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
```

Install `playwright-core` in a scratch dir (no browser download needed).

## Flows worth driving

- `/` → FULL_MODE: wait for `.loading-overlay` to attach THEN detach
  (bootstrap is async — waiting only for detach resolves immediately,
  before the overlay ever mounts). Then: dblclick a `.desk-icon`, drag
  `.pwin-tb`, launcher via `.tb-launcher`, backtick opens the debug
  menu, Esc closes the top window. The URL should track the focused
  window.
- `/projects/<id>` deep link → projects window with a `.sel` table row
  and populated detail pane. NOTE: most projects are `draft: true` and
  filtered out of PROJECTS — pick a non-draft id from
  `src/portfolio/content/projects/*/metadata.ts`.
- `/?mode=fallback` → lite interface only; nav links client-route
  without reloads.
- `/?mode=lightweight` → lite interface mounted inside the 3D scene.
- Eco-mode taskbar button (`.tb-eco`) unmounts
  `.steam-compositor-canvas`; toggling back remounts it.

Capture `pageerror` console events — the app should log none.

## Hit-testing pitfalls (FULL/LIGHTWEIGHT modes)

- The loading overlay intercepts ALL pointer events until it detaches —
  it lingers 1s at 100% and then fades. Interact only after the
  attach→detach wait above, or clicks silently land on the overlay.
- The screen UI sits under a matrix3d perspective warp, so a
  boundingBox() center is NOT guaranteed to be on the element (small
  targets like `.pwin-resize` and taskbar buttons miss). Probe with
  `document.elementFromPoint` over the client rect to find a point that
  actually hits, then drive `page.mouse` at that point.
- Don't dispatch synthetic PointerEvents directly on elements — the
  drag handlers call `setPointerCapture`, which throws for pointer ids
  with no active pointer.
- Minimizing the LAST visible window intentionally routes to `/`, which
  opens the README window (URL ↔ desktop state sync). Not a bug.
