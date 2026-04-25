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
   - Take its **UV** output (or **Generated** if the plane has no UVs — equivalent for a flat plane) → plug into Emission → Color.
3. Render → save as `position_####.exr`.

Result: screen emits red on the U axis, green on the V axis. Surfaces lit by the screen are tinted by the average UV of the contributing screen regions.

## Critical Color Management

Passes 2 and 3 MUST be saved in linear/raw color space. The position pass values are coordinates, not colors — gamma correction will corrupt them.

- File Format: **OpenEXR** (preferred) or 16-bit PNG.
- Output → Color Management → **View Transform: Standard** (or **Raw** if available), **Look: None**.
- For OpenEXR, color space should be **Linear / Non-Color**.

## Compositor Math (WebGL Shader)

```glsl
vec3 beauty       = texture(beautyTex, fragUV).rgb;
vec3 whiteLight   = texture(whiteLightTex, fragUV).rgb;
vec3 positionRGB  = texture(positionTex, fragUV).rgb;

// Recover the average emitter UV that lit this scene point.
// Divide position-weighted light by total light to get the centroid.
vec2 emitterUV = positionRGB.rg / max(whiteLight.r, 0.001);

// Sample the user's live screen content at that emitter UV.
vec3 screenColor = texture(userScreenContent, emitterUV).rgb;

// Compose final image.
vec3 lightContribution = screenColor * whiteLight;
vec3 final = beauty + lightContribution;
```

The `positionRGB / whiteLight` division is the core trick — it converts position-weighted illumination into the average source UV.

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

Currently configured at 96 frames @ 24fps (≈4-second loop). Frame count and fps are project-configurable from a single source of truth in app config — the runtime reads these to drive UV math, atlas indexing, and playback timing.

The three passes are packed into one wide atlas video (3× width) so a single `<video>` element keeps all passes frame-locked. Position pass benefits from higher bitrate or lossless encoding because chroma subsampling smears the UV values; beauty and whitelight tolerate normal lossy encoding fine.

**Open question — delivery format.** Encoded video (WebM/MP4) is friendliest to bandwidth but risks color-space damage to the position pass; image sequences (e.g. KTX2) preserve linear values but cost more bytes. Decide after running the verification step against both.

## Alternative: Region-Split Light Groups (Fallback)

If the position-pass technique produces artifacts (e.g. due to render noise in dim areas where the division blows up), fall back to rendering N separate white-light passes with the screen split into N regions using Cycles Light Groups. 4 regions (2×2 grid) is the minimum for genuine positional response; 9 regions (3×3) is indistinguishable from ground truth. Compositor sums `region_i_pass * avgColorOfImageInRegion_i` across all regions. Higher render cost (Nx) but more robust to noise.

## Visibility Flag Reference

| Setting                                              | Effect                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Holdout** (Object Properties → Visibility)         | Renders transparent alpha hole; object still affects light transport (blocks light, casts shadow). |
| **Ray Visibility → Camera** (Cycles only)            | Camera rays pass through; light still interacts normally. **Use this for Pass 1.**                 |
| **Ray Visibility → Diffuse / Glossy / Transmission** | Controls bounce participation per ray type.                                                        |
| **Ray Visibility → Shadow**                          | Controls shadow casting.                                                                           |
