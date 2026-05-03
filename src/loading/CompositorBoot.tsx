import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ModeReason } from "../mode/chooseMode";
import { getViewportSize, getWebGL2Support } from "../mode/deviceInfo";
import { FORCE_COMPOSITOR_SESSION_KEY } from "./gateUrl";
import { IncompatibilityGate } from "./IncompatibilityGate";
import { LoadingScreen } from "./LoadingScreen";
import { loadingTracker, useLoadingTracker } from "./LoadingTracker";
import { LOADABLE_ASSETS } from "../config";

type BootPhase = "gate" | "loading" | "fading" | "done";

interface CompatibilityVerdict {
  compatible: boolean;
  reason: string;
}

function evaluateCompatibility(): CompatibilityVerdict {
  const webgl2 = getWebGL2Support();
  if (!webgl2.supported) {
    if (webgl2.missingExtensions.length > 0) {
      return {
        compatible: false,
        reason: `WebGL2 is missing required extensions: ${webgl2.missingExtensions.join(", ")}.`,
      };
    }
    return {
      compatible: false,
      reason: "WebGL2 is not available in this browser.",
    };
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const portraitOrSmall = window.matchMedia(
      "(max-width: 900px), (orientation: portrait) and (max-width: 1100px)",
    ).matches;
    if (portraitOrSmall) {
      const viewport = getViewportSize();
      return {
        compatible: false,
        reason: `Viewport ${viewport.widthInPixels}×${viewport.heightInPixels} is below the desktop landscape threshold.`,
      };
    }
  }
  return { compatible: true, reason: "" };
}

function readForceCompositorFlag(): boolean {
  try {
    return window.sessionStorage.getItem(FORCE_COMPOSITOR_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

interface CompositorBootProps {
  modeReason: ModeReason;
  // Subset of LOADABLE_ASSETS the calling entry actually intends to
  // fetch this session. When unset (the default), the full list is
  // pre-registered. Entries that gate the steam compositor off (eco
  // mode, coffee-steam toggle off) pass `getLoadableAssets(false)` so
  // the loading screen doesn't sit waiting for steam_atlas to download.
  requiredAssets?: { name: string; url: string }[];
  children: ReactNode;
}

// Wraps the compositor entries (FullEntry, LightweightEntry) in the
// loading-screen + incompatibility-gate state machine. See
// LOADING_SCREEN_PLAN.md §4 for the four phases.
export function CompositorBoot({ modeReason, requiredAssets, children }: CompositorBootProps) {
  const initialPhase = useMemo<BootPhase>(() => {
    if (modeReason.source === "auto") return "loading";
    if (readForceCompositorFlag()) return "loading";
    const verdict = evaluateCompatibility();
    return verdict.compatible ? "loading" : "gate";
  }, [modeReason.source]);

  const initialReason = useMemo<string>(() => {
    if (initialPhase !== "gate") return "";
    return evaluateCompatibility().reason;
  }, [initialPhase]);

  const [phase, setPhase] = useState<BootPhase>(initialPhase);
  // Bumping the retry key force-remounts the children, which re-runs
  // their asset fetches.
  const [retryKey, setRetryKey] = useState(0);

  // Pre-register the known asset list so the loading screen can show
  // the full menu at 0% before the compositor starts its fetches. Only
  // re-runs on retry — phase transitions must NOT reset the tracker,
  // or finished assets would flip back to "queued" mid-fade. The
  // assets snapshot is captured at boot time and intentionally NOT
  // re-applied if `requiredAssets` changes mid-load (the compositors
  // mount at boot and don't add new fetches until a future retry).
  useEffect(() => {
    const assets = requiredAssets ?? LOADABLE_ASSETS;
    loadingTracker.reset();
    for (const asset of assets) {
      loadingTracker.registerAsset(asset.name, asset.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  const trackerState = useLoadingTracker();

  // Hold the completed loading screen for a beat once everything is
  // ready so the user sees every bar at 100% before the fade starts.
  const POST_READY_LINGER_MS = 1000;
  useEffect(() => {
    if (phase !== "loading") return;
    if (!trackerState.ready) return;
    const timeoutId = window.setTimeout(() => setPhase("fading"), POST_READY_LINGER_MS);
    return () => window.clearTimeout(timeoutId);
  }, [phase, trackerState.ready]);

  function handleForce(): void {
    setPhase("loading");
  }

  function handleRetry(): void {
    setRetryKey((previous) => previous + 1);
    setPhase("loading");
  }

  function handleSwitchToFallback(): void {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("mode", "fallback");
    window.location.assign(currentUrl.pathname + currentUrl.search + currentUrl.hash);
  }

  function handleOverlayTransitionEnd(): void {
    setPhase("done");
  }

  if (phase === "gate") {
    return <IncompatibilityGate reason={initialReason} onForce={handleForce} />;
  }

  // Compositor mounts during "loading" too — it must run to fetch
  // assets and emit the first-frame signal that flips tracker.ready.
  // The opaque overlay on top hides it visually until the fade begins.
  const showChildren = phase === "loading" || phase === "fading" || phase === "done";
  const showOverlay = phase === "loading" || phase === "fading";
  const fadeState = phase === "fading" ? "fading" : "visible";

  return (
    <>
      {showChildren && <div key={retryKey}>{children}</div>}
      {showOverlay && (
        <LoadingScreen
          state={trackerState}
          fadeState={fadeState}
          onTransitionEnd={handleOverlayTransitionEnd}
          onRetry={handleRetry}
          onSwitchToFallback={handleSwitchToFallback}
        />
      )}
    </>
  );
}
