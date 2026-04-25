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

- `./dev.sh` — sources `.env`, runs `scripts/buildAssets.ts`, then `vite`.
- `./test.sh` — runs all tests.
- `./build.sh` — sources `.env`, runs `scripts/buildAssets.ts`, then production build.
- `./format.sh` — formats the codebase and runs the linter.
- `./deploy.sh` — git-info confirmation prompt, then runs `scripts/deploy.ts` (S3 sync + CloudFront invalidate). _Currently stubbed._

`.env` (gitignored) carries `BLENDER_RENDERS_DIR`. `.env.example` is the committed template.

## Style

This website uses an interesting technique involving a composited cgi video scene from blender. The scene contains a desk with a computer monitor. It uses compositing layers so that we can render web page elements overlayed on the section of the render animation where the screen is. The elements, images, and ui of the site will effect the lighting of the surrounding scene using webgl to apply this image to the composite.

The Blender output is three passes — beauty, white light, position — see COMPOSITE_THEORY.md. The animation is currently 96 frames at 24fps. Both the frame count and fps must be configurable from a single source of truth in the app config; the runtime reads these to drive UV math, frame addressing, and playback timing. Frame-lock between passes is a hard requirement during playback (the math falls apart if passes drift by even one frame).

The camera does not move, so the screen rectangle is fixed in screen-space. Bake the screen's screen-space rect once from Blender and store it in config; the React content layer is a single fixed div positioned over that rect.

## Assets

Blender render output lives outside the repo — too large to commit and re-rendered often. The path is supplied via the env var `BLENDER_RENDERS_DIR` (loaded from `.env` by `dev.sh` / `build.sh`).

Each render pass has its own subdirectory inside `$BLENDER_RENDERS_DIR`:

- `$BLENDER_RENDERS_DIR/beauty/beauty-####.exr`
- `$BLENDER_RENDERS_DIR/whitelight/whitelight-####.exr`
- `$BLENDER_RENDERS_DIR/position/position-####.exr`

EXRs **must** use ZIP compression. HTJ2K (compression code 11, default for newer Blender exports) is unsupported by Fedora's current `oiiotool` / `ffmpeg` / OpenEXR ≤ 3.3.

**Delivery format** — single 3×-wide H.264 atlas video at `public/composite/atlas.mp4`. `scripts/buildAssets.ts` is the build pipeline:

1. Detect the screen's emission strength `E` from `whitelight-0001.exr`'s max channel value.
2. Per frame, `oiiotool` reads the three EXRs, scales whitelight + position by `1/E` (so they fit `[0,1]` 8-bit without clipping), `--mosaic 3x1`, applies sRGB OETF (`--colorconvert linear sRGB`), writes 8-bit PNG to `.cache/encode/atlas-####.png`.
3. `ffmpeg` encodes the PNG sequence to `atlas.mp4` (`libx264`, `yuv420p`, `crf 18`, `color_range pc`).
4. Writes `public/composite/atlasMeta.json` with `{ scale, encoding }`. The shader fetches it and multiplies bounce contribution by `scale` to recover the magnitude divided out in step 2. `encoding` is a cache-version string — bumping it invalidates the PNG cache.

