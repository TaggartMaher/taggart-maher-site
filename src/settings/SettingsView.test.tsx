import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsView } from "./SettingsView";
import { ModeProvider } from "../mode/ModeContext";

describe("SettingsView", () => {
  it("renders the device table, current mode card, and the two other-mode cards", () => {
    const markup = renderToStaticMarkup(
      <ModeProvider modeReason={{ mode: "FULL_MODE", source: "auto", detail: "desktop" }}>
        <SettingsView />
      </ModeProvider>,
    );
    expect(markup).toContain("Site Settings");
    expect(markup).toContain("viewport");
    expect(markup).toContain("WebGL2");
    expect(markup).toContain("Full mode");
    expect(markup).toContain("Lightweight mode");
    expect(markup).toContain("Fallback mode");
  });

  it("shows the compositor warning on the other-mode cards when current mode is FALLBACK", () => {
    const markup = renderToStaticMarkup(
      <ModeProvider modeReason={{ mode: "FALLBACK_MODE", source: "auto", detail: "no webgl2" }}>
        <SettingsView />
      </ModeProvider>,
    );
    expect(markup).toContain("real-time 3D scene");
  });

  it("does not show the compositor warning when current mode is already a compositor mode", () => {
    const markup = renderToStaticMarkup(
      <ModeProvider modeReason={{ mode: "FULL_MODE", source: "auto", detail: "ok" }}>
        <SettingsView />
      </ModeProvider>,
    );
    expect(markup).not.toContain("real-time 3D scene");
  });
});
