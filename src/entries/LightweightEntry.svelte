<script lang="ts">
  import "../composite/compositor.css";
  import Compositor from "../composite/Compositor.svelte";
  import { makeEmptyPerfMetrics, type PerfMetrics } from "../composite/perfMetrics";
  import ScreenOverlay from "../composite/ScreenOverlay.svelte";
  import SteamCompositor from "../composite/SteamCompositor.svelte";
  import { getLoadableAssets } from "../config";
  import DebugMenu from "../debug/DebugMenu.svelte";
  import { defaultDebugSettings, type DebugSettings } from "../debug/debugSettings";
  import LiteInterface from "../lite/LiteInterface.svelte";
  import CompositorBoot from "../loading/CompositorBoot.svelte";
  import ModeProvider from "../mode/ModeProvider.svelte";
  import Router from "../router/Router.svelte";
  import type { ModeReason } from "../mode/chooseMode";
  import ExitToNormalButton from "../shared/ExitToNormalButton.svelte";
  import type { ValueRef } from "../shared/valueRef";

  interface LightweightEntryProps {
    modeReason: ModeReason;
  }

  // LIGHTWEIGHT_MODE: same compositor scene as FullEntry, but the
  // surface mounted inside the screen is the simplified single-column
  // LiteInterface instead of the desktop emulator. The compositor's
  // rasterization path captures whatever DOM is in the screen-overlay
  // content slot, so swapping children here is enough to drive the
  // bounce-light texture from the lite UI.
  let { modeReason }: LightweightEntryProps = $props();

  const screenSourceCanvasRef: ValueRef<HTMLCanvasElement | null> = { current: null };
  const screenSourceRevisionRef: ValueRef<number> = { current: 0 };
  const perfMetricsRef: ValueRef<PerfMetrics> = { current: makeEmptyPerfMetrics() };
  let debugSettings = $state<DebugSettings>(defaultDebugSettings);
  const steamMounted = $derived(!debugSettings.ecoMode && debugSettings.coffeeSteamEnabled);
  const requiredAssets = $derived(getLoadableAssets(steamMounted));

  function handleSettingsChange(next: DebugSettings): void {
    debugSettings = next;
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
        <LiteInterface />
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
