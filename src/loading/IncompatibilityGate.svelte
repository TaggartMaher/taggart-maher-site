<script lang="ts">
  import "./loading.css";
  import { MODE_OVERRIDE_STORAGE_KEY } from "../mode/chooseMode";
  import { FORCE_COMPOSITOR_SESSION_KEY, stripModeFromUrl } from "./gateUrl";

  interface IncompatibilityGateProps {
    reason: string;
    onForce: () => void;
  }

  let { reason, onForce }: IncompatibilityGateProps = $props();

  function clearModeOverride(): void {
    try {
      window.localStorage.removeItem(MODE_OVERRIDE_STORAGE_KEY);
    } catch {
      // Ignore storage failures (private mode, quota).
    }
  }

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
</script>

<div class="loading-overlay" data-state="visible">
  <div class="loading-gate">
    <h2>This device may not be able to render the artistic interface.</h2>
    <p class="loading-gate-reason">Reason: {reason}</p>
    <p>
      You requested this mode via the URL or saved preference. The site can try to render it anyway,
      but performance may be poor or rendering may fail.
    </p>
    <div class="loading-gate-actions">
      <button type="button" class="loading-button" onclick={handleForce}>Force it anyway</button>
      <button type="button" class="loading-button" onclick={handleViewRecommended}>
        View recommended mode instead
      </button>
    </div>
  </div>
</div>
