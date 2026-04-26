import { useEffect, useRef } from "react";
import { atlasPath } from "../config";
import type { PerfMetrics } from "./perfMetrics";
import {
  downsampleFragmentShaderSource,
  fragmentShaderSource,
  upsampleFragmentShaderSource,
  vertexShaderSource,
} from "./shader";

// Maximum depth of the dual-Kawase chain. Each level halves resolution per
// axis, so MAX_BLUR_CHAIN_DEPTH = 6 means the deepest level is 1/64th of
// the source's edge length and 1/4096th of its area — plenty of headroom
// for very large effective radii without burning memory on a level we'll
// never use.
const MAX_BLUR_CHAIN_DEPTH = 6;

interface CompositorProps {
  // Canvas providing the live screen-content image. The compositor
  // re-uploads it as the `u_screen` texture every video frame, so any
  // 2D-canvas drawing the parent does is reflected in the bounce light
  // on the next frame. May start null and be assigned later — the
  // compositor waits for it before rendering.
  screenSourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  // When true, pause the atlas video on its first frame. Bounce
  // (whitelight/position) is therefore static, but the screen-content
  // texture and shader uniforms keep updating so dragging the debug
  // square or swapping background still re-renders.
  freezeFirstFrame: boolean;
  // Effective blur radius (in screen-texture pixels) applied to the
  // screen-content image before it feeds the composite, via a dual-Kawase
  // downsample/upsample chain. 0 disables the blur passes and the
  // composite samples the raw screen texture. The host maps the radius to
  // a chain depth and a final-pass kernel offset.
  screenBlurRadiusPx: number;
  // Per-axis linear stretch around (0.5, 0.5) applied to the emitter UV
  // before sampling the screen content. 1.0 is the physical default;
  // > 1 pushes that axis's edges outward.
  uStretch: number;
  vStretch: number;
  // Per-axis translation added to emitterUv after the stretch.
  uOffset: number;
  vOffset: number;
  // Symmetric inset of the valid screen-content sampling window.
  edgeCutoff: number;
  // Linear-light color adjustments applied to the screen-content sample
  // before it multiplies into the bounce. 1.0 is the identity for each.
  screenSaturation: number;
  screenContrast: number;
  screenBrightness: number;
  // Optional sink for per-frame performance metrics. The compositor
  // mutates the referenced object each frame; readers (the debug menu)
  // poll it on their own cadence so metric updates don't drive React
  // renders here.
  perfMetricsRef?: React.RefObject<PerfMetrics>;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("[compositor] gl.createShader returned null");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[compositor] shader compile failed: ${info}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("[compositor] gl.createProgram returned null");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`[compositor] program link failed: ${info}`);
  }
  return program;
}

