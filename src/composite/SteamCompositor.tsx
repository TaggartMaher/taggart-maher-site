import { useEffect, useRef } from "react";
import {
  steamAtlasColumns,
  steamAtlasMetaPath,
  steamAtlasPath,
  steamAtlasRows,
  steamCellsManifestPath,
  steamCrop,
  steamFps,
  steamFrameCount,
} from "../config";
import { downsampleFragmentShaderSource, upsampleFragmentShaderSource } from "./shader";
import { steamFragmentShaderSource, steamVertexShaderSource } from "./steamShader";

// Maximum depth of the dual-Kawase chain. Each level halves resolution
// per axis. Mirrors the static compositor's MAX_BLUR_CHAIN_DEPTH so a
// given slider position produces comparable softness in either pass.
const MAX_BLUR_CHAIN_DEPTH = 6;

const STEAM_ATLAS_UNIT = 0;
const STEAM_SCREEN_UNIT = 1;
const STEAM_BLUR_OUTPUT_UNIT = 2;
const STEAM_BLUR_READ_UNIT = 3;

interface SteamCompositorProps {
  // Same canvas the static Compositor samples for u_screen. The steam
  // shader multiplies its bounce by this canvas's color, so the two
  // composites stay visually consistent.
  screenSourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Monotonic revision bumped by ScreenOverlay every time the canvas is
  // repainted. Skip the texImage2D upload when our last value matches.
  screenSourceRevisionRef: React.RefObject<number>;
  // User-controlled debug toggle. When on, the steam pass is suppressed
  // entirely — same shape as `enabled = false`. Lets the user trade off
  // the heaviest optional GPU cost on a slow iGPU.
  ecoMode: boolean;
  enabled: boolean;
  // Multiplies the bounce contribution before the soft clamp.
  intensity: number;
  // Soft ceiling on the bounce contribution per channel. Generalized
  // Reinhard: small values pass through near-linearly, large values
  // asymptote to this cap. Drop it to clamp bright peaks without
  // attenuating subtle details.
  maxIntensity: number;
  // Output alpha. With CSS mix-blend-mode: plus-lighter the source's
  // contribution to the backdrop is `alpha × source`, so this acts as
  // an opacity multiplier — 1.0 reproduces the previous fully-additive
  // behavior; lower values let more of the backdrop show through.
  opacity: number;
  // Effective blur radius (in screen-texture pixels) applied to the
  // screen content before the steam shader samples it. 0 disables.
  // Independent of the static compositor's blur — a steamier coffee
  // refraction often wants more softness than the scene's bounce.
  screenBlurRadiusPx: number;
  // When true, the rAF loop holds the current frame index instead of
  // advancing it.
  framePaused: boolean;
  // When non-null, overrides the elapsed-time frame index. Takes
  // precedence over `framePaused`.
  frameOverride: number | null;
  // Render the raw atlas in a corner instead of compositing — useful
  // for verifying the atlas decoded and packed correctly.
  showAtlas: boolean;
}

interface SteamManifest {
  cellsPerSide?: number;
}

interface SteamAtlasMeta {
  whitelightScale?: number;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("[steam] gl.createShader returned null");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[steam] shader compile failed: ${info}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("[steam] gl.createProgram returned null");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`[steam] program link failed: ${info}`);
  }
  return program;
}

