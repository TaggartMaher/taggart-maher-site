import "./loading.css";
import { MODE_OVERRIDE_STORAGE_KEY } from "../mode/chooseMode";
import { FORCE_COMPOSITOR_SESSION_KEY, stripModeFromUrl } from "./gateUrl";

interface IncompatibilityGateProps {
  reason: string;
  onForce: () => void;
}

function clearModeOverride(): void {
  try {
    window.localStorage.removeItem(MODE_OVERRIDE_STORAGE_KEY);
  } catch {
    // Ignore storage failures (private mode, quota).
  }
}

export function IncompatibilityGate({ reason, onForce }: IncompatibilityGateProps) {
  function handleForce(): void {
    try {
      window.sessionStorage.setItem(FORCE_COMPOSITOR_SESSION_KEY, "1");
    } catch {
      // Ignore — the user can re-confirm next page load.
    }
    onForce();
  }

  function handleViewRecommended(): void {
    clearModeOverride();
    const currentUrl = new URL(window.location.href);
    const nextUrl = stripModeFromUrl(currentUrl);
    window.location.assign(nextUrl);
  }

  return (
    <div className="loading-overlay" data-state="visible">
      <div className="loading-gate">
        <h2>This device may not be able to render the artistic interface.</h2>
        <p className="loading-gate-reason">Reason: {reason}</p>
        <p>
          You requested this mode via the URL or saved preference. The site can try to render it
          anyway, but performance may be poor or rendering may fail.
        </p>
        <div className="loading-gate-actions">
          <button type="button" className="loading-button" onClick={handleForce}>
            Force it anyway
          </button>
          <button type="button" className="loading-button" onClick={handleViewRecommended}>
            View recommended mode instead
          </button>
        </div>
      </div>
    </div>
  );
}
