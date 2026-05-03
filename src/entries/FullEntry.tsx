import { useRef, useState } from "react";
import "../composite/compositor.css";
import { Compositor } from "../composite/Compositor";
import { makeEmptyPerfMetrics } from "../composite/perfMetrics";
import { ScreenOverlay } from "../composite/ScreenOverlay";
import { SteamCompositor } from "../composite/SteamCompositor";
import { DebugMenu } from "../debug/DebugMenu";
import { defaultDebugSettings, type DebugSettings } from "../debug/debugSettings";
import { Portfolio } from "../portfolio/Portfolio";
import { ModeProvider } from "../mode/ModeContext";
import { Router } from "../router/Router";
import type { ModeReason } from "../mode/chooseMode";

interface FullEntryProps {
  modeReason: ModeReason;
}

export function FullEntry({ modeReason }: FullEntryProps) {
  const screenSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Monotonic counter incremented by ScreenOverlay whenever it repaints
  // the screen-content canvas. The compositors read this and skip the
  // texImage2D upload when their last-seen value matches — saving an
  // RGBA upload per frame whenever nothing on the screen changed.
  const screenSourceRevisionRef = useRef(0);
  const perfMetricsRef = useRef(makeEmptyPerfMetrics());
  const [debugSettings, setDebugSettings] = useState<DebugSettings>(defaultDebugSettings);

  return (
    <ModeProvider modeReason={modeReason}>
      <Router>
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
          perfMetricsRef={perfMetricsRef}
        />
        <ScreenOverlay
          settings={debugSettings}
          onSettingsChange={setDebugSettings}
          textureCanvasRef={screenSourceCanvasRef}
          textureRevisionRef={screenSourceRevisionRef}
          perfMetricsRef={perfMetricsRef}
        >
          <Portfolio />
        </ScreenOverlay>
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
        <DebugMenu
          settings={debugSettings}
          onChange={setDebugSettings}
          perfMetricsRef={perfMetricsRef}
        />
      </Router>
    </ModeProvider>
  );
}