export function SteamCompositor({
  screenSourceCanvasRef,
  screenSourceRevisionRef,
  ecoMode,
  enabled,
  intensity,
  maxIntensity,
  opacity,
  screenBlurRadiusPx,
  framePaused,
  frameOverride,
  showAtlas,
}: SteamCompositorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mirror prop values into refs so the rAF loop reads the latest
  // without tearing down on every change.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const ecoModeRef = useRef(ecoMode);
  ecoModeRef.current = ecoMode;
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;
  const maxIntensityRef = useRef(maxIntensity);
  maxIntensityRef.current = maxIntensity;
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  const screenBlurRadiusPxRef = useRef(screenBlurRadiusPx);
  screenBlurRadiusPxRef.current = screenBlurRadiusPx;
  const framePausedRef = useRef(framePaused);
  framePausedRef.current = framePaused;
  const frameOverrideRef = useRef<number | null>(frameOverride);
  frameOverrideRef.current = frameOverride;
  const showAtlasRef = useRef(showAtlas);
  showAtlasRef.current = showAtlas;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // premultipliedAlpha: true so the browser composites the canvas
    // under the standard `final = src.rgb + (1 - src.a) * backdrop`
    // formula — matches the shader's premultiplied (scattered_light,
    // density) output exactly. Outside the strip the shader writes
    // (0, 0, 0, 0), which is identity under that blend.
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true });
    if (!gl) {
      console.warn("[steam] WebGL2 not available — steam overlay disabled.");
      return;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, steamVertexShaderSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, steamFragmentShaderSource);
    const downsampleFragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      downsampleFragmentShaderSource,
    );
    const upsampleFragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      upsampleFragmentShaderSource,
    );
    const program = linkProgram(gl, vertexShader, fragmentShader);
    const downsampleProgram = linkProgram(gl, vertexShader, downsampleFragmentShader);
    const upsampleProgram = linkProgram(gl, vertexShader, upsampleFragmentShader);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteShader(downsampleFragmentShader);
    gl.deleteShader(upsampleFragmentShader);

    const positionAttribLocation = 0;
    const atlasUniformLocation = gl.getUniformLocation(program, "u_steamAtlas");
    const screenUniformLocation = gl.getUniformLocation(program, "u_screen");
    const stripUniformLocation = gl.getUniformLocation(program, "u_strip");
    const atlasGridSizeUniformLocation = gl.getUniformLocation(program, "u_atlasGridSize");
    const frameIndexUniformLocation = gl.getUniformLocation(program, "u_frameIndex");
    const intensityUniformLocation = gl.getUniformLocation(program, "u_intensity");
    const maxIntensityUniformLocation = gl.getUniformLocation(program, "u_maxIntensity");
    const opacityUniformLocation = gl.getUniformLocation(program, "u_opacity");
    const whitelightScaleUniformLocation = gl.getUniformLocation(program, "u_whitelightScale");
    const showAtlasUniformLocation = gl.getUniformLocation(program, "u_showAtlas");
    const downsampleSourceUniformLocation = gl.getUniformLocation(downsampleProgram, "u_source");
    const downsampleHalfPixelUniformLocation = gl.getUniformLocation(
      downsampleProgram,
      "u_halfPixel",
    );
    const downsampleOffsetUniformLocation = gl.getUniformLocation(downsampleProgram, "u_offset");
    const upsampleSourceUniformLocation = gl.getUniformLocation(upsampleProgram, "u_source");
    const upsampleHalfPixelUniformLocation = gl.getUniformLocation(upsampleProgram, "u_halfPixel");
    const upsampleOffsetUniformLocation = gl.getUniformLocation(upsampleProgram, "u_offset");

    const fullScreenQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fullScreenQuadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const vertexArrayObject = gl.createVertexArray();
    gl.bindVertexArray(vertexArrayObject);
    gl.enableVertexAttribArray(positionAttribLocation);
    gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    function makeTexture(textureUnit: number): WebGLTexture {
      const texture = gl!.createTexture();
      if (!texture) throw new Error("[steam] gl.createTexture returned null");
      gl!.activeTexture(gl!.TEXTURE0 + textureUnit);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      return texture;
    }

    const atlasTexture = makeTexture(STEAM_ATLAS_UNIT);
    const screenTexture = makeTexture(STEAM_SCREEN_UNIT);

    // Dual-Kawase blur chain — same shape as the static compositor.
    // Level 0 is the screen source's native resolution; each level
    // halves both axes. STEAM_BLUR_OUTPUT_UNIT holds the final result
    // bound for the steam shader to sample; STEAM_BLUR_READ_UNIT is
    // the dynamic source unit each pass binds its read-from level
    // into.
    interface BlurLevel {
      texture: WebGLTexture;
      framebuffer: WebGLFramebuffer;
      width: number;
      height: number;
    }
    const blurLevels: BlurLevel[] = [];
    for (let levelIndex = 0; levelIndex <= MAX_BLUR_CHAIN_DEPTH; levelIndex++) {
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      if (!texture || !framebuffer) {
        throw new Error("[steam] failed to create blur level resources");
      }
      gl.activeTexture(gl.TEXTURE0 + STEAM_BLUR_READ_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      blurLevels.push({ texture, framebuffer, width: 0, height: 0 });
    }

    let blurChainBaseWidth = 0;
    let blurChainBaseHeight = 0;
    function ensureBlurChainSized(width: number, height: number): void {
      if (!gl) return;
      if (width === blurChainBaseWidth && height === blurChainBaseHeight) return;
      blurChainBaseWidth = width;
      blurChainBaseHeight = height;
      for (let levelIndex = 0; levelIndex < blurLevels.length; levelIndex++) {
        const level = blurLevels[levelIndex];
        const levelWidth = Math.max(1, width >> levelIndex);
        const levelHeight = Math.max(1, height >> levelIndex);
        level.width = levelWidth;
        level.height = levelHeight;
        gl.activeTexture(gl.TEXTURE0 + STEAM_BLUR_READ_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, level.texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          levelWidth,
          levelHeight,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, level.framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          level.texture,
          0,
        );
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0 + STEAM_BLUR_OUTPUT_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, blurLevels[0].texture);
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    let cancelled = false;
    let animationFrameHandle: number | null = null;
    let atlasTextureReady = false;
    let atlasMetaReady = false;
    let whitelightScale = 1.0;
    let renderingStarted = false;
    let manifestSeen = false;
    const renderStartTimestamp = performance.now();
    const atlasImage = new Image();
    atlasImage.crossOrigin = "anonymous";
    atlasImage.addEventListener(
      "load",
      () => {
        if (cancelled) return;
        gl.activeTexture(gl.TEXTURE0 + STEAM_ATLAS_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasImage);
        atlasTextureReady = true;
        maybeStartRendering();
      },
      { once: true },
    );
    atlasImage.addEventListener(
      "error",
      () => {
        console.warn("[steam] failed to load steam_atlas.png");
      },
      { once: true },
    );
    atlasImage.src = steamAtlasPath;

    fetch(steamAtlasMetaPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`steam_atlas_meta.json fetch returned ${response.status}`);
        }
        return response.json() as Promise<SteamAtlasMeta>;
      })
      .then((meta) => {
        if (cancelled) return;
        if (typeof meta.whitelightScale === "number" && Number.isFinite(meta.whitelightScale)) {
          whitelightScale = meta.whitelightScale;
        } else {
          console.warn("[steam] steam_atlas_meta.json missing whitelightScale — defaulting to 1.0");
        }
        atlasMetaReady = true;
        maybeStartRendering();
      })
      .catch((error) => {
        console.warn("[steam] failed to load steam_atlas_meta.json:", error);
      });

    fetch(steamCellsManifestPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`steam_cells_manifest.json fetch returned ${response.status}`);
        }
        return response.json() as Promise<SteamManifest>;
      })
      .then((manifest) => {
        if (cancelled) return;
        manifestSeen = true;
        if (manifest.cellsPerSide !== 3) {
          console.warn(
            `[steam] expected steam manifest cellsPerSide=3, got ${manifest.cellsPerSide ?? "unknown"}`,
          );
        }
      })
      .catch((error) => {
        console.warn("[steam] failed to load steam_cells_manifest.json:", error);
      });

    function resizeCanvasToViewport(): void {
      if (!canvas || !gl) return;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const targetWidth = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
      const targetHeight = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    let lastFrameIndex = 0;
    // Last screen-source revision uploaded via texImage2D; -1 forces an
    // upload on the first frame.
    let lastUploadedScreenSourceRevision = -1;
    function currentFrameIndex(nowMs: number): number {
      const override = frameOverrideRef.current;
      if (override !== null && Number.isFinite(override)) {
        const clamped = Math.max(0, Math.min(steamFrameCount - 1, Math.floor(override)));
        lastFrameIndex = clamped;
        return clamped;
      }
      if (framePausedRef.current) {
        return lastFrameIndex;
      }
      const elapsedSeconds = (nowMs - renderStartTimestamp) / 1000;
      const frame = Math.floor(elapsedSeconds * steamFps) % steamFrameCount;
      lastFrameIndex = frame;
      return frame;
    }

    function renderFrame(): void {
      if (cancelled || !gl || !canvas) return;

      resizeCanvasToViewport();

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (!enabledRef.current || ecoModeRef.current) {
        return;
      }

      const screenSource = screenSourceCanvasRef.current;
      if (!screenSource) return;
      gl.activeTexture(gl.TEXTURE0 + STEAM_SCREEN_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, screenTexture);
      const screenSourceRevision = screenSourceRevisionRef.current ?? 0;
      if (screenSourceRevision !== lastUploadedScreenSourceRevision) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screenSource);
        lastUploadedScreenSourceRevision = screenSourceRevision;
      }

      // Optional dual-Kawase blur chain. When the radius is > 0 we
      // run downsamples then upsamples, leaving the final blurred
      // image in blurLevels[0]; the steam shader then reads from
      // STEAM_BLUR_OUTPUT_UNIT instead of STEAM_SCREEN_UNIT.
      const blurRadiusPx = Math.max(0, Math.floor(screenBlurRadiusPxRef.current));
      const screenSourceWidth = screenSource.width;
      const screenSourceHeight = screenSource.height;
      const blurEnabled = blurRadiusPx > 0 && screenSourceWidth > 0 && screenSourceHeight > 0;
      if (blurEnabled) {
        ensureBlurChainSized(screenSourceWidth, screenSourceHeight);

        const chainDepth = Math.min(
          MAX_BLUR_CHAIN_DEPTH,
          Math.max(1, Math.round(Math.log2(blurRadiusPx))),
        );
        const kernelOffset = Math.min(4, Math.max(0.5, blurRadiusPx / (1 << chainDepth)));

        gl.bindVertexArray(vertexArrayObject);

        gl.useProgram(downsampleProgram);
        gl.uniform1i(downsampleSourceUniformLocation, STEAM_BLUR_READ_UNIT);
        gl.uniform1f(downsampleOffsetUniformLocation, kernelOffset);
        for (let levelIndex = 1; levelIndex <= chainDepth; levelIndex++) {
          const sourceLevel =
            levelIndex === 1
              ? { texture: screenTexture, width: screenSourceWidth, height: screenSourceHeight }
              : blurLevels[levelIndex - 1];
          const destLevel = blurLevels[levelIndex];
          gl.activeTexture(gl.TEXTURE0 + STEAM_BLUR_READ_UNIT);
          gl.bindTexture(gl.TEXTURE_2D, sourceLevel.texture);
          gl.uniform2f(
            downsampleHalfPixelUniformLocation,
            0.5 / sourceLevel.width,
            0.5 / sourceLevel.height,
          );
          gl.bindFramebuffer(gl.FRAMEBUFFER, destLevel.framebuffer);
          gl.viewport(0, 0, destLevel.width, destLevel.height);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.useProgram(upsampleProgram);
        gl.uniform1i(upsampleSourceUniformLocation, STEAM_BLUR_READ_UNIT);
        gl.uniform1f(upsampleOffsetUniformLocation, kernelOffset);
        for (let levelIndex = chainDepth; levelIndex >= 1; levelIndex--) {
          const sourceLevel = blurLevels[levelIndex];
          const destLevel = blurLevels[levelIndex - 1];
          gl.activeTexture(gl.TEXTURE0 + STEAM_BLUR_READ_UNIT);
          gl.bindTexture(gl.TEXTURE_2D, sourceLevel.texture);
          gl.uniform2f(
            upsampleHalfPixelUniformLocation,
            0.5 / sourceLevel.width,
            0.5 / sourceLevel.height,
          );
          gl.bindFramebuffer(gl.FRAMEBUFFER, destLevel.framebuffer);
          gl.viewport(0, 0, destLevel.width, destLevel.height);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.activeTexture(gl.TEXTURE0 + STEAM_BLUR_OUTPUT_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, blurLevels[0].texture);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
      }

      // resizeCanvasToViewport reset the viewport from the blur path
      // above; restore it here before the composite draw.
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.useProgram(program);
      gl.bindVertexArray(vertexArrayObject);
      gl.uniform1i(atlasUniformLocation, STEAM_ATLAS_UNIT);
      gl.uniform1i(screenUniformLocation, blurEnabled ? STEAM_BLUR_OUTPUT_UNIT : STEAM_SCREEN_UNIT);
      gl.uniform4f(
        stripUniformLocation,
        steamCrop.minX,
        steamCrop.minY,
        steamCrop.maxX,
        steamCrop.maxY,
      );
      gl.uniform2f(atlasGridSizeUniformLocation, steamAtlasColumns, steamAtlasRows);
      gl.uniform1i(frameIndexUniformLocation, currentFrameIndex(performance.now()));
      gl.uniform1f(intensityUniformLocation, intensityRef.current);
      gl.uniform1f(maxIntensityUniformLocation, Math.max(1e-4, maxIntensityRef.current));
      gl.uniform1f(opacityUniformLocation, Math.max(0, Math.min(1, opacityRef.current)));
      gl.uniform1f(whitelightScaleUniformLocation, whitelightScale);
      gl.uniform1i(showAtlasUniformLocation, showAtlasRef.current ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }

    function scheduleNextFrame(): void {
      if (cancelled) return;
      animationFrameHandle = requestAnimationFrame(() => {
        renderFrame();
        scheduleNextFrame();
      });
    }

    function maybeStartRendering(): void {
      if (renderingStarted) return;
      if (!atlasTextureReady || !atlasMetaReady) return;
      renderingStarted = true;
      scheduleNextFrame();
    }

    return () => {
      cancelled = true;
      if (animationFrameHandle !== null) {
        cancelAnimationFrame(animationFrameHandle);
      }
      gl.deleteTexture(atlasTexture);
      gl.deleteTexture(screenTexture);
      for (const level of blurLevels) {
        gl.deleteTexture(level.texture);
        gl.deleteFramebuffer(level.framebuffer);
      }
      gl.deleteBuffer(fullScreenQuadBuffer);
      gl.deleteVertexArray(vertexArrayObject);
      gl.deleteProgram(program);
      gl.deleteProgram(downsampleProgram);
      gl.deleteProgram(upsampleProgram);
      // Reference manifestSeen so the linter doesn't strip the fetch path.
      void manifestSeen;
    };
  }, [screenSourceCanvasRef, screenSourceRevisionRef]);

  return <canvas ref={canvasRef} className="steam-compositor-canvas" />;
}
