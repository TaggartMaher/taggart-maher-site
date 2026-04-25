# Blender Emission Isolation Pipeline (for Live Web Compositing)

## Goal

Render an animation in Blender so that the light contribution of a single emission object (a "screen") can be re-textured live in a WebGL compositor. The user can swap the screen's content (e.g. drag a colored shape, render HTML to canvas) and the bounce light in the scene responds positionally as if the screen had really emitted that content.

## Approach: Three-Pass Render with UV-Gradient Position Encoding

The technique relies on rendering three image sequences from the same animation (same camera, same frame range, same lights), changing only the screen object's material between passes. The "position pass" encodes screen UV coordinates as RGB so that, in a shader, the user's image can be looked up at the correct emitter position per scene point.

## Render Pass 1 — Beauty Without Screen

Captures the scene as if the screen were off.

1. Select the screen plane → Material → set Emission **Strength = 0**.
2. Object Properties → **Visibility → Ray Visibility** → uncheck **Camera**. (Don't use Holdout — that leaves a transparent hole; we want the wall behind to render normally.)
3. Render the animation → save as `beauty_####.exr` (or PNG sequence).

Result: scene with all other lighting intact, no screen contribution, no black rectangle where the screen was.

## Render Pass 2 — White Light Pass

Captures only the screen's light contribution, with the screen emitting pure white.

1. Restore screen visibility (re-enable Camera ray visibility).
2. Screen material → Emission **Strength = production value** (e.g. 5–20, whatever was originally intended).
3. Emission **Color = pure white (1, 1, 1)**.
4. Disable all other lights (set strength to 0). World background → black.
5. Render → save as `whitelight_####.exr`.

Result: scene lit only by the screen as a uniform white emitter. Records "how much screen-light reached each point."

## Render Pass 3 — Position Pass (UV Gradient Emission)

Same as Pass 2 except the screen emits a UV gradient instead of white.

1. Keep all settings from Pass 2 (other lights off, world black, same emission strength).
2. Screen material → replace the Emission Color input:
   - Add a **Texture Coordinate** node.
   - Take its **UV** output → plug into Emission → Color. **Direct connection only** — no ColorRamp, no Mapping, no Math, no Mix. Anything between Texture Coordinate.UV and Emission.Color corrupts the UV-as-color encoding.
   - Do **not** use `Generated` as a substitute. It's a 3D coord (X, Y, Z) of the local bounding box; on a plane with non-degenerate Z extent the Z value leaks into the B channel as blue/purple/pink, breaking the math.
3. Render → save as `position_####.exr`.

Result: screen emits red on the U axis, green on the V axis. Surfaces lit by the screen are tinted by the average UV of the contributing screen regions.

### UV map requirements (position pass)

The screen plane's UV unwrap is the contract that ties Blender's emitter UVs to the canvas content the WebGL compositor samples. It must satisfy:

- **Spans the full `[0, 1]²`** — every part of the canvas should be reachable on the plane. An island that only covers `[0, 0.43]` in U (e.g.) compresses canvas content into a sub-region of the screen.
- **U axis horizontal, V axis vertical** relative to how the screen appears in the rendered camera view. If U/V are swapped or rotated 90°, the canvas displays rotated.
- **Standard V-up orientation** — `UV (0, 0)` at the bottom-left vertex of the visible plane face, `UV (1, 1)` at the top-right. The compositor compensates for HTML canvas being top-down via `UNPACK_FLIP_Y_WEBGL=true`; with V-up on the plane and that flip on the canvas, no V flip is needed in the shader.

**Verifying the unwrap (one-frame diagnostic).** Render a single frame of the position pass after re-unwrapping. Inspect the screen-rect crop:

| Plane corner       | Expected color |
| ------------------ | -------------- |
| Bottom-left (0,0)  | black          |
| Bottom-right (1,0) | red            |
| Top-left (0,1)     | green          |
| Top-right (1,1)    | yellow         |

If two adjacent corners look the same, U or V is collapsed. If the colors are at the right corners but rotated, rotate the UV island 90° in the UV editor (`R 90` with the island selected).

## Critical Color Management

Passes 2 and 3 MUST be saved in linear/raw color space. The position pass values are coordinates, not colors — gamma correction will corrupt them.

- File Format: **OpenEXR** with **ZIP** codec (HTJ2K is unsupported by current Fedora `oiiotool` / `ffmpeg` / OpenEXR ≤ 3.3).
- Output → Color Management → **View Transform: Standard** (or **Raw** if available), **Look: None**.
- For OpenEXR, color space should be **Linear / Non-Color**.

The build pipeline (`scripts/buildAssets.ts`, agent side) handles all subsequent encoding into the H.264 atlas: pre-scaling by emission strength, sRGB OETF for the BT.709 round-trip, atlas mosaic, ffmpeg encode. The Blender side never needs to think about gamma or 8-bit clipping — keep EXR linear and let the build do the rest.

## Compositor Math (WebGL Shader)

The principle: `final = beauty + screenColor * whitelight`, where `screenColor` is the user's content sampled at the position-encoded emitter UV. As-shipped (`src/composite/shader.ts`), with all three passes packed into one atlas and pre-scaled by `E` at build time:

```glsl
vec3 beauty     = texture(u_atlas, beautyUv).rgb;
vec3 whitelight = texture(u_atlas, whitelightUv).rgb;
vec3 position   = texture(u_atlas, positionUv).rgb;

vec2 emitterUv = position.rg / max(whitelight.r, 1e-3);
vec3 screenColor = texture(u_screen, emitterUv).rgb;

vec3 finalColor = beauty + u_scale * screenColor * whitelight;
```

The `position / whitelight` division is the core trick — it converts position-weighted illumination into the average source UV. Both numerator and denominator are pre-scaled by `1/E`, so the ratio is invariant. `u_scale = E` (read from `atlasMeta.json`) recovers the bounce magnitude divided out at build time.

## Screen Surface Mapping (Bonus)

The position pass also gives you correct perspective mapping of the user's image onto the screen surface itself, for free: where the position pass shows non-zero values on the screen plane, those RGB values _are_ the screen's UVs by construction. Sampling `userScreenContent` at `positionRGB.rg` for those pixels paints the user image onto the screen in correct perspective. This means a 4th pass (alpha mask of the screen) is optional, not required.

## Verification Step

Before building the web app, verify the math inside Blender's compositor on a single frame:

1. Render the three passes for one frame.
2. Render a 4th "ground truth" frame with a real image texture on the screen (instead of white or gradient).
3. In Blender's compositor, compute `beauty + screenColor * whitelight` where `screenColor = sample(image, position / whitelight)`.
4. Compare to the ground truth render. If they match, passes are correct.
5. If they don't match, the cause is almost always color space — re-check that passes 2 and 3 are linear/raw.

## Output Frame Count

Currently configured at 96 frames @ 24fps (≈4-second loop). Frame count and fps are project-configurable from `src/config.ts` (single source of truth) — the runtime reads these to drive UV math, atlas indexing, and playback timing.

The three passes are packed into one wide atlas video (3× width) so a single `<video>` element keeps all passes frame-locked.

**Delivery format — resolved.** Single H.264 atlas at `crf 18`, with build-side pre-scaling and sRGB OETF. See `INIT.md` "Assets" section for the full pipeline. Shipped, working — chroma subsampling artifacts on the position pass have not been a problem in practice. Image-sequence delivery (KTX2 etc.) is the fallback if quality demands it later, but the move would be reactive rather than speculative.

## Build pipeline lessons (linear → web)

Discovered iteratively while shipping. Read this before changing anything in `scripts/buildAssets.ts`:

1. **EXR HTJ2K compression breaks the toolchain.** `ffmpeg`, `oiiotool`, and ImageMagick on Fedora 43 link against OpenEXR ≤ 3.3 which does not implement compression code 11. Render with **ZIP**.
2. **Emission strength `E` exceeds 1.0** in linear EXR for both whitelight (the screen surface emits at `E`) and position (`UV * E`, with UV up to 1). 8-bit PNG quantization clips at 1.0, so a naive `oiiotool -d uint8` saturates most of the screen surface to a single corner sample. The build pipeline detects `E` from `whitelight-0001.exr`'s max channel value and divides whitelight + position by `E` before quantization. Beauty is untouched (its values are well under 1).
3. **The `position / whitelight` ratio is invariant under uniform pre-scaling.** Dividing both passes by the same `E` preserves the emitter UV exactly while keeping values in `[0, 1]`.
4. **The shader recovers magnitude with `u_scale = E`.** Stored bounce contribution is `screenColor * (whitelight/E)`, so `u_scale * screenColor * stored_whitelight = screenColor * whitelight` — the original scene-referred bounce.
5. **Apply sRGB OETF before 8-bit quantization.** H.264 is invariably tagged BT.709, and standards-compliant decoders apply the BT.709 EOTF on display (browser, desktop video player, anything). Without an OETF on encode, linear values get gamma-decoded a second time and crush mid-tones — bounce light disappears. The fix is `oiiotool --colorconvert linear sRGB` before `-d uint8`. The H.264 round-trip is then linear → sRGB-encoded PNG → BT.709-tagged H.264 → BT.709 EOTF in decoder → linear back in the shader.
6. **`UNPACK_COLORSPACE_CONVERSION_WEBGL = BROWSER_DEFAULT`**, deliberately. The browser is the one applying the EOTF on the WebGL video upload that completes the round-trip from #5. Setting it to `NONE` skips the EOTF and produces washed-out output.
7. **Cache invalidation includes `encoding`.** Bumping the encoding string in `buildAssets.ts` (e.g. when the OETF strategy changes) forces all PNGs to rebuild. Mtime alone won't catch a pipeline-version change.

## How to verify a build round-trip

```bash
# What we wrote into the encoder:
oiiotool --stats .cache/encode/atlas-0001.png

# What comes back out of atlas.mp4:
ffmpeg -i public/composite/atlas.mp4 -frames:v 1 /tmp/decoded.png
oiiotool --stats /tmp/decoded.png
```

`Stats Avg` should match within a few units of 255 — H.264 quantization noise. If they diverge by ≫ 1%, the encoder is doing something it shouldn't (gamma application, color matrix mismatch); investigate before chasing shader bugs.

## Alternative: Region-Split Light Groups (Fallback)

If the position-pass technique produces artifacts (e.g. due to render noise in dim areas where the division blows up), fall back to rendering N separate white-light passes with the screen split into N regions using Cycles Light Groups. 4 regions (2×2 grid) is the minimum for genuine positional response; 9 regions (3×3) is indistinguishable from ground truth. Compositor sums `region_i_pass * avgColorOfImageInRegion_i` across all regions. Higher render cost (Nx) but more robust to noise.

## Visibility Flag Reference

| Setting                                              | Effect                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Holdout** (Object Properties → Visibility)         | Renders transparent alpha hole; object still affects light transport (blocks light, casts shadow). |
| **Ray Visibility → Camera** (Cycles only)            | Camera rays pass through; light still interacts normally. **Use this for Pass 1.**                 |
| **Ray Visibility → Diffuse / Glossy / Transmission** | Controls bounce participation per ray type.                                                        |
| **Ray Visibility → Shadow**                          | Controls shadow casting.                                                                           |

## Project Naming Convention (.blend file)

The pipeline is implemented via View Layers + Collections (no script). The names below are the source of truth — keep the .blend, this doc, and any tooling in sync.

**Collections**

| Collection      | Contents                                                    |
| --------------- | ----------------------------------------------------------- |
| `Scene`         | Camera, walls, props — anything identical across passes.    |
| `StaticLights`  | All non-screen lights (and any black-world stand-in).       |
| `SceneBeauty`   | `SCREEN` — the parent / source-of-truth screen object.      |
| `SceneWhite`    | `SCREEN_WHITE` — linked duplicate, white emission.          |
| `ScenePosition` | `SCREEN_POSITION` — linked duplicate, UV-gradient emission. |

`SCREEN_WHITE` and `SCREEN_POSITION` are Alt-D linked duplicates of `SCREEN` (shared mesh data) and parented to `SCREEN` so transforms propagate. Edit `SCREEN` only.

**View Layers**

| Layer        | Included collections                   |
| ------------ | -------------------------------------- |
| `Beauty`     | `Scene`, `StaticLights`, `SceneBeauty` |
| `WhiteLight` | `Scene`, `SceneWhite`                  |
| `Position`   | `Scene`, `ScenePosition`               |

Exclusion is done via the Outliner's **Exclude from View Layer** checkbox (per-view-layer), not the eye visibility icon.

**Material slot gotcha.** Because the three screen objects share mesh data (Alt-D), material slots live on the mesh and are shared across all three. To give each object its own material, set the slot's link dropdown to **Object** (not Data), keep only one slot per object, and assign the per-pass material to that slot. If multiple slots remain, slot 0 wins on every face, so all three planes render whichever material is in slot 0.
