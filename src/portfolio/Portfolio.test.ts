import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PortfolioTestHarness from "./PortfolioTestHarness.svelte";

let containerElement: HTMLDivElement;
let mountedComponent: Record<string, unknown> | null = null;

beforeEach(() => {
  // jsdom has no ResizeObserver; the Portfolio uses one to track its
  // container size.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  window.history.replaceState({}, "", "/");
  containerElement = document.createElement("div");
  document.body.appendChild(containerElement);
});

afterEach(() => {
  if (mountedComponent) {
    unmount(mountedComponent);
    mountedComponent = null;
  }
  containerElement.remove();
  vi.unstubAllGlobals();
});

describe("Portfolio", () => {
  it("renders the desktop chrome with branding, taskbar, and section icons", () => {
    mountedComponent = mount(PortfolioTestHarness, { target: containerElement });
    flushSync();
    const text = containerElement.textContent ?? "";

    // Taskbar branding and section icons identify the desktop shell.
    expect(text).toContain("tm-portfolio");
    expect(text).toContain("About Me");
    expect(text).toContain("Experience");
    expect(text).toContain("Projects");
    expect(text).toContain("Blog");
    expect(text).toContain("Mystery");
    expect(text).toContain("README.md");
    expect(text).toContain("Contact");
    expect(text).toContain("ECO MODE");
    expect(text).toContain("Site Settings");
  });
});
