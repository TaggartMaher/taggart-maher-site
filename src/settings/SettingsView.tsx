import { useMemo } from "react";
import {
  abbreviateUserAgent,
  getDevicePixelRatio,
  getHostname,
  getPointerKind,
  getTouchPoints,
  getUserAgent,
  getViewportSize,
  getWebGL2Support,
} from "../mode/deviceInfo";
import { MODE_OVERRIDE_STORAGE_KEY, type Mode } from "../mode/chooseMode";
import { useModeReason } from "../mode/useMode";
import "./settings.css";

const MODE_LABEL: Record<Mode, string> = {
  FULL_MODE: "Full",
  LIGHTWEIGHT_MODE: "Lightweight",
  FALLBACK_MODE: "Fallback",
};

const MODE_DESCRIPTION: Record<Mode, string> = {
  FULL_MODE:
    "The compositor renders a 3D Blender Cycles scene at runtime. Inside the simulated screen, a desktop-emulator UI lets you open multiple windows and read content as if it were on a real computer. Best with a mouse and a landscape display.",
  LIGHTWEIGHT_MODE:
    "Same compositor scene as Full mode, but the screen contains a simplified single-column reading interface designed for touch. Use this if you like the visual scene but find the desktop emulator awkward.",
  FALLBACK_MODE:
    "Just the content. No 3D, no scene, no compositor. Loads fast on any device and works without WebGL2.",
};

const COMPOSITOR_PERFORMANCE_WARNING =
  "This mode renders a real-time 3D scene. It has high performance demand and may consume additional network and power.";

interface DeviceSnapshot {
  viewport: { widthInPixels: number; heightInPixels: number };
  devicePixelRatio: number;
  pointerKind: string;
  touchPoints: number;
  webgl2Supported: boolean;
  webgl2MissingExtensions: string[];
  hostname: string;
  userAgentLabel: string;
}

function readDeviceSnapshot(): DeviceSnapshot {
  const viewport = getViewportSize();
  const webgl2 = getWebGL2Support();
  return {
    viewport,
    devicePixelRatio: getDevicePixelRatio(),
    pointerKind: getPointerKind(),
    touchPoints: getTouchPoints(),
    webgl2Supported: webgl2.supported,
    webgl2MissingExtensions: webgl2.missingExtensions,
    hostname: getHostname() || "—",
    userAgentLabel: abbreviateUserAgent(getUserAgent()),
  };
}

type Verdict = "green" | "amber" | "red";

interface CompatibilityVerdict {
  level: Verdict;
  message: string;
}

function computeVerdict(snapshot: DeviceSnapshot): CompatibilityVerdict {
  if (!snapshot.webgl2Supported) {
    return { level: "red", message: "This device cannot run the compositor" };
  }
  const isSmallViewport =
    snapshot.viewport.widthInPixels < 900 || snapshot.viewport.heightInPixels < 600;
  const isTouchOnly = snapshot.pointerKind === "coarse" || snapshot.touchPoints > 0;
  if (isSmallViewport || isTouchOnly) {
    return {
      level: "amber",
      message: "Compositor will run, but display is small or touch-only",
    };
  }
  return { level: "green", message: "Compatible with all modes" };
}

function describeModeSource(source: string, detail: string): string {
  if (source === "query") return `Selected via ?mode= URL parameter (${detail}).`;
  if (source === "storage")
    return `Saved choice from a previous visit (${detail}). Use "Use auto-detection" below to clear this.`;
  return `Auto-detected: ${detail}.`;
}

function switchToMode(mode: Mode): void {
  const aliasMap: Record<Mode, string> = {
    FULL_MODE: "full",
    LIGHTWEIGHT_MODE: "lightweight",
    FALLBACK_MODE: "fallback",
  };
  const targetUrl = `${window.location.pathname}?mode=${aliasMap[mode]}`;
  window.location.assign(targetUrl);
}

function clearOverrideAndReload(): void {
  try {
    window.localStorage.removeItem(MODE_OVERRIDE_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.location.assign("/settings");
}

export function SettingsView() {
  const modeReason = useModeReason();
  const snapshot = useMemo(readDeviceSnapshot, []);
  const verdict = useMemo(() => computeVerdict(snapshot), [snapshot]);

  const otherModes = (["FULL_MODE", "LIGHTWEIGHT_MODE", "FALLBACK_MODE"] as Mode[]).filter(
    (mode) => mode !== modeReason.mode,
  );

  return (
    <div className="settings-view">
      <header className="settings-header">
        <h1 className="serif">Site Settings</h1>
        <p className="settings-lede">
          This site has three rendering modes. You can switch between them at any time. The right
          choice depends on your device and what you want to see.
        </p>
      </header>

      <section className="settings-section">
        <h2 className="serif">Your device</h2>
        <table className="settings-kv">
          <tbody>
            <tr>
              <th className="mono">viewport</th>
              <td>
                {snapshot.viewport.widthInPixels} × {snapshot.viewport.heightInPixels}
              </td>
            </tr>
            <tr>
              <th className="mono">device pixel ratio</th>
              <td>{snapshot.devicePixelRatio.toFixed(2)}</td>
            </tr>
            <tr>
              <th className="mono">pointer</th>
              <td>{snapshot.pointerKind}</td>
            </tr>
            <tr>
              <th className="mono">touch points</th>
              <td>{snapshot.touchPoints}</td>
            </tr>
            <tr>
              <th className="mono">WebGL2</th>
              <td>
                {snapshot.webgl2Supported ? "yes" : "no"}
                {snapshot.webgl2MissingExtensions.length > 0
                  ? ` — missing: ${snapshot.webgl2MissingExtensions.join(", ")}`
                  : ""}
              </td>
            </tr>
            <tr>
              <th className="mono">hostname</th>
              <td>{snapshot.hostname}</td>
            </tr>
            <tr>
              <th className="mono">browser</th>
              <td>{snapshot.userAgentLabel}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="settings-section">
        <h2 className="serif">Compatibility</h2>
        <div className={"settings-verdict settings-verdict-" + verdict.level}>
          {verdict.message}
        </div>
      </section>

      <section className="settings-section">
        <h2 className="serif">Current mode</h2>
        <div className="settings-current-card">
          <div className="settings-mode-name serif">{MODE_LABEL[modeReason.mode]} mode</div>
          <p>{MODE_DESCRIPTION[modeReason.mode]}</p>
          <div className="settings-source mono">
            {describeModeSource(modeReason.source, modeReason.detail)}
          </div>
          {modeReason.source !== "auto" && (
            <button
              type="button"
              className="settings-reset-button mono"
              onClick={clearOverrideAndReload}
            >
              Use auto-detection
            </button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2 className="serif settings-other-modes-heading">Other modes</h2>
        <div className="settings-other-grid">
          {otherModes.map((mode) => {
            const inFallbackNow = modeReason.mode === "FALLBACK_MODE";
            const showWarning = inFallbackNow && mode !== "FALLBACK_MODE";
            return (
              <div key={mode} className="settings-other-card">
                <div className="settings-mode-name serif">{MODE_LABEL[mode]} mode</div>
                <p>{MODE_DESCRIPTION[mode]}</p>
                {showWarning && (
                  <p className="settings-warning">{COMPOSITOR_PERFORMANCE_WARNING}</p>
                )}
                <button
                  type="button"
                  className="settings-switch-button mono"
                  onClick={() => switchToMode(mode)}
                >
                  Switch to this mode
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
