import { useRef, useState } from "react";
import "./composite/compositor.css";
import { Compositor } from "./composite/Compositor";
import { makeEmptyPerfMetrics } from "./composite/perfMetrics";
import { ScreenOverlay } from "./composite/ScreenOverlay";
import { SteamCompositor } from "./composite/SteamCompositor";
import { DebugMenu } from "./debug/DebugMenu";
import { defaultDebugSettings, type DebugSettings } from "./debug/debugSettings";

export function App() {
  const screenSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const perfMetricsRef = useRef(makeEmptyPerfMetrics());
  const [debugSettings, setDebugSettings] = useState<DebugSettings>(defaultDebugSettings);

  return (
    <>
      <Compositor
        screenSourceCanvasRef={screenSourceCanvasRef}
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
      />
      <SteamCompositor
        screenSourceCanvasRef={screenSourceCanvasRef}
        enabled={debugSettings.coffeeSteamEnabled}
        intensity={debugSettings.coffeeSteamIntensity}
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
    </>
  );
}
