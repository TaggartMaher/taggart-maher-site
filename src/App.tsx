import { useRef, useState } from "react";
import "./composite/compositor.css";
import { Compositor } from "./composite/Compositor";
import { ScreenOverlay } from "./composite/ScreenOverlay";
import { DebugMenu } from "./debug/DebugMenu";
import { defaultDebugSettings, type DebugSettings } from "./debug/debugSettings";

export function App() {
  const screenSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [debugSettings, setDebugSettings] = useState<DebugSettings>(defaultDebugSettings);

  return (
    <>
      <Compositor
        screenSourceCanvasRef={screenSourceCanvasRef}
        freezeFirstFrame={debugSettings.freezeFirstFrame}
        screenBlurRadiusPx={debugSettings.screenBlurRadiusPx}
      />
      <ScreenOverlay
        settings={debugSettings}
        onSettingsChange={setDebugSettings}
        textureCanvasRef={screenSourceCanvasRef}
      />
      <DebugMenu settings={debugSettings} onChange={setDebugSettings} />
    </>
  );
}
