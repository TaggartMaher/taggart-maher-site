import type { CSSProperties } from "react";
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

export function LoadingScreen({
  state,
  fadeState,
  onTransitionEnd,
  onRetry,
  onSwitchToFallback,
}: LoadingScreenProps) {
  const overallPercent =
    state.totalBytes > 0
      ? Math.min(100, Math.floor((state.loadedBytes / state.totalBytes) * 100))
      : 0;
  const fillStyle: CSSProperties = { width: `${overallPercent}%` };
  const hasError = state.assets.some((asset) => asset.error);

  return (
    <div
      className="loading-overlay"
      data-state={fadeState}
      onTransitionEnd={(event) => {
        if (event.propertyName === "opacity") onTransitionEnd?.();
      }}
    >
      <div className="loading-card">
        <h1 className="loading-title">tm-portfolio</h1>
        <div className="loading-overall">
          <div className="loading-bar" aria-hidden="true">
            <div className="loading-bar-fill" style={fillStyle} />
          </div>
          <span className="loading-overall-percent">{overallPercent}%</span>
        </div>
        <ul className="loading-asset-list">
          {state.assets.map((asset) => (
            <li key={asset.url} className="loading-asset-row">
              <span className="loading-asset-name">{asset.name}</span>
              <span className="loading-asset-status" data-error={asset.error ? "true" : "false"}>
                {formatAssetStatus(asset)}
              </span>
            </li>
          ))}
        </ul>
        {hasError && (
          <div className="loading-error-actions">
            <button type="button" className="loading-button" onClick={onRetry}>
              Retry
            </button>
            <button type="button" className="loading-button" onClick={onSwitchToFallback}>
              Switch to fallback mode
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
