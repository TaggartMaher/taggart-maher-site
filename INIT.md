# Portfolio site initial development

## Stack

- TypeScript
- React frontend
- Vite
- Latest stable versions in package.json

## Deployment

Hosted on AWS as a CloudFront static site. The deploy entrypoint is `./deploy.sh` at the repo root — it prints the current git branch and last commit (hash, subject, author, date), prompts for confirmation, and only on `y` invokes the TypeScript implementation at `scripts/deploy.ts`, which syncs the build output to S3 and invalidates the CloudFront distribution. AWS credentials come from the local shell environment — nothing committed, no `.env` for the site itself.

## Local scripts

Thin shell wrappers at the repo root so they double as local aliases. They delegate to the underlying tooling (npm/pnpm/vite/etc.) — keeping the wrappers thin keeps the package scripts and the shell aliases in sync.

- `./dev.sh` — runs the development environment.
- `./test.sh` — runs all tests.
- `./build.sh` — production build, fully optimized.
- `./format.sh` — formats the codebase and runs the linter.
- `./deploy.sh` — git-info confirmation prompt, then runs `scripts/deploy.ts` (S3 sync + CloudFront invalidate).

## Style

This website uses an interesting technique involving a composited cgi video scene from blender. The scene contains a desk with a computer monitor. It uses compositing layers so that we can render web page elements overlayed on the section of the render animation where the screen is. The elements, images, and ui of the site will effect the lighting of the surrounding scene using webgl to apply this image to the composite.

The Blender output is three passes — beauty, white light, position — see COMPOSITE_THEORY.md. The animation is currently 96 frames at 24fps. Both the frame count and fps must be configurable from a single source of truth in the app config; the runtime reads these to drive UV math, frame addressing, and playback timing. Frame-lock between passes is a hard requirement during playback (the math falls apart if passes drift by even one frame).

The camera does not move, so the screen rectangle is fixed in screen-space. Bake the screen's screen-space rect once from Blender and store it in config; the React content layer is a single fixed div positioned over that rect.

## Assets

Blender render output lives outside the repo — too large to commit and re-rendered often. The path is supplied via the env var `BLENDER_RENDERS_DIR`, exported in the local shell.

Each render pass has its own subdirectory inside `$BLENDER_RENDERS_DIR`:

- `$BLENDER_RENDERS_DIR/beauty/`
- `$BLENDER_RENDERS_DIR/whitelight/`
- `$BLENDER_RENDERS_DIR/position/`

What lives inside each pass directory (an image sequence, an encoded video, or both during iteration) depends on the open delivery-format question — see COMPOSITE_THEORY.md. With image sequences, frame-lock is automatic by frame index; with three separate videos it requires care; with a pre-combined atlas video it's free. The web code reads paths from `src/config.ts` — nothing about the layout is hardcoded elsewhere.

Both `./dev.sh` and `./build.sh` source from `$BLENDER_RENDERS_DIR` directly (Vite static-serve plugin, symlinks into `public/composite/` at script start, or equivalent — whichever stays simplest). The repo never holds rendered assets. If `BLENDER_RENDERS_DIR` is unset or any pass directory is missing, dev must still boot — the site falls back to the no-CGI path with a console warning.

## Screen content pipeline

To feed the bounce-light shader, the React content has to be rasterized into a texture each frame:

- Default path: `html2canvas`.
- Faster path: the new browser DOM-to-texture API introduced in April 2026 (TODO: confirm exact name and feature-detect).

Both paths must be wired up; the debug menu toggles between them so we can compare performance.

## Fallback detection

Render the plain site (no CGI scene, no video assets loaded) when any of these are true:

1. Viewport is small (mobile or narrow desktop) — content inside the screen rect would be too small to read.
2. WebGL feature probe fails (required version and extensions not present).
3. Assets load but the first composited frame fails to render within a timeout.

When any check fails, do not load the video assets at all.

## Debug menu

Hidden behind a key combo (TBD). Toggles and readouts:

- Force `html2canvas` vs. the newer DOM-to-texture API.
- Performance overlay: FPS, per-frame DOM-capture time, shader time.
- Corner-rectangle test: a rectangle that cycles through top-left → top-right → bottom-right → bottom-left so bounce-light direction is visually verifiable.

## Division of labor

- **Human (Taggart):** owns everything upstream of `$BLENDER_RENDERS_DIR` — the `.blend` file, the 3-pass render setup, executing renders, encoding/exporting per-pass output, and the in-Blender ground-truth verification step from COMPOSITE_THEORY.md. Agents never open Blender, edit `blender/`, or attempt to drive renders.
- **Agent:** owns the web side — React app, WebGL compositor, shader, asset loading from `$BLENDER_RENDERS_DIR`, fallback path, debug menu, scripts, deploy. Agents treat the per-pass directories as a contract: they consume whatever's there per `src/config.ts`, but never produce or modify render output.
- **Shared contract:** `src/config.ts` declares frame count, fps, screen rect, per-pass paths, and resolution. Both sides honor it. When the human changes the Blender output (frame count, resolution, etc.), the human updates config; the web code reads new values without edits.
- **Agent-side verification:** agents cannot run the in-Blender ground-truth check. They can build a synthetic-input test — generate a known atlas in code (flat white, UV gradient) and assert the shader output matches expected math. This catches shader and asset-pipeline bugs without needing real renders.

## Considerations

Keep the codebase incredibly simple and organized. The actual portfolio page (text, content) stays plain and editable; the compositing layer must be cleanly separable so the fallback path is just "render the React app without the surroundings."
