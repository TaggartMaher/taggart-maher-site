import { useEffect, useRef } from "react";
import { atlasImagePath, cellsPerSide } from "../config";
import type { PerfMetrics } from "./perfMetrics";
import {
  downsampleFragmentShaderSource,
  fragmentShaderSource,
  upsampleFragmentShaderSource,
  vertexShaderSource,
} from "./shader";

// Maximum depth of the dual-Kawase chain. Each level halves resolution
// per axis; depth 6 means the deepest level is 1/64th of the source's
// edge length.
const MAX_BLUR_CHAIN_DEPTH = 6;

interface CompositorProps {
  // Canvas the compositor uploads as `u_screen` each frame.
  screenSourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Effective blur radius (in screen-texture pixels) applied to the
  // screen-content image before compositing. 0 disables the blur.
  screenBlurRadiusPx: number;
  // Box-average radius (in atlas texels) applied to the per-cell
  // accumulation. Smooths cell-boundary flicker; 0 disables.
  lookupBlurRadius: number;
  // Per-axis linear stretch around (0.5, 0.5) applied to emitterUv.
  uStretch: number;
  vStretch: number;
  // Per-axis translation added to emitterUv after the stretch.
  uOffset: number;
  vOffset: number;
  // Symmetric inset of the valid screen-content sampling window.
  edgeCutoff: number;
  // Linear-light adjustments applied to the screen-content sample
  // before it multiplies into the bounce. 1.0 is the identity.
  screenSaturation: number;
  screenContrast: number;
  screenBrightness: number;
  // Optional sink for per-frame performance metrics, mutated each frame.
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
  screenBlurRadiusPx,
  lookupBlurRadius,
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
  const imageRef = useRef<HTMLImageElement | null>(null);
  const screenBlurRadiusPxRef = useRef(screenBlurRadiusPx);
  screenBlurRadiusPxRef.current = screenBlurRadiusPx;
  const lookupBlurRadiusRef = useRef(lookupBlurRadius);
  lookupBlurRadiusRef.current = lookupBlurRadius;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

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
    const lookupBlurRadiusUniformLocation = gl.getUniformLocation(program, "u_lookupBlurRadius");
    const cellGridUniformLocation = gl.getUniformLocation(program, "u_cellGrid[0]");
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

    // Dual-Kawase blur chain. Level 0 is the screen source's native
    // resolution; each level halves both axes. Downsample writes
    // level k from level k-1, then upsample walks back to level 0.
    // BLUR_OUTPUT_UNIT is where level 0 (the final blurred image) is
    // bound for the composite to sample; BLUR_READ_UNIT is the dynamic
    // source unit each pass binds its read-from level into.
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
      gl.activeTexture(gl.TEXTURE0 + BLUR_OUTPUT_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, blurLevels[0].texture);
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // Browser does no transfer conversion on upload; the shader does
    // sRGB <-> linear explicitly.
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    let cancelled = false;
    let animationFrameHandle: number | null = null;
    let atlasImageUploaded = false;

    const timerQueryExtension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const pendingTimerQueries: WebGLQuery[] = [];
    const exponentialAverageAlpha = 0.1;
    let cpuFrameMsAverage = 0;
    let gpuFrameMsAverage: number | null = timerQueryExtension ? 0 : null;
    const recentFrameTimestamps: number[] = [];
    const recentFrameTimestampsCapacity = 60;

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
      perfMetricsRef.current.cpuFrameMs = cpuFrameMsAverage;
      perfMetricsRef.current.gpuFrameMs = gpuFrameMsAverage;
    }

    function drainCompletedTimerQueries(): void {
      if (!gl || !timerQueryExtension) return;
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

    // E from the build pipeline (cells were divided by 1/E to fit
    // [0,1]); the shader multiplies the bounce term back by it.
    // 1 until atlasMeta.json arrives.
    let atlasScale = 1;

    // Per-cell screen-plane (col, row), uploaded as ivec2[CELL_COUNT].
    // Identity until atlasMeta.json overwrites it.
    const cellCount = cellsPerSide * cellsPerSide;
    const cellGridUniformData = new Int32Array(cellCount * 2);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      cellGridUniformData[cellIndex * 2] = cellIndex % cellsPerSide;
      cellGridUniformData[cellIndex * 2 + 1] = Math.floor(cellIndex / cellsPerSide);
    }

    fetch("/composite/atlasMeta.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((meta: { scale?: number; cellGrid?: Array<[number, number]> } | null) => {
        if (meta && typeof meta.scale === "number") {
          atlasScale = meta.scale;
        } else {
          console.warn(
            "[compositor] atlasMeta.json missing or invalid — bounce magnitude uncorrected",
          );
        }
        if (meta && Array.isArray(meta.cellGrid) && meta.cellGrid.length === cellCount) {
          for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
            const entry = meta.cellGrid[cellIndex];
            cellGridUniformData[cellIndex * 2] = entry[0];
            cellGridUniformData[cellIndex * 2 + 1] = entry[1];
          }
        } else {
          console.warn(
            "[compositor] atlasMeta.cellGrid missing or wrong length — screen-content lookup will use identity ordering",
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
      if (cancelled || !gl || !canvas || !image) return;

      const cpuStartMs = performance.now();
      recentFrameTimestamps.push(cpuStartMs);
      if (recentFrameTimestamps.length > recentFrameTimestampsCapacity) {
        recentFrameTimestamps.shift();
      }

      drainCompletedTimerQueries();

      let activeTimerQuery: WebGLQuery | null = null;
      if (timerQueryExtension) {
        activeTimerQuery = gl.createQuery();
        if (activeTimerQuery) {
          gl.beginQuery(timerQueryExtension.TIME_ELAPSED_EXT, activeTimerQuery);
        }
      }

      // Atlas is static; upload once when first ready.
      if (!atlasImageUploaded && image.complete && image.naturalWidth > 0) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        atlasImageUploaded = true;
      }

      // Upload the latest screen-content frame each rAF tick.
      const screenSource = screenSourceCanvasRef.current;
      if (!screenSource) return;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, screenTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screenSource);

      // Run the dual-Kawase blur chain if radius > 0. The composite
      // below samples the final blurred result from BLUR_OUTPUT_UNIT
      // instead of unit 1.
      //
      // Effective radius scales as ~(2^chainDepth) × kernelOffset
      // source pixels. Pick chainDepth = round(log2 R) (clamped) and
      // let the residual fall into kernelOffset.
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
      gl.uniform1i(lookupBlurRadiusUniformLocation, lookupBlurRadiusRef.current);
      gl.uniform2iv(cellGridUniformLocation, cellGridUniformData);
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
      animationFrameHandle = requestAnimationFrame(() => {
        renderFrame();
        scheduleNextFrame();
      });
    }

    function handleImageReady(): void {
      scheduleNextFrame();
    }

    if (image.complete && image.naturalWidth > 0) {
      handleImageReady();
    } else {
      image.addEventListener("load", handleImageReady, { once: true });
    }

    return () => {
      cancelled = true;
      image.removeEventListener("load", handleImageReady);
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
      <img
        ref={imageRef}
        src={atlasImagePath}
        alt=""
        crossOrigin="anonymous"
        style={{ display: "none" }}
      />
    </>
  );
}
