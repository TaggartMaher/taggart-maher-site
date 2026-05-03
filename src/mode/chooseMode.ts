import { getHostname, getTouchPoints, getViewportSize, getWebGL2Support } from "./deviceInfo";

export type Mode = "FULL_MODE" | "LIGHTWEIGHT_MODE" | "FALLBACK_MODE";

export interface ModeReason {
  mode: Mode;
  source: "query" | "storage" | "auto";
  // For "auto": which detection signal won. For diagnostics in Settings.
  detail: string;
}

export const MODE_OVERRIDE_STORAGE_KEY = "modeOverride";

const QUERY_MODE_ALIASES: Record<string, Mode> = {
  full: "FULL_MODE",
  full_mode: "FULL_MODE",
  lite: "LIGHTWEIGHT_MODE",
  lightweight: "LIGHTWEIGHT_MODE",
  lightweight_mode: "LIGHTWEIGHT_MODE",
  fallback: "FALLBACK_MODE",
  fallback_mode: "FALLBACK_MODE",
};

function parseModeAlias(rawValue: string | null | undefined): Mode | null {
  if (!rawValue) return null;
  const key = rawValue.trim().toLowerCase();
  return QUERY_MODE_ALIASES[key] ?? null;
}

function readQueryMode(): Mode | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return parseModeAlias(params.get("mode"));
  } catch {
    return null;
  }
}

function readStoredMode(): Mode | null {
  if (typeof window === "undefined") return null;
  try {
    return parseModeAlias(window.localStorage.getItem(MODE_OVERRIDE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredMode(mode: Mode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_OVERRIDE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures (private mode, quota, etc).
  }
}

function isMobileOrPortraitViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(max-width: 900px), (orientation: portrait) and (max-width: 1100px)")
    .matches;
}

function isTouchPrimaryDevice(): boolean {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
  }
  return getTouchPoints() > 0;
}

export function chooseMode(): ModeReason {
  const queryMode = readQueryMode();
  if (queryMode) {
    writeStoredMode(queryMode);
    return { mode: queryMode, source: "query", detail: "?mode= override" };
  }

  const storedMode = readStoredMode();
  if (storedMode) {
    return { mode: storedMode, source: "storage", detail: "localStorage override" };
  }

  if (getHostname().startsWith("blog.")) {
    return { mode: "FALLBACK_MODE", source: "auto", detail: "blog subdomain" };
  }

  const webgl2 = getWebGL2Support();
  if (!webgl2.supported) {
    const detail =
      webgl2.missingExtensions.length > 0
        ? `missing WebGL2 extensions: ${webgl2.missingExtensions.join(", ")}`
        : "no webgl2";
    return { mode: "FALLBACK_MODE", source: "auto", detail };
  }

  if (isMobileOrPortraitViewport()) {
    const viewport = getViewportSize();
    return {
      mode: "FALLBACK_MODE",
      source: "auto",
      detail: `viewport ${viewport.widthInPixels}×${viewport.heightInPixels}`,
    };
  }

  if (isTouchPrimaryDevice()) {
    return { mode: "LIGHTWEIGHT_MODE", source: "auto", detail: "touch input" };
  }

  return { mode: "FULL_MODE", source: "auto", detail: "desktop with mouse" };
}
