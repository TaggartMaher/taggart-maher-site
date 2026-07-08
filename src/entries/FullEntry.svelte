<script lang="ts">
  import "../composite/compositor.css";
  import Compositor from "../composite/Compositor.svelte";
  import { makeEmptyPerfMetrics, type PerfMetrics } from "../composite/perfMetrics";
  import ScreenOverlay from "../composite/ScreenOverlay.svelte";
  import SteamCompositor from "../composite/SteamCompositor.svelte";
  import { getLoadableAssets } from "../config";
  import DebugMenu from "../debug/DebugMenu.svelte";
  import { defaultDebugSettings, type DebugSettings } from "../debug/debugSettings";
  import CompositorBoot from "../loading/CompositorBoot.svelte";
  import Portfolio from "../portfolio/Portfolio.svelte";
  import ModeProvider from "../mode/ModeProvider.svelte";
  import Router from "../router/Router.svelte";
  import type { ModeReason } from "../mode/chooseMode";
  import ExitToNormalButton from "../shared/ExitToNormalButton.svelte";
  import type { ValueRef } from "../shared/valueRef";

  interface FullEntryProps {
    modeReason: ModeReason;
  }

  let { modeReason }: FullEntryProps = $props();

  const screenSourceCanvasRef: ValueRef<HTMLCanvasElement | null> = { current: null };
  // Monotonic counter incremented by ScreenOverlay whenever it repaints
  // the screen-content canvas. The compositors read this and skip the
  // texImage2D upload when their last-seen value matches — saving an
  // RGBA upload per frame whenever nothing on the screen changed.
  const screenSourceRevisionRef: ValueRef<number> = { current: 0 };
  const perfMetricsRef: ValueRef<PerfMetrics> = { current: makeEmptyPerfMetrics() };
  let debugSettings = $state<DebugSettings>(defaultDebugSettings);
  // Steam mounts (and its 7 MB atlas + framebuffers + WebGL context)
  // only when both the user toggle and eco mode allow it. Filtering
  // the loading-screen asset list keeps the boot from hanging on a
  // download we never intend to make.
  const steamMounted = $derived(!debugSettings.ecoMode && debugSettings.coffeeSteamEnabled);
  const requiredAssets = $derived(getLoadableAssets(steamMounted));

  function handleSettingsChange(next: DebugSettings): void {
    debugSettings = next;
  }

  function handleToggleEcoMode(): void {
    debugSettings = { ...debugSettings, ecoMode: !debugSettings.ecoMode };
  }
</script>

<ModeProvider {modeReason}>
  <Router>
    <ExitToNormalButton />
    <CompositorBoot {modeReason} {requiredAssets}>
      <Compositor
        {screenSourceCanvasRef}
        {screenSourceRevisionRef}
        screenBlurRadiusPx={debugSettings.screenBlurRadiusPx}
        uStretch={debugSettings.uStretch}
        vStretch={debugSettings.vStretch}
        uOffset={debugSettings.uOffset}
        vOffset={debugSettings.vOffset}
        edgeCutoff={debugSettings.edgeCutoff}
        screenSaturation={debugSettings.screenSaturation}
        screenContrast={debugSettings.screenContrast}
        screenBrightness={debugSettings.screenBrightness}
        ecoMode={debugSettings.ecoMode}
        {perfMetricsRef}
      />
      <ScreenOverlay
        settings={debugSettings}
        onSettingsChange={handleSettingsChange}
        textureCanvasRef={screenSourceCanvasRef}
        textureRevisionRef={screenSourceRevisionRef}
        {perfMetricsRef}
      >
        <Portfolio ecoMode={debugSettings.ecoMode} onToggleEcoMode={handleToggleEcoMode} />
      </ScreenOverlay>
      {#if steamMounted}
        <SteamCompositor
          {screenSourceCanvasRef}
          {screenSourceRevisionRef}
          ecoMode={debugSettings.ecoMode}
          enabled={debugSettings.coffeeSteamEnabled}
          intensity={debugSettings.coffeeSteamIntensity}
          maxIntensity={debugSettings.coffeeSteamMaxIntensity}
          opacity={debugSettings.coffeeSteamOpacity}
          screenBlurRadiusPx={debugSettings.coffeeSteamScreenBlurRadiusPx}
          framePaused={debugSettings.coffeeSteamFramePaused}
          frameOverride={debugSettings.coffeeSteamFrameOverride}
          showAtlas={debugSettings.coffeeSteamShowAtlas}
        />
      {/if}
      <DebugMenu settings={debugSettings} onChange={handleSettingsChange} {perfMetricsRef} />
    </CompositorBoot>
  </Router>
</ModeProvider>