export function Compositor({
  screenSourceCanvasRef,
  freezeFirstFrame,
  screenBlurRadiusPx,
  uStretch,
  vStretch,
  uOffset,
  vOffset,
  edgeCutoff,
  screenSaturation,
  screenContrast,
  screenBrightness,
  perfMetricsRef,
}: CompositorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Mirror prop into a ref so the handleVideoReady callback inside the
  // mount-only setup effect can honor the latest freeze state without
  // re-running the WebGL teardown/rebuild path.
  const freezeFirstFrameRef = useRef(freezeFirstFrame);
  // Mirror the blur radius into a ref for the same reason — the rAF render
  // loop reads it each frame without forcing a context rebuild on change.
  const screenBlurRadiusPxRef = useRef(screenBlurRadiusPx);
  screenBlurRadiusPxRef.current = screenBlurRadiusPx;
  const uStretchRef = useRef(uStretch);
  uStretchRef.current = uStretch;
  const vStretchRef = useRef(vStretch);
  vStretchRef.current = vStretch;
  const uOffsetRef = useRef(uOffset);
  uOffsetRef.current = uOffset;
  const vOffsetRef = useRef(vOffset);
  vOffsetRef.current = vOffset;
  const edgeCutoffRef = useRef(edgeCutoff);
  edgeCutoffRef.current = edgeCutoff;
  const screenSaturationRef = useRef(screenSaturation);
  screenSaturationRef.current = screenSaturation;
  const screenContrastRef = useRef(screenContrast);
  screenContrastRef.current = screenContrast;
  const screenBrightnessRef = useRef(screenBrightness);
  screenBrightnessRef.current = screenBrightness;

  // React to the freeze toggle without tearing down the WebGL context:
  // pause/seek the video element directly, and let the rAF render loop
  // keep uploading the current (paused) frame plus any screen-texture
  // updates from the parent.
  useEffect(() => {
    freezeFirstFrameRef.current = freezeFirstFrame;
    const video = videoRef.current;
    if (!video) return;
    if (freezeFirstFrame) {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* seeking before metadata loads throws — handled on loadedmetadata */
      }
    } else {
      void video.play().catch(() => {
        /* autoplay can be blocked; user gesture will recover it */
      });
    }
  }, [freezeFirstFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
    if (!gl) {
      console.warn("[compositor] WebGL2 not available — fallback path will take over");
      return;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
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

    // All three vertex shaders declare a_position at layout location 0,
    // so the single fullscreen-quad VAO below works for every program.
    const positionAttribLocation = 0;
    const atlasUniformLocation = gl.getUniformLocation(program, "u_atlas");
    const screenUniformLocation = gl.getUniformLocation(program, "u_screen");
    const scaleUniformLocation = gl.getUniformLocation(program, "u_scale");
    const uvStretchUniformLocation = gl.getUniformLocation(program, "u_uvStretch");
    const uvOffsetUniformLocation = gl.getUniformLocation(program, "u_uvOffset");
    const edgeCutoffUniformLocation = gl.getUniformLocation(program, "u_edgeCutoff");
    const screenSaturationUniformLocation = gl.getUniformLocation(program, "u_screenSaturation");
    const screenContrastUniformLocation = gl.getUniformLocation(program, "u_screenContrast");
    const screenBrightnessUniformLocation = gl.getUniformLocation(program, "u_screenBrightness");
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
      if (!texture) throw new Error("[compositor] gl.createTexture returned null");
      gl!.activeTexture(gl!.TEXTURE0 + textureUnit);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      return texture;
    }

    const atlasTexture = makeTexture(0);
    const screenTexture = makeTexture(1);

    // Dual-Kawase blur chain. Level 0 has the screen source's native
    // dimensions; each subsequent level halves both axes. The downsample
    // pass renders into level k from level k-1; the upsample pass then
    // walks back up. After upsampling completes, level 0 holds the final
    // blurred image and the composite samples it (bound to texture unit
    // BLUR_OUTPUT_UNIT). Texture unit BLUR_READ_UNIT is the dynamic source
    // unit each pass binds its read-from level into.
    const BLUR_READ_UNIT = 4;
    const BLUR_OUTPUT_UNIT = 3;

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
        throw new Error("[compositor] failed to create blur level resources");
      }
      // Bind once for parameter setup so the level texture has linear
      // filtering and clamp-to-edge wrapping; allocation happens lazily
      // in ensureBlurChainSized.
      gl.activeTexture(gl.TEXTURE0 + BLUR_READ_UNIT);
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
        gl.activeTexture(gl.TEXTURE0 + BLUR_READ_UNIT);
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
      // Re-bind level 0 to the unit the composite reads from so the
      // post-blur sampler picks up the right texture. The unit only needs
      // to hold this binding while the composite draw call fires; later
      // passes free to repurpose BLUR_READ_UNIT.
      gl.activeTexture(gl.TEXTURE0 + BLUR_OUTPUT_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, blurLevels[0].texture);
    }

    // Both video and 2D-canvas sources are top-left origin in the source
    // image, but WebGL textures default to bottom-left. Flip on upload so
    // the position-pass UVs and screen-content sampling agree.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Don't let the browser apply transfer-function conversions on upload.
    // The atlas is sRGB-OETF-encoded by the build and the screen-content
    // PNG is sRGB by definition; the shader does the EOTF explicitly via
    // `srgbToLinear`. With BROWSER_DEFAULT, behavior varies across
    // browsers — we'd see double-decoding or no decoding depending on the
    // implementation. NONE makes the round-trip predictable.
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    let cancelled = false;
    let animationFrameHandle: number | null = null;

    // Perf instrumentation. The render loop updates these scalars each
    // frame and writes a smoothed snapshot into perfMetricsRef so the
    // debug menu (or any other reader) can poll without coupling to the
    // render cadence.
    //
    // - displayFps: derived from rAF callback timestamps.
    // - videoFps: derived from HTMLVideoElement.getVideoPlaybackQuality()
    //   deltas — i.e., decoded video frames per wall-clock second. Goes
    //   to 0 when the video is paused.
    // - cpuFrameMs: time spent inside renderFrame on the JS thread.
    // - gpuFrameMs: TIME_ELAPSED_EXT timer query encompassing all GL
    //   work for the frame. Resolves asynchronously a few frames later;
    //   reported as null when the extension isn't available.
    const timerQueryExtension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const pendingTimerQueries: WebGLQuery[] = [];
    const exponentialAverageAlpha = 0.1;
    let cpuFrameMsAverage = 0;
    let gpuFrameMsAverage: number | null = timerQueryExtension ? 0 : null;
    const recentFrameTimestamps: number[] = [];
    const recentFrameTimestampsCapacity = 60;
    let lastVideoQualitySampleTime = 0;
    let lastVideoQualityFrameCount = 0;
    let videoFpsAverage = 0;

    function publishPerfMetrics(): void {
      if (!perfMetricsRef?.current) return;
      let displayFps = 0;
      if (recentFrameTimestamps.length >= 2) {
        const oldest = recentFrameTimestamps[0];
        const newest = recentFrameTimestamps[recentFrameTimestamps.length - 1];
        const elapsedSeconds = (newest - oldest) / 1000;
        if (elapsedSeconds > 0) {
          displayFps = (recentFrameTimestamps.length - 1) / elapsedSeconds;
        }
      }
      perfMetricsRef.current.displayFps = displayFps;
      perfMetricsRef.current.videoFps = videoFpsAverage;
      perfMetricsRef.current.cpuFrameMs = cpuFrameMsAverage;
      perfMetricsRef.current.gpuFrameMs = gpuFrameMsAverage;
    }

    function drainCompletedTimerQueries(): void {
      if (!gl || !timerQueryExtension) return;
      // Per the extension spec, results from any TIME_ELAPSED query that
      // straddled a GPU disjoint event are unreliable; throw the whole
      // pending batch away when we see one rather than report nonsense.
      const disjoint = gl.getParameter(timerQueryExtension.GPU_DISJOINT_EXT);
      if (disjoint) {
        for (const query of pendingTimerQueries) gl.deleteQuery(query);
        pendingTimerQueries.length = 0;
        return;
      }
      while (pendingTimerQueries.length > 0) {
        const query = pendingTimerQueries[0];
        const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
        if (!available) break;
        const elapsedNanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
        const elapsedMs = elapsedNanoseconds / 1e6;
        gpuFrameMsAverage =
          gpuFrameMsAverage === null || gpuFrameMsAverage === 0
            ? elapsedMs
            : gpuFrameMsAverage * (1 - exponentialAverageAlpha) +
              elapsedMs * exponentialAverageAlpha;
        gl.deleteQuery(query);
        pendingTimerQueries.shift();
      }
    }

    // The build pipeline pre-scales whitelight + position into [0,1] and
    // writes the scale factor here. Until the metadata arrives we render
    // with scale = 1 (visible scene, no bounce magnitude correction).
    let atlasScale = 1;
    fetch("/composite/atlasMeta.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((meta: { scale?: number } | null) => {
        if (meta && typeof meta.scale === "number") {
          atlasScale = meta.scale;
        } else {
          console.warn(
            "[compositor] atlasMeta.json missing or invalid — bounce magnitude uncorrected",
          );
        }
      })
      .catch((error) => {
        console.warn("[compositor] failed to fetch atlasMeta.json:", error);
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

    function renderFrame(): void {
      if (cancelled || !gl || !canvas || !video) return;

      const cpuStartMs = performance.now();
      recentFrameTimestamps.push(cpuStartMs);
      if (recentFrameTimestamps.length > recentFrameTimestampsCapacity) {
        recentFrameTimestamps.shift();
      }

      // Sample video decode rate roughly twice a second. The browser
      // exposes a monotonic decoded-frame counter; differencing it over
      // wall-clock gives us the actual atlas FPS independent of the rAF
      // cadence (which can run faster than the video).
      const playbackQuality = video.getVideoPlaybackQuality?.();
      if (playbackQuality) {
        if (lastVideoQualitySampleTime === 0) {
          lastVideoQualitySampleTime = cpuStartMs;
          lastVideoQualityFrameCount = playbackQuality.totalVideoFrames;
        } else {
          const elapsedSeconds = (cpuStartMs - lastVideoQualitySampleTime) / 1000;
          if (elapsedSeconds >= 0.5) {
            const decodedFrameDelta = playbackQuality.totalVideoFrames - lastVideoQualityFrameCount;
            const sampleFps = decodedFrameDelta / elapsedSeconds;
            videoFpsAverage =
              videoFpsAverage === 0
                ? sampleFps
                : videoFpsAverage * (1 - exponentialAverageAlpha) +
                  sampleFps * exponentialAverageAlpha;
            lastVideoQualitySampleTime = cpuStartMs;
            lastVideoQualityFrameCount = playbackQuality.totalVideoFrames;
          }
        }
      }

      drainCompletedTimerQueries();

      let activeTimerQuery: WebGLQuery | null = null;
      if (timerQueryExtension) {
        activeTimerQuery = gl.createQuery();
        if (activeTimerQuery) {
          gl.beginQuery(timerQueryExtension.TIME_ELAPSED_EXT, activeTimerQuery);
        }
      }

      // Upload atlas frame from the current video frame.
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      }

      // Upload the latest screen-content frame from the parent's canvas.
      // Re-uploading every frame is cheap for a ~1024x630 canvas and
      // keeps draggable / live edits in sync without a separate signal.
      const screenSource = screenSourceCanvasRef.current;
      if (!screenSource) return;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, screenTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screenSource);

      // Run the dual-Kawase blur chain if the user has dialed in a
      // non-zero radius. The composite below will then sample the final
      // blurred result from BLUR_OUTPUT_UNIT instead of unit 1.
      //
      // Mapping from radius (in source pixels) to chain parameters:
      // each down/up cycle roughly doubles the effective Gaussian sigma,
      // so a chain of depth N with kernel offset O reaches an effective
      // radius around (2^N) * O source pixels. We pick N = round(log2 R)
      // clamped to the chain capacity, and let the residual fall into O
      // (clamped to a sane range so the kernel doesn't visibly tile).
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

        // Downsample chain: level 0 (screenTexture) → level 1 → … → level chainDepth.
        gl.useProgram(downsampleProgram);
        gl.uniform1i(downsampleSourceUniformLocation, BLUR_READ_UNIT);
        gl.uniform1f(downsampleOffsetUniformLocation, kernelOffset);
        for (let levelIndex = 1; levelIndex <= chainDepth; levelIndex++) {
          const sourceLevel =
            levelIndex === 1
              ? { texture: screenTexture, width: screenSourceWidth, height: screenSourceHeight }
              : blurLevels[levelIndex - 1];
          const destLevel = blurLevels[levelIndex];
          gl.activeTexture(gl.TEXTURE0 + BLUR_READ_UNIT);
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

        // Upsample chain: level chainDepth → … → level 0.
        gl.useProgram(upsampleProgram);
        gl.uniform1i(upsampleSourceUniformLocation, BLUR_READ_UNIT);
        gl.uniform1f(upsampleOffsetUniformLocation, kernelOffset);
        for (let levelIndex = chainDepth; levelIndex >= 1; levelIndex--) {
          const sourceLevel = blurLevels[levelIndex];
          const destLevel = blurLevels[levelIndex - 1];
          gl.activeTexture(gl.TEXTURE0 + BLUR_READ_UNIT);
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

        // Make level 0 (the blurred result) available to the composite.
        gl.activeTexture(gl.TEXTURE0 + BLUR_OUTPUT_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, blurLevels[0].texture);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
      }

      resizeCanvasToViewport();

      gl.useProgram(program);
      gl.bindVertexArray(vertexArrayObject);
      gl.uniform1i(atlasUniformLocation, 0);
      gl.uniform1i(screenUniformLocation, blurEnabled ? BLUR_OUTPUT_UNIT : 1);
      gl.uniform1f(scaleUniformLocation, atlasScale);
      gl.uniform2f(uvStretchUniformLocation, uStretchRef.current, vStretchRef.current);
      gl.uniform2f(uvOffsetUniformLocation, uOffsetRef.current, vOffsetRef.current);
      gl.uniform1f(edgeCutoffUniformLocation, edgeCutoffRef.current);
      gl.uniform1f(screenSaturationUniformLocation, screenSaturationRef.current);
      gl.uniform1f(screenContrastUniformLocation, screenContrastRef.current);
      gl.uniform1f(screenBrightnessUniformLocation, screenBrightnessRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);

      if (timerQueryExtension && activeTimerQuery) {
        gl.endQuery(timerQueryExtension.TIME_ELAPSED_EXT);
        pendingTimerQueries.push(activeTimerQuery);
      }

      const cpuFrameMsSample = performance.now() - cpuStartMs;
      cpuFrameMsAverage =
        cpuFrameMsAverage === 0
          ? cpuFrameMsSample
          : cpuFrameMsAverage * (1 - exponentialAverageAlpha) +
            cpuFrameMsSample * exponentialAverageAlpha;

      publishPerfMetrics();
    }

    function scheduleNextFrame(): void {
      if (cancelled) return;
      // Always use requestAnimationFrame: we need to keep rendering when
      // the video is paused (freeze-first-frame mode) so screen-content
      // texture edits — square drag, color picker, etc. — still hit the
      // GPU. requestVideoFrameCallback would stop firing on pause and
      // freeze the whole composite, including the bounce contribution
      // from a moving square.
      animationFrameHandle = requestAnimationFrame(() => {
        renderFrame();
        scheduleNextFrame();
      });
    }

    function handleVideoReady(): void {
      if (freezeFirstFrameRef.current) {
        video!.pause();
        try {
          video!.currentTime = 0;
        } catch {
          /* ignore */
        }
      } else {
        video!.play().catch((error) => {
          console.warn("[compositor] video autoplay rejected:", error);
        });
      }
      scheduleNextFrame();
    }

    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      handleVideoReady();
    } else {
      video.addEventListener("loadeddata", handleVideoReady, { once: true });
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", handleVideoReady);
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
      for (const query of pendingTimerQueries) gl.deleteQuery(query);
    };
  }, [screenSourceCanvasRef, perfMetricsRef]);

  return (
    <>
      <canvas ref={canvasRef} className="compositor-canvas" />
      <video
        ref={videoRef}
        src={atlasPath}
        muted
        loop
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        style={{ display: "none" }}
      />
    </>
  );
}
