// Device-shape probes used by both the mode picker and the Settings
// page. Centralized here so the verdict shown in Settings is computed
// from the same primitives that drove the mode choice.

export interface ViewportSize {
  widthInPixels: number;
  heightInPixels: number;
}

export interface WebGL2Support {
  supported: boolean;
  // Required extensions that the page asked for but the GPU did not
  // expose. An empty array with `supported: true` means the compositor
  // can run.
  missingExtensions: string[];
}

// Extensions the compositor genuinely cannot run without. Today the
// dual-Kawase blur uses RGBA8 framebuffers and the position texture is
// sampled-only (RGBA16F sampled, never rendered to), so the only hard
// requirement is WebGL2 itself. Timer queries are optional perf
// telemetry and intentionally omitted.
export const REQUIRED_WEBGL2_EXTENSIONS: string[] = [];

export function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { widthInPixels: 1, heightInPixels: 1 };
  }
  return {
    widthInPixels: window.innerWidth,
    heightInPixels: window.innerHeight,
  };
}

export function getDevicePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return window.devicePixelRatio || 1;
}

export type PointerKind = "fine" | "coarse" | "unknown";

export function getPointerKind(): PointerKind {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "unknown";
  }
  if (window.matchMedia("(pointer: fine)").matches) return "fine";
  if (window.matchMedia("(pointer: coarse)").matches) return "coarse";
  return "unknown";
}

export function getTouchPoints(): number {
  if (typeof navigator === "undefined") return 0;
  return navigator.maxTouchPoints ?? 0;
}

export function getHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

export function getUserAgent(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent;
}

export function getWebGL2Support(): WebGL2Support {
  if (typeof document === "undefined") {
    return { supported: false, missingExtensions: [] };
  }
  let context: WebGL2RenderingContext | null = null;
  try {
    const probeCanvas = document.createElement("canvas");
    context = probeCanvas.getContext("webgl2") as WebGL2RenderingContext | null;
  } catch {
    return { supported: false, missingExtensions: [] };
  }
  if (!context) {
    return { supported: false, missingExtensions: [] };
  }
  const missingExtensions: string[] = [];
  for (const extensionName of REQUIRED_WEBGL2_EXTENSIONS) {
    if (!context.getExtension(extensionName)) {
      missingExtensions.push(extensionName);
    }
  }
  // Release the probe context immediately. Browsers cap the number of
  // live WebGL contexts; on a software renderer or a driver with a tight
  // limit, an abandoned probe context keeps its slot until GC and can
  // starve the real compositor context — the probe then reports WebGL2
  // "supported" while Compositor.getContext("webgl2") returns null.
  const loseContextExtension = context.getExtension("WEBGL_lose_context");
  if (loseContextExtension && typeof loseContextExtension.loseContext === "function") {
    loseContextExtension.loseContext();
  }
  return { supported: missingExtensions.length === 0, missingExtensions };
}

// Browser/OS identifier for the Settings "Your device" table. The full
// UA is long and looks technical; condense to vendor + version when we
// can recognize it.
export function abbreviateUserAgent(userAgent: string): string {
  if (!userAgent) return "unknown";
  const match = /(Firefox|Chrome|CriOS|Edg|Edge|Safari|Opera|OPR)\/([\d.]+)/.exec(userAgent);
  if (!match) return userAgent.slice(0, 80);
  const labelMap: Record<string, string> = {
    Firefox: "Firefox",
    Chrome: "Chrome",
    CriOS: "Chrome iOS",
    Edg: "Edge",
    Edge: "Edge",
    Safari: "Safari",
    Opera: "Opera",
    OPR: "Opera",
  };
  const label = labelMap[match[1]] ?? match[1];
  return `${label} ${match[2]}`;
}
