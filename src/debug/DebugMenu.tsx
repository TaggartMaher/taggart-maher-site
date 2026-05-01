import { useEffect, useState } from "react";
import type { PerfMetrics } from "../composite/perfMetrics";
import { testImages } from "../composite/testImages";
import type { DebugSettings } from "./debugSettings";
import "./debugMenu.css";

interface DebugMenuProps {
  settings: DebugSettings;
  onChange: (next: DebugSettings) => void;
  // Live perf snapshot mutated by the compositor each frame. The menu
  // polls it on its own cadence (only while open) so the high-frequency
  // updates don't drive React renders elsewhere.
  perfMetricsRef: React.RefObject<PerfMetrics>;
}

export function DebugMenu({ settings, onChange, perfMetricsRef }: DebugMenuProps) {
  const [open, setOpen] = useState(false);
  const [perfTick, setPerfTick] = useState(0);

  // Poll the perf ref ~5 Hz while the menu is open. Closed → no timer,
  // no readouts, no incidental work.
  useEffect(() => {
    if (!open) return;
    const intervalId = window.setInterval(() => setPerfTick((tick) => tick + 1), 200);
    return () => window.clearInterval(intervalId);
  }, [open]);

  useEffect(() => {
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
      setOpen((wasOpen) => !wasOpen);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!open) return null;

  // Touch perfTick so the linter doesn't strip the state read; the value
  // itself isn't used — re-running this render is the whole point.
  void perfTick;
  const perf = perfMetricsRef.current;
  const formatFps = (value: number): string => (value > 0 ? value.toFixed(1) : "—");
  const formatMs = (value: number | null): string =>
    value === null ? "n/a" : value > 0 ? `${value.toFixed(2)} ms` : "—";

  return (
    <div className="debug-menu" role="dialog" aria-label="Debug menu">
      <header className="debug-menu-header">
        <span>Debug</span>
        <button
          type="button"
          className="debug-menu-close"
          onClick={() => setOpen(false)}
          aria-label="Close debug menu"
        >
          ×
        </button>
      </header>

      <section className="debug-menu-section">
        <label className="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.hidePageOverlay}
            onChange={(event) => onChange({ ...settings, hidePageOverlay: event.target.checked })}
          />
          <span>Hide page overlay</span>
        </label>
        <label className="debug-menu-row">
          <span>Screen blur ({settings.screenBlurRadiusPx}px)</span>
          <input
            className="debug-menu-control"
            type="range"
            min={0}
            max={512}
            step={1}
            value={settings.screenBlurRadiusPx}
            onChange={(event) =>
              onChange({ ...settings, screenBlurRadiusPx: Number(event.target.value) })
            }
          />
        </label>
        <label className="debug-menu-row">
          <span>U stretch ({settings.uStretch.toFixed(2)})</span>
          <input
            className="debug-menu-control"
            type="range"
            min={0.5}
            max={1.5}
            step={0.01}
            value={settings.uStretch}
            onChange={(event) => onChange({ ...settings, uStretch: Number(event.target.value) })}
          />
        </label>
        <label className="debug-menu-row">
          <span>V stretch ({settings.vStretch.toFixed(2)})</span>
          <input
            className="debug-menu-control"
            type="range"
            min={0.5}
            max={1.5}
            step={0.01}
            value={settings.vStretch}
            onChange={(event) => onChange({ ...settings, vStretch: Number(event.target.value) })}
          />
        </label>
        <label className="debug-menu-row">
          <span>U offset ({settings.uOffset.toFixed(2)})</span>
          <input
            className="debug-menu-control"
            type="range"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={settings.uOffset}
            onChange={(event) => onChange({ ...settings, uOffset: Number(event.target.value) })}
          />
        </label>
        <label className="debug-menu-row">
          <span>V offset ({settings.vOffset.toFixed(2)})</span>
          <input
            className="debug-menu-control"
            type="range"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={settings.vOffset}
            onChange={(event) => onChange({ ...settings, vOffset: Number(event.target.value) })}
          />
        </label>
        <label className="debug-menu-row">
          <span>Edge cutoff ({settings.edgeCutoff.toFixed(2)})</span>
          <input
            className="debug-menu-control"
            type="range"
            min={0}
            max={0.25}
            step={0.005}
            value={settings.edgeCutoff}
            onChange={(event) => onChange({ ...settings, edgeCutoff: Number(event.target.value) })}
          />
        </label>
        <label className="debug-menu-row">
          <span>Saturation ({settings.screenSaturation.toFixed(2)})</span>
          <input
            className="debug-menu-control"
            type="range"
            min={0}
            max={3}
            step={0.01}
            value={settings.screenSaturation}
            onChange={(event) =>
              onChange({ ...settings, screenSaturation: Number(event.target.value) })
            }
          />
        </label>
        <label className="debug-menu-row">
          <span>Contrast ({settings.screenContrast.toFixed(2)})</span>
          <input
            className="debug-menu-control"
            type="range"
            min={0}
            max={3}
            step={0.01}
            value={settings.screenContrast}
            onChange={(event) =>
              onChange({ ...settings, screenContrast: Number(event.target.value) })
            }
          />
        </label>
        <label className="debug-menu-row">
          <span>Brightness ({settings.screenBrightness.toFixed(2)})</span>
          <input
            className="debug-menu-control"
            type="range"
            min={0}
            max={3}
            step={0.01}
            value={settings.screenBrightness}
            onChange={(event) =>
              onChange({ ...settings, screenBrightness: Number(event.target.value) })
            }
          />
        </label>
      </section>

      <section className="debug-menu-section">
        <label className="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.imageBackgroundEnabled}
            onChange={(event) =>
              onChange({ ...settings, imageBackgroundEnabled: event.target.checked })
            }
          />
          <span>Image background</span>
        </label>
        {settings.imageBackgroundEnabled && (
          <>
            <select
              className="debug-menu-control"
              value={settings.imageBackgroundUrl}
              onChange={(event) =>
                onChange({ ...settings, imageBackgroundUrl: event.target.value })
              }
            >
              {testImages.map((image) => (
                <option key={image.url} value={image.url}>
                  {image.label}
                </option>
              ))}
            </select>
            <label className="debug-menu-row">
              <input
                type="checkbox"
                checked={settings.hideImageOverlay}
                onChange={(event) =>
                  onChange({ ...settings, hideImageOverlay: event.target.checked })
                }
              />
              <span>Hide image overlay</span>
            </label>
          </>
        )}
      </section>

      <section className="debug-menu-section">
        <label className="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.colorBackgroundEnabled}
            onChange={(event) =>
              onChange({ ...settings, colorBackgroundEnabled: event.target.checked })
            }
          />
          <span>Color background</span>
        </label>
        {settings.colorBackgroundEnabled && (
          <input
            className="debug-menu-control"
            type="color"
            value={settings.colorBackgroundColor}
            onChange={(event) =>
              onChange({ ...settings, colorBackgroundColor: event.target.value })
            }
          />
        )}
      </section>

      <section className="debug-menu-section">
        <label className="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.squareEnabled}
            onChange={(event) => onChange({ ...settings, squareEnabled: event.target.checked })}
          />
          <span>Draggable square</span>
        </label>
        {settings.squareEnabled && (
          <>
            <input
              className="debug-menu-control"
              type="color"
              value={settings.squareColor}
              onChange={(event) => onChange({ ...settings, squareColor: event.target.value })}
            />
            <label className="debug-menu-row">
              <input
                type="checkbox"
                checked={settings.hideSquareOverlay}
                onChange={(event) =>
                  onChange({ ...settings, hideSquareOverlay: event.target.checked })
                }
              />
              <span>Hide square overlay</span>
            </label>
          </>
        )}
      </section>

      <section className="debug-menu-section">
        <label className="debug-menu-row">
          <input
            type="checkbox"
            checked={settings.coffeeSteamEnabled}
            onChange={(event) =>
              onChange({ ...settings, coffeeSteamEnabled: event.target.checked })
            }
          />
          <span>Coffee steam</span>
        </label>
        {settings.coffeeSteamEnabled && (
          <>
            <label className="debug-menu-row">
              <span>Steam intensity ({settings.coffeeSteamIntensity.toFixed(2)})</span>
              <input
                className="debug-menu-control"
                type="range"
                min={0}
                max={3}
                step={0.01}
                value={settings.coffeeSteamIntensity}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    coffeeSteamIntensity: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="debug-menu-row">
              <span>Steam max ({settings.coffeeSteamMaxIntensity.toFixed(2)})</span>
              <input
                className="debug-menu-control"
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={settings.coffeeSteamMaxIntensity}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    coffeeSteamMaxIntensity: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="debug-menu-row">
              <span>Steam screen blur ({settings.coffeeSteamScreenBlurRadiusPx}px)</span>
              <input
                className="debug-menu-control"
                type="range"
                min={0}
                max={512}
                step={1}
                value={settings.coffeeSteamScreenBlurRadiusPx}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    coffeeSteamScreenBlurRadiusPx: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="debug-menu-row">
              <input
                type="checkbox"
                checked={settings.coffeeSteamFramePaused}
                onChange={(event) =>
                  onChange({ ...settings, coffeeSteamFramePaused: event.target.checked })
                }
              />
              <span>Pause steam playback</span>
            </label>
            <label className="debug-menu-row">
              <input
                type="checkbox"
                checked={settings.coffeeSteamFrameOverride !== null}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    coffeeSteamFrameOverride: event.target.checked
                      ? (settings.coffeeSteamFrameOverride ?? 0)
                      : null,
                  })
                }
              />
              <span>Override frame</span>
            </label>
            {settings.coffeeSteamFrameOverride !== null && (
              <label className="debug-menu-row">
                <span>Frame ({settings.coffeeSteamFrameOverride})</span>
                <input
                  className="debug-menu-control"
                  type="range"
                  min={0}
                  max={95}
                  step={1}
                  value={settings.coffeeSteamFrameOverride}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      coffeeSteamFrameOverride: Number(event.target.value),
                    })
                  }
                />
              </label>
            )}
            <label className="debug-menu-row">
              <input
                type="checkbox"
                checked={settings.coffeeSteamShowAtlas}
                onChange={(event) =>
                  onChange({ ...settings, coffeeSteamShowAtlas: event.target.checked })
                }
              />
              <span>Show atlas (debug)</span>
            </label>
          </>
        )}
      </section>

      <section className="debug-menu-section">
        <div className="debug-menu-row">
          <span>Display FPS</span>
          <span>{formatFps(perf.displayFps)}</span>
        </div>
        <div className="debug-menu-row">
          <span>CPU / frame</span>
          <span>{formatMs(perf.cpuFrameMs)}</span>
        </div>
        <div className="debug-menu-row">
          <span>GPU / frame</span>
          <span>{formatMs(perf.gpuFrameMs)}</span>
        </div>
      </section>

      <footer className="debug-menu-footer">` to toggle</footer>
    </div>
  );
}
