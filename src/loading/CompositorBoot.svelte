<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ModeReason } from "../mode/chooseMode";
  import { getViewportSize, getWebGL2Support } from "../mode/deviceInfo";
  import { FORCE_COMPOSITOR_SESSION_KEY } from "./gateUrl";
  import IncompatibilityGate from "./IncompatibilityGate.svelte";
  import LoadingScreen from "./LoadingScreen.svelte";
  import { loadingTracker, type TrackerState } from "./LoadingTracker";
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
    children: Snippet;
  }

  let { modeReason, requiredAssets, children }: CompositorBootProps = $props();

  function computeInitialPhase(): BootPhase {
    if (modeReason.source === "auto") return "loading";
    if (readForceCompositorFlag()) return "loading";
    const verdict = evaluateCompatibility();
    return verdict.compatible ? "loading" : "gate";
  }

  const initialPhase = computeInitialPhase();
  const initialReason = initialPhase === "gate" ? evaluateCompatibility().reason : "";

  let phase = $state<BootPhase>(initialPhase);
  // Bumping the retry key force-remounts the children (via {#key}),
  // which re-runs their asset fetches.
  let retryKey = $state(0);

  // Pre-register the known asset list so the loading screen can show
  // the full menu at 0% before the compositor starts its fetches. Runs
  // synchronously during component init — before the children mount and
  // kick off their loadAsset calls — and again on retry. Phase
  // transitions must NOT reset the tracker, or finished assets would
  // flip back to "queued" mid-fade.
  function registerRequiredAssets(): void {
    const assets = requiredAssets ?? LOADABLE_ASSETS;
    loadingTracker.reset();
    for (const asset of assets) {
      loadingTracker.registerAsset(asset.name, asset.url);
    }
  }
  registerRequiredAssets();

  // Bridge the framework-free tracker into Svelte state. $state.raw
  // because each snapshot is an immutable replacement.
  let trackerState = $state.raw<TrackerState>(loadingTracker.getSnapshot());
  $effect(() => {
    const unsubscribe = loadingTracker.subscribe(() => {
      trackerState = loadingTracker.getSnapshot();
    });
    // Catch anything reported between component init and this effect.
    trackerState = loadingTracker.getSnapshot();
    return unsubscribe;
  });

  // Hold the completed loading screen for a beat once everything is
  // ready so the user sees every bar at 100% before the fade starts.
  const POST_READY_LINGER_MS = 1000;
  $effect(() => {
    if (phase !== "loading") return;
    if (!trackerState.ready) return;
    const timeoutId = window.setTimeout(() => (phase = "fading"), POST_READY_LINGER_MS);
    return () => window.clearTimeout(timeoutId);
  });

  function handleForce(): void {
    phase = "loading";
  }

  function handleRetry(): void {
    registerRequiredAssets();
    retryKey += 1;
    phase = "loading";
  }

  function handleSwitchToFallback(): void {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("mode", "fallback");
    window.location.assign(currentUrl.pathname + currentUrl.search + currentUrl.hash);
  }

  function handleOverlayTransitionEnd(): void {
    phase = "done";
  }

  // Compositor mounts during "loading" too — it must run to fetch
  // assets and emit the first-frame signal that flips tracker.ready.
  // The opaque overlay on top hides it visually until the fade begins.
  const showChildren = $derived(phase === "loading" || phase === "fading" || phase === "done");
  const showOverlay = $derived(phase === "loading" || phase === "fading");
  const fadeState: "visible" | "fading" = $derived(phase === "fading" ? "fading" : "visible");
</script>

{#if phase === "gate"}
  <IncompatibilityGate reason={initialReason} onForce={handleForce} />
{:else}
  {#if showChildren}
    {#key retryKey}
      <div>{@render children()}</div>
    {/key}
  {/if}
  {#if showOverlay}
    <LoadingScreen
      state={trackerState}
      {fadeState}
      onTransitionEnd={handleOverlayTransitionEnd}
      onRetry={handleRetry}
      onSwitchToFallback={handleSwitchToFallback}
    />
  {/if}
{/if}
