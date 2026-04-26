import { useEffect, useRef } from "react";
import { atlasPath } from "../config";
import type { PerfMetrics } from "./perfMetrics";
import { blurFragmentShaderSource, fragmentShaderSource, vertexShaderSource } from "./shader";

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
  // Gaussian blur radius (in screen-texture pixels) applied to the
  // screen-content image before it feeds the composite. 0 disables the
  // blur passes and the composite samples the raw screen texture.
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
    const blurFragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, blurFragmentShaderSource);
    const program = linkProgram(gl, vertexShader, fragmentShader);
    const blurProgram = linkProgram(gl, vertexShader, blurFragmentShader);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteShader(blurFragmentShader);

    // Both vertex shaders declare a_position at layout location 0, so the
    // single fullscreen-quad VAO below works for both programs.
    const positionAttribLocation = 0;
    const atlasUniformLocation = gl.getUniformLocation(program, "u_atlas");
    const screenUniformLocation = gl.getUniformLocation(program, "u_screen");
    const scaleUniformLocation = gl.getUniformLocation(program, "u_scale");
    const uvStretchUniformLocation = gl.getUniformLocation(program, "u_uvStretch");
    const uvOffsetUniformLocation = gl.getUniformLocation(program, "u_uvOffset");
    const edgeCutoffUniformLocation = gl.getUniformLocation(program, "u_edgeCutoff");
    const blurSourceUniformLocation = gl.getUniformLocation(blurProgram, "u_source");
    const blurDirectionUniformLocation = gl.getUniformLocation(blurProgram, "u_direction");
    const blurRadiusUniformLocation = gl.getUniformLocation(blurProgram, "u_radiusPx");

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
    // Ping-pong targets for the separable blur. The horizontal pass writes
    // into `blurTextureA` from `screenTexture`; the vertical pass writes
    // into `blurTextureB` from `blurTextureA`; the composite then samples
    // `blurTextureB`. Both are sized to the screen source's dimensions on
    // first use and resized when the source changes shape.
    const blurTextureA = makeTexture(2);
    const blurTextureB = makeTexture(3);
    const blurFramebufferA = gl.createFramebuffer();
    const blurFramebufferB = gl.createFramebuffer();
    if (!blurFramebufferA || !blurFramebufferB) {
      throw new Error("[compositor] gl.createFramebuffer returned null");
    }
    let blurTextureWidth = 0;
    let blurTextureHeight = 0;
    function ensureBlurTargetsSized(width: number, height: number): void {
      if (!gl) return;
      if (width === blurTextureWidth && height === blurTextureHeight) return;
      blurTextureWidth = width;
      blurTextureHeight = height;
      for (const [unit, texture, framebuffer] of [
        [2, blurTextureA, blurFramebufferA],
        [3, blurTextureB, blurFramebufferB],
      ] as const) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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

      // Run the separable blur passes if the user has dialed in a non-zero
      // radius. The two passes draw at the screen source's native size
      // into the ping-pong FBOs; the composite below will then sample the
      // final blurred result from texture unit 3 instead of unit 1.
      const blurRadiusPx = Math.max(0, Math.floor(screenBlurRadiusPxRef.current));
      const screenSourceWidth = screenSource.width;
      const screenSourceHeight = screenSource.height;
      const blurEnabled = blurRadiusPx > 0 && screenSourceWidth > 0 && screenSourceHeight > 0;
      if (blurEnabled) {
        ensureBlurTargetsSized(screenSourceWidth, screenSourceHeight);
        gl.useProgram(blurProgram);
        gl.bindVertexArray(vertexArrayObject);
        gl.uniform1i(blurRadiusUniformLocation, blurRadiusPx);
        gl.viewport(0, 0, screenSourceWidth, screenSourceHeight);

        // Horizontal pass: screenTexture (unit 1) → blurFramebufferA.
        gl.bindFramebuffer(gl.FRAMEBUFFER, blurFramebufferA);
        gl.uniform1i(blurSourceUniformLocation, 1);
        gl.uniform2f(blurDirectionUniformLocation, 1 / screenSourceWidth, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Vertical pass: blurTextureA (unit 2) → blurFramebufferB.
        gl.bindFramebuffer(gl.FRAMEBUFFER, blurFramebufferB);
        gl.uniform1i(blurSourceUniformLocation, 2);
        gl.uniform2f(blurDirectionUniformLocation, 0, 1 / screenSourceHeight);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
      }

      resizeCanvasToViewport();

      gl.useProgram(program);
      gl.bindVertexArray(vertexArrayObject);
      gl.uniform1i(atlasUniformLocation, 0);
      gl.uniform1i(screenUniformLocation, blurEnabled ? 3 : 1);
      gl.uniform1f(scaleUniformLocation, atlasScale);
      gl.uniform2f(uvStretchUniformLocation, uStretchRef.current, vStretchRef.current);
      gl.uniform2f(uvOffsetUniformLocation, uOffsetRef.current, vOffsetRef.current);
      gl.uniform1f(edgeCutoffUniformLocation, edgeCutoffRef.current);
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
      gl.deleteTexture(blurTextureA);
      gl.deleteTexture(blurTextureB);
      gl.deleteFramebuffer(blurFramebufferA);
      gl.deleteFramebuffer(blurFramebufferB);
      gl.deleteBuffer(fullScreenQuadBuffer);
      gl.deleteVertexArray(vertexArrayObject);
      gl.deleteProgram(program);
      gl.deleteProgram(blurProgram);
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
