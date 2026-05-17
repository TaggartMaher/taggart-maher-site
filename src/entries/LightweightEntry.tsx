import { useMemo, useRef, useState } from "react";
import "../composite/compositor.css";
import { Compositor } from "../composite/Compositor";
import { makeEmptyPerfMetrics } from "../composite/perfMetrics";
import { ScreenOverlay } from "../composite/ScreenOverlay";
import { SteamCompositor } from "../composite/SteamCompositor";
import { getLoadableAssets } from "../config";
import { DebugMenu } from "../debug/DebugMenu";
import { defaultDebugSettings, type DebugSettings } from "../debug/debugSettings";
import { LiteInterface } from "../lite/LiteInterface";
import { CompositorBoot } from "../loading/CompositorBoot";
import { ModeProvider } from "../mode/ModeContext";
import { Router } from "../router/Router";
import type { ModeReason } from "../mode/chooseMode";
import { ExitToNormalButton } from "../shared/ExitToNormalButton";

interface LightweightEntryProps {
  modeReason: ModeReason;
}

// LIGHTWEIGHT_MODE: same compositor scene as FullEntry, but the
// surface mounted inside the screen is the simplified single-column
// LiteInterface instead of the desktop emulator. The compositor's
// rasterization path captures whatever DOM is in the screen-overlay
// content slot, so swapping children here is enough to drive the
// bounce-light texture from the lite UI.
export function LightweightEntry({ modeReason }: LightweightEntryProps) {
  const screenSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenSourceRevisionRef = useRef(0);
  const perfMetricsRef = useRef(makeEmptyPerfMetrics());
  const [debugSettings, setDebugSettings] = useState<DebugSettings>(defaultDebugSettings);
  const steamMounted = !debugSettings.ecoMode && debugSettings.coffeeSteamEnabled;
  const requiredAssets = useMemo(() => getLoadableAssets(steamMounted), [steamMounted]);

  return (
    <ModeProvider modeReason={modeReason}>
      <Router>
        <ExitToNormalButton />
        <CompositorBoot modeReason={modeReason} requiredAssets={requiredAssets}>
          <Compositor
            screenSourceCanvasRef={screenSourceCanvasRef}
            screenSourceRevisionRef={screenSourceRevisionRef}
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
            perfMetricsRef={perfMetricsRef}
          />
          <ScreenOverlay
            settings={debugSettings}
            onSettingsChange={setDebugSettings}
            textureCanvasRef={screenSourceCanvasRef}
            textureRevisionRef={screenSourceRevisionRef}
            perfMetricsRef={perfMetricsRef}
          >
            <LiteInterface />
          </ScreenOverlay>
          {steamMounted && (
            <SteamCompositor
              screenSourceCanvasRef={screenSourceCanvasRef}
              screenSourceRevisionRef={screenSourceRevisionRef}
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
          )}
          <DebugMenu
            settings={debugSettings}
            onChange={setDebugSettings}
            perfMetricsRef={perfMetricsRef}
          />
        </CompositorBoot>
      </Router>
    </ModeProvider>
  );
}
