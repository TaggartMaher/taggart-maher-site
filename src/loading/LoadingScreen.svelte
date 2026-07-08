<script lang="ts">
  import "./loading.css";
  import type { AssetProgress, TrackerState } from "./LoadingTracker";

  interface LoadingScreenProps {
    state: TrackerState;
    // "visible" — fully opaque. "fading" — opacity transitions to 0.
    fadeState: "visible" | "fading";
    // Fired when the CSS opacity transition completes. CompositorBoot
    // listens for this to unmount the overlay.
    onTransitionEnd?: () => void;
    // Fires when the user clicks "Retry" on an error state.
    onRetry: () => void;
    // Fires when the user clicks "Switch to fallback mode" on an error
    // state.
    onSwitchToFallback: () => void;
  }

  let { state, fadeState, onTransitionEnd, onRetry, onSwitchToFallback }: LoadingScreenProps =
    $props();

  function formatAssetStatus(asset: AssetProgress): string {
    if (asset.error) return `failed (${asset.error})`;
    if (asset.done) return "done";
    if (asset.total <= 0) {
      if (asset.loaded === 0) return "queued";
      return "loading…";
    }
    const percent = Math.floor((asset.loaded / asset.total) * 100);
    return `${percent}%`;
  }

  const overallPercent = $derived(
    state.totalBytes > 0
      ? Math.min(100, Math.floor((state.loadedBytes / state.totalBytes) * 100))
      : 0,
  );
  const hasError = $derived(state.assets.some((asset) => asset.error));
</script>

<div
  class="loading-overlay"
  data-state={fadeState}
  ontransitionend={(event) => {
    if (event.propertyName === "opacity") onTransitionEnd?.();
  }}
>
  <div class="loading-card">
    <h1 class="loading-title">tm-portfolio</h1>
    <div class="loading-overall">
      <div class="loading-bar" aria-hidden="true">
        <div class="loading-bar-fill" style:width="{overallPercent}%"></div>
      </div>
      <span class="loading-overall-percent">{overallPercent}%</span>
    </div>
    <ul class="loading-asset-list">
      {#each state.assets as asset (asset.url)}
        <li class="loading-asset-row">
          <span class="loading-asset-name">{asset.name}</span>
          <span class="loading-asset-status" data-error={asset.error ? "true" : "false"}>
            {formatAssetStatus(asset)}
          </span>
        </li>
      {/each}
    </ul>
    {#if hasError}
      <div class="loading-error-actions">
        <button type="button" class="loading-button" onclick={onRetry}>Retry</button>
        <button type="button" class="loading-button" onclick={onSwitchToFallback}>
          Switch to fallback mode
        </button>
      </div>
    {/if}
  </div>
</div>
