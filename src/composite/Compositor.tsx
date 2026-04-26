import { useEffect, useRef } from "react";
import { atlasPath } from "../config";
import { fragmentShaderSource, vertexShaderSource } from "./shader";

interface CompositorProps {
  // Canvas providing the live screen-content image. The compositor
  // re-uploads it as the `u_screen` texture every video frame, so any
  // 2D-canvas drawing the parent does is reflected in the bounce light
  // on the next frame. May start null and be assigned later — the
  // compositor waits for it before rendering.
  screenSourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
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

export function Compositor({ screenSourceCanvasRef }: CompositorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
    const program = linkProgram(gl, vertexShader, fragmentShader);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    const positionAttribLocation = gl.getAttribLocation(program, "a_position");
    const atlasUniformLocation = gl.getUniformLocation(program, "u_atlas");
    const screenUniformLocation = gl.getUniformLocation(program, "u_screen");
    const scaleUniformLocation = gl.getUniformLocation(program, "u_scale");

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
    let videoFrameCallbackHandle: number | null = null;
    let animationFrameHandle: number | null = null;

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

      resizeCanvasToViewport();

      gl.useProgram(program);
      gl.bindVertexArray(vertexArrayObject);
      gl.uniform1i(atlasUniformLocation, 0);
      gl.uniform1i(screenUniformLocation, 1);
      gl.uniform1f(scaleUniformLocation, atlasScale);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }

    function scheduleNextFrame(): void {
      if (cancelled || !video) return;
      // requestVideoFrameCallback is in WHATWG and shipped in all majors,
      // but check anyway since lib.dom typing doesn't reflect runtime
      // availability on older user agents.
      if ("requestVideoFrameCallback" in video) {
        videoFrameCallbackHandle = video.requestVideoFrameCallback(() => {
          renderFrame();
          scheduleNextFrame();
        });
      } else {
        animationFrameHandle = requestAnimationFrame(() => {
          renderFrame();
          scheduleNextFrame();
        });
      }
    }

    function handleVideoReady(): void {
      video!.play().catch((error) => {
        console.warn("[compositor] video autoplay rejected:", error);
      });
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
      if (videoFrameCallbackHandle !== null && "cancelVideoFrameCallback" in video) {
        video.cancelVideoFrameCallback(videoFrameCallbackHandle);
      }
      if (animationFrameHandle !== null) {
        cancelAnimationFrame(animationFrameHandle);
      }
      gl.deleteTexture(atlasTexture);
      gl.deleteTexture(screenTexture);
      gl.deleteBuffer(fullScreenQuadBuffer);
      gl.deleteVertexArray(vertexArrayObject);
      gl.deleteProgram(program);
    };
  }, [screenSourceCanvasRef]);

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