Why each piece exists (don't strip these without understanding):

- **Pre-scale by E**: emission strength typically > 1, so raw whitelight/position would clip in 8-bit. Pre-scaling preserves the `position/whitelight` ratio (the math is invariant) and keeps full dynamic range.
- **sRGB OETF**: H.264 is invariably tagged BT.709, and standards-compliant decoders apply the BT.709 EOTF on display. Without OETF on encode, linear values get gamma-decoded a second time and crush mid-tones (~50% scaled to ~20%). The atlas would also look dim in any desktop video player viewing the .mp4 directly.
- **Pass-thru cache (`.cache/encode/`)**: per-frame PNGs are mtime-checked; rerunning the build is a near no-op. Cache invalidates when `scale` or `encoding` changes.

The cache directory is gitignored. The repo never holds rendered assets. If `BLENDER_RENDERS_DIR` is unset or any pass is missing, the build script logs a warning and exits 0 — the site falls back to the no-CGI path at runtime.

## Screen content pipeline

To feed the bounce-light shader, the React content has to be rasterized into a texture each frame:

- Default path: `html2canvas`. _Not yet wired up._
- Faster path: the new browser DOM-to-texture API introduced in April 2026 (TODO: confirm exact name and feature-detect). _Not yet wired up._

Both paths must be wired up; the debug menu toggles between them so we can compare performance.

**Current state** — `src/composite/screenContent.ts` draws a procedural cycling-corner test pattern (TL/TR/BR/BL solid rects with labels, 1-second cadence) into a 2D canvas, which is uploaded as the `u_screen` texture each frame. This stands in for the eventual DOM rasterization and doubles as the Phase F debug-menu corner test.

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

## Progress

Phases reference the original implementation plan; agents picking this up should read `src/config.ts`, `scripts/buildAssets.ts`, `src/composite/`, and `COMPOSITE_THEORY.md` to ground in current state.

**Done**

- **Pre-flight** — `.env` + `.env.example`, real `cameraPose` / `screenPlane` baked into `src/config.ts`, regression-snapshot test on `screenRect`. _Bug fix:_ `src/screenRect.ts` was using `R = Rx · Ry · Rz` (intrinsic XYZ, three.js convention); Blender uses `R = Rz · Ry · Rx`. Single-axis tests didn't catch it; multi-axis test now does.
- **Phase A — delivery format** — A1 chosen (single 3×-wide H.264 atlas + sRGB encoding + `atlasMeta.json` sidecar). See `scripts/buildAssets.ts` and the Assets section above.
- **Phase B — frame-locked loader** — `<video>` + `requestVideoFrameCallback` (with `requestAnimationFrame` fallback) drives the render loop in `src/composite/Compositor.tsx`. Frame-lock is automatic because all three passes live in one video.
- **Phase C — WebGL compositor** — WebGL2 fragment shader at `src/composite/shader.ts`. Pure-TS mirror at `src/composite/composite.ts`; tests at `src/composite/composite.test.ts` cover dark regions, flat-white screen, position-encoded UV sampling, scale-invariant ratio + magnitude recovery, linear bounce scaling.

**Not started**

- **Phase D — DOM-to-texture** — placeholder cycling-corner pattern stands in for the React rasterization. `html2canvas` + DOM-to-texture API both pending.
- **Phase E — fallback detection** — viewport / WebGL probe / first-frame timeout all pending. App.tsx currently always renders `<Compositor />`.
- **Phase F — debug menu** — corner-rect test already exists as the screen-content placeholder; key combo + perf overlay + path toggle are pending.
- **Phase G — visual verification & region-split fallback** — visual A/B is in progress (orientation, brightness, color round-trip dialled in over several iterations). Region-split fallback remains a backup if position-pass artifacts surface.
- **Phase H — deploy** — `scripts/deploy.ts` is a stub; S3 sync + CloudFront invalidation pending.

**Gotchas an agent picking this up will hit**

- The screen plane's UV map _must_ span the full `[0, 1]²` with U horizontal and V vertical relative to how the screen appears in the rendered camera view. An asymmetric or rotated UV map silently shows up as canvas content compressed/rotated on the screen surface — see COMPOSITE_THEORY.md "Position pass material requirements".
- The position-pass material wires `Texture Coordinate.UV` directly to `Emission.Color`. Anything in between (ColorRamp, Mapping, Math) corrupts the UV-as-color encoding. `Texture Coordinate.Generated` is _not_ a substitute — it's a 3D coord that leaks Z into the B channel.
- Renders must use ZIP EXR compression, not HTJ2K. Fedora's libs don't support code 11 yet.
- The shader does _not_ flip V on `emitterUv`. The canvas is uploaded with `UNPACK_FLIP_Y_WEBGL=true`, which already aligns canvas-Y with the plane's V-up convention.
- `UNPACK_COLORSPACE_CONVERSION_WEBGL` is left at the browser default, deliberately. The atlas is sRGB-encoded, so the browser's EOTF on video → texture upload is what restores linear values to the shader. Disabling it produces washed-out / overbright output. The corollary: the canvas content (drawn with HTML colors, also sRGB-encoded) gets the same EOTF and arrives linear in the shader, which is what the math expects.
