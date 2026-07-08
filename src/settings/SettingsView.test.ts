import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import SettingsViewTestHarness from "./SettingsViewTestHarness.svelte";
import type { ModeReason } from "../mode/chooseMode";

let containerElement: HTMLDivElement;
let mountedComponent: Record<string, unknown> | null = null;

beforeEach(() => {
  containerElement = document.createElement("div");
  document.body.appendChild(containerElement);
});

afterEach(() => {
  if (mountedComponent) {
    unmount(mountedComponent);
    mountedComponent = null;
  }
  containerElement.remove();
});

function renderSettings(modeReason: ModeReason): string {
  mountedComponent = mount(SettingsViewTestHarness, {
    target: containerElement,
    props: { modeReason },
  });
  flushSync();
  return containerElement.textContent ?? "";
}

describe("SettingsView", () => {
  it("renders the device table, current mode card, and the two other-mode cards", () => {
    const text = renderSettings({ mode: "FULL_MODE", source: "auto", detail: "desktop" });
    expect(text).toContain("Site Settings");
    expect(text).toContain("viewport");
    expect(text).toContain("WebGL2");
    expect(text).toContain("Full mode");
    expect(text).toContain("Lightweight mode");
    expect(text).toContain("Fallback mode");
  });

  it("shows the compositor warning on the other-mode cards when current mode is FALLBACK", () => {
    const text = renderSettings({ mode: "FALLBACK_MODE", source: "auto", detail: "no webgl2" });
    expect(text).toContain("real-time 3D scene");
  });

  it("does not show the compositor warning when current mode is already a compositor mode", () => {
    const text = renderSettings({ mode: "FULL_MODE", source: "auto", detail: "ok" });
    expect(text).not.toContain("real-time 3D scene");
  });
});
