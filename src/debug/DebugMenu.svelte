<script lang="ts">
  import { makeEmptyPerfMetrics, type PerfMetrics } from "../composite/perfMetrics";
  import { testImages } from "../composite/testImages";
  import type { ValueRef } from "../shared/valueRef";
  import type { DebugSettings } from "./debugSettings";
  import "./debugMenu.css";

  interface DebugMenuProps {
    settings: DebugSettings;
    onChange: (next: DebugSettings) => void;
    // Live perf snapshot mutated by the compositor each frame. The menu
    // polls it on its own cadence (only while open) so the high-frequency
    // updates don't drive renders elsewhere.
    perfMetricsRef: ValueRef<PerfMetrics>;
  }

  let { settings, onChange, perfMetricsRef }: DebugMenuProps = $props();

  let open = $state(false);
  // Copy of the perf ref refreshed by the poll below. State (not a
  // direct ref read in markup) so the readouts update while open.
  let perf = $state<PerfMetrics>(makeEmptyPerfMetrics());

  // Poll the perf ref ~5 Hz while the menu is open. Closed → no timer,
  // no readouts, no incidental work.
  $effect(() => {
    if (!open) return;
    const intervalId = window.setInterval(() => {
      perf = { ...perfMetricsRef.current };
    }, 200);
    return () => window.clearInterval(intervalId);
  });

  $effect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Backtick toggles the menu — Quake-console style. Skip it while
      // typing in an input/textarea/contenteditable so it doesn't eat
      // legitimate keystrokes (e.g. text fields in the Portfolio overlay).
      if (event.key !== "`") return;
      const target = event.target as HTMLElement | null;
      if (target && target.isContentEditable) return;
      const tagName = target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;
      event.preventDefault();
      open = !open;
      if (open) perf = { ...perfMetricsRef.current };
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function formatFps(value: number): string {
    return value > 0 ? value.toFixed(1) : "—";
  }

  function formatMs(value: number | null): string {
    return value === null ? "n/a" : value > 0 ? `${value.toFixed(2)} ms` : "—";
  }

  function inputValueAsNumber(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  function inputChecked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  function inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
</script>

{#if open}
  <div class="debug-menu" role="dialog" aria-label="Debug menu">
    <header class="debug-menu-header">
      <span>Debug</span>
      <button
        type="button"
        class="debug-menu-close"
        onclick={() => (open = false)}
        aria-label="Close debug menu"
      >
        ×
      </button>
    </header>

    <section class="debug-menu-section">
      <label class="debug-menu-row">
        <input
          type="checkbox"
          checked={settings.hidePageOverlay}
          onchange={(event) => onChange({ ...settings, hidePageOverlay: inputChecked(event) })}
        />
        <span>Hide page overlay</span>
      </label>
      <label class="debug-menu-row">
        <span>Screen blur ({settings.screenBlurRadiusPx}px)</span>
        <input
          class="debug-menu-control"
          type="range"
          min={0}
          max={32}
          step={1}
          value={settings.screenBlurRadiusPx}
          oninput={(event) =>
            onChange({ ...settings, screenBlurRadiusPx: inputValueAsNumber(event) })}
        />
      </label>
      <label class="debug-menu-row">
        <span>U stretch ({settings.uStretch.toFixed(2)})</span>
        <input
          class="debug-menu-control"
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={settings.uStretch}
          oninput={(event) => onChange({ ...settings, uStretch: inputValueAsNumber(event) })}
        />
      </label>
      <label class="debug-menu-row">
        <span>V stretch ({settings.vStretch.toFixed(2)})</span>
        <input
          class="debug-menu-control"
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={settings.vStretch}
          oninput={(event) => onChange({ ...settings, vStretch: inputValueAsNumber(event) })}
        />
      </label>
      <label class="debug-menu-row">
        <span>U offset ({settings.uOffset.toFixed(2)})</span>
        <input
          class="debug-menu-control"
          type="range"
          min={-0.5}
          max={0.5}
          step={0.01}
          value={settings.uOffset}
          oninput={(event) => onChange({ ...settings, uOffset: inputValueAsNumber(event) })}
        />
      </label>
      <label class="debug-menu-row">
        <span>V offset ({settings.vOffset.toFixed(2)})</span>
        <input
          class="debug-menu-control"
          type="range"
          min={-0.5}
          max={0.5}
          step={0.01}
          value={settings.vOffset}
          oninput={(event) => onChange({ ...settings, vOffset: inputValueAsNumber(event) })}
        />
      </label>
      <label class="debug-menu-row">
        <span>Edge cutoff ({settings.edgeCutoff.toFixed(2)})</span>
        <input
          class="debug-menu-control"
          type="range"
          min={0}
          max={0.25}
          step={0.005}
          value={settings.edgeCutoff}
          oninput={(event) => onChange({ ...settings, edgeCutoff: inputValueAsNumber(event) })}
        />
      </label>
      <label class="debug-menu-row">
        <span>Saturation ({settings.screenSaturation.toFixed(2)})</span>
        <input
          class="debug-menu-control"
          type="range"
          min={0}
          max={3}
          step={0.01}
          value={settings.screenSaturation}
          oninput={(event) =>
            onChange({ ...settings, screenSaturation: inputValueAsNumber(event) })}
        />
      </label>
      <label class="debug-menu-row">
        <span>Contrast ({settings.screenContrast.toFixed(2)})</span>
        <input
          class="debug-menu-control"
          type="range"
          min={0}
          max={3}
          step={0.01}
          value={settings.screenContrast}
          oninput={(event) => onChange({ ...settings, screenContrast: inputValueAsNumber(event) })}
        />
      </label>
      <label class="debug-menu-row">
        <span>Brightness ({settings.screenBrightness.toFixed(2)})</span>
        <input
          class="debug-menu-control"
          type="range"
          min={0}
          max={3}
          step={0.01}
          value={settings.screenBrightness}
          oninput={(event) =>
            onChange({ ...settings, screenBrightness: inputValueAsNumber(event) })}
        />
      </label>
    </section>

    <section class="debug-menu-section">
      <label class="debug-menu-row">
        <input
          type="checkbox"
          checked={settings.imageBackgroundEnabled}
          onchange={(event) =>
            onChange({ ...settings, imageBackgroundEnabled: inputChecked(event) })}
        />
        <span>Image background</span>
      </label>
      {#if settings.imageBackgroundEnabled}
        <select
          class="debug-menu-control"
          value={settings.imageBackgroundUrl}
          onchange={(event) =>
            onChange({
              ...settings,
              imageBackgroundUrl: (event.target as HTMLSelectElement).value,
            })}
        >
          {#each testImages as image (image.url)}
            <option value={image.url}>{image.label}</option>
          {/each}
        </select>
        <label class="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.hideImageOverlay}
            onchange={(event) => onChange({ ...settings, hideImageOverlay: inputChecked(event) })}
          />
          <span>Hide image overlay</span>
        </label>
      {/if}
    </section>

    <section class="debug-menu-section">
      <label class="debug-menu-row">
        <input
          type="checkbox"
          checked={settings.colorBackgroundEnabled}
          onchange={(event) =>
            onChange({ ...settings, colorBackgroundEnabled: inputChecked(event) })}
        />
        <span>Color background</span>
      </label>
      {#if settings.colorBackgroundEnabled}
        <input
          class="debug-menu-control"
          type="color"
          value={settings.colorBackgroundColor}
          oninput={(event) => onChange({ ...settings, colorBackgroundColor: inputValue(event) })}
        />
      {/if}
    </section>

    <section class="debug-menu-section">
      <label class="debug-menu-row">
        <input
          type="checkbox"
          checked={settings.squareEnabled}
          onchange={(event) => onChange({ ...settings, squareEnabled: inputChecked(event) })}
        />
        <span>Draggable square</span>
      </label>
      {#if settings.squareEnabled}
        <input
          class="debug-menu-control"
          type="color"
          value={settings.squareColor}
          oninput={(event) => onChange({ ...settings, squareColor: inputValue(event) })}
        />
        <label class="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.hideSquareOverlay}
            onchange={(event) => onChange({ ...settings, hideSquareOverlay: inputChecked(event) })}
          />
          <span>Hide square overlay</span>
        </label>
      {/if}
    </section>

    <section class="debug-menu-section">
      <label class="debug-menu-row">
        <input
          type="checkbox"
          checked={settings.coffeeSteamEnabled}
          onchange={(event) => onChange({ ...settings, coffeeSteamEnabled: inputChecked(event) })}
        />
        <span>Coffee steam</span>
      </label>
      {#if settings.coffeeSteamEnabled}
        <label class="debug-menu-row">
          <span>Steam intensity ({settings.coffeeSteamIntensity.toFixed(2)})</span>
          <input
            class="debug-menu-control"
            type="range"
            min={0}
            max={100}
            step={1.0}
            value={settings.coffeeSteamIntensity}
            oninput={(event) =>
              onChange({ ...settings, coffeeSteamIntensity: inputValueAsNumber(event) })}
          />
        </label>
        <label class="debug-menu-row">
          <span>Steam max ({settings.coffeeSteamMaxIntensity.toFixed(2)})</span>
          <input
            class="debug-menu-control"
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={settings.coffeeSteamMaxIntensity}
            oninput={(event) =>
              onChange({ ...settings, coffeeSteamMaxIntensity: inputValueAsNumber(event) })}
          />
        </label>
        <label class="debug-menu-row">
          <span>Steam opacity ({settings.coffeeSteamOpacity.toFixed(2)})</span>
          <input
            class="debug-menu-control"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.coffeeSteamOpacity}
            oninput={(event) =>
              onChange({ ...settings, coffeeSteamOpacity: inputValueAsNumber(event) })}
          />
        </label>
        <label class="debug-menu-row">
          <span>Steam screen blur ({settings.coffeeSteamScreenBlurRadiusPx}px)</span>
          <input
            class="debug-menu-control"
            type="range"
            min={0}
            max={32}
            step={1}
            value={settings.coffeeSteamScreenBlurRadiusPx}
            oninput={(event) =>
              onChange({ ...settings, coffeeSteamScreenBlurRadiusPx: inputValueAsNumber(event) })}
          />
        </label>
        <label class="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.coffeeSteamFramePaused}
            onchange={(event) =>
              onChange({ ...settings, coffeeSteamFramePaused: inputChecked(event) })}
          />
          <span>Pause steam playback</span>
        </label>
        <label class="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.coffeeSteamFrameOverride !== null}
            onchange={(event) =>
              onChange({
                ...settings,
                coffeeSteamFrameOverride: inputChecked(event)
                  ? (settings.coffeeSteamFrameOverride ?? 0)
                  : null,
              })}
          />
          <span>Override frame</span>
        </label>
        {#if settings.coffeeSteamFrameOverride !== null}
          <label class="debug-menu-row">
            <span>Frame ({settings.coffeeSteamFrameOverride})</span>
            <input
              class="debug-menu-control"
              type="range"
              min={0}
              max={95}
              step={1}
              value={settings.coffeeSteamFrameOverride}
              oninput={(event) =>
                onChange({ ...settings, coffeeSteamFrameOverride: inputValueAsNumber(event) })}
            />
          </label>
        {/if}
        <label class="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.coffeeSteamShowAtlas}
            onchange={(event) =>
              onChange({ ...settings, coffeeSteamShowAtlas: inputChecked(event) })}
          />
          <span>Show atlas (debug)</span>
        </label>
      {/if}
    </section>

    <section class="debug-menu-section">
      <div class="debug-menu-row">
        <span>Display FPS</span>
        <span>{formatFps(perf.displayFps)}</span>
      </div>
      <div class="debug-menu-row">
        <span>CPU / frame</span>
        <span>{formatMs(perf.cpuFrameMs)}</span>
      </div>
      <div class="debug-menu-row">
        <span>GPU / frame</span>
        <span>{formatMs(perf.gpuFrameMs)}</span>
      </div>
      <div class="debug-menu-row">
        <span>Rasterizer FPS</span>
        <span>{formatFps(perf.rasterizerFps)}</span>
      </div>
      <label class="debug-menu-row">
        <input
          type="checkbox"
          checked={settings.ecoMode}
          onchange={(event) => onChange({ ...settings, ecoMode: inputChecked(event) })}
        />
        <span>Eco mode</span>
      </label>
    </section>

    <footer class="debug-menu-footer">` to toggle</footer>
  </div>
{/if}
