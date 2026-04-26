import { useEffect, useState } from "react";
import { testImages } from "../composite/testImages";
import type { DebugSettings } from "./debugSettings";
import "./debugMenu.css";

interface DebugMenuProps {
  settings: DebugSettings;
  onChange: (next: DebugSettings) => void;
}

export function DebugMenu({ settings, onChange }: DebugMenuProps) {
  const [open, setOpen] = useState(false);

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
          <select
            className="debug-menu-control"
            value={settings.imageBackgroundUrl}
            onChange={(event) => onChange({ ...settings, imageBackgroundUrl: event.target.value })}
          >
            {testImages.map((image) => (
              <option key={image.url} value={image.url}>
                {image.label}
              </option>
            ))}
          </select>
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
          <input
            className="debug-menu-control"
            type="color"
            value={settings.squareColor}
            onChange={(event) => onChange({ ...settings, squareColor: event.target.value })}
          />
        )}
      </section>

      <footer className="debug-menu-footer">` to toggle</footer>
    </div>
  );
}
