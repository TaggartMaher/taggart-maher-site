import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import CompositorBootTestHarness from "./CompositorBootTestHarness.svelte";
import { FORCE_COMPOSITOR_SESSION_KEY } from "./gateUrl";
import { loadingTracker } from "./LoadingTracker";
import type { ModeReason } from "../mode/chooseMode";

function markEveryRegisteredAssetDone(): void {
  const snapshot = loadingTracker.getSnapshot();
  for (const asset of snapshot.assets) {
    loadingTracker.reportDone(asset.url);
  }
}

function dispatchOpacityTransitionEnd(target: Element): void {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "opacity" });
  target.dispatchEvent(event);
}

let containerElement: HTMLDivElement;
let mountedComponent: Record<string, unknown> | null = null;

interface Environment {
  webgl2Available: boolean;
  matchMediaMatches: boolean;
}

let environment: Environment;

beforeEach(() => {
  containerElement = document.createElement("div");
  document.body.appendChild(containerElement);
  loadingTracker.reset();
  window.sessionStorage.clear();

  environment = { webgl2Available: true, matchMediaMatches: false };

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((type: string) => {
    if (type === "webgl2" && environment.webgl2Available) {
      return { getExtension: () => ({}) } as unknown as WebGL2RenderingContext;
    }
    return null;
  });

  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    return {
      matches: environment.matchMediaMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  });
});

afterEach(() => {
  if (mountedComponent) {
    unmount(mountedComponent);
    mountedComponent = null;
  }
  containerElement.remove();
  vi.restoreAllMocks();
});

const autoFullMode: ModeReason = { mode: "FULL_MODE", source: "auto", detail: "test" };
const queryFullMode: ModeReason = { mode: "FULL_MODE", source: "query", detail: "?mode= override" };

function renderBoot(modeReason: ModeReason): void {
  mountedComponent = mount(CompositorBootTestHarness, {
    target: containerElement,
    props: { modeReason },
  });
  flushSync();
}

describe("CompositorBoot — gate decision matrix", () => {
  it("auto mode skips the gate even if compatibility re-check would fail", () => {
    environment.webgl2Available = false;
    renderBoot(autoFullMode);
    expect(containerElement.textContent).not.toContain("Force it anyway");
    // Children mount during loading.
    expect(containerElement.querySelector("[data-testid='children']")).not.toBeNull();
  });

  it("forced mode on a compatible device skips the gate", () => {
    renderBoot(queryFullMode);
    expect(containerElement.textContent).not.toContain("Force it anyway");
  });

  it("forced mode on an incompatible device shows the gate", () => {
    environment.webgl2Available = false;
    renderBoot(queryFullMode);
    expect(containerElement.textContent).toContain("Force it anyway");
    expect(containerElement.querySelector("[data-testid='children']")).toBeNull();
  });

  it("session forceCompositor flag bypasses the gate even when forced + incompatible", () => {
    environment.webgl2Available = false;
    window.sessionStorage.setItem(FORCE_COMPOSITOR_SESSION_KEY, "1");
    renderBoot(queryFullMode);
    expect(containerElement.textContent).not.toContain("Force it anyway");
  });
});

describe("CompositorBoot — loading lifecycle", () => {
  it("renders the loading overlay alongside children during the loading phase", () => {
    renderBoot(autoFullMode);
    expect(containerElement.textContent).toContain("tm-portfolio");
    expect(containerElement.querySelector(".loading-overlay")).not.toBeNull();
  });

  it("holds the completed screen for a beat before fading", () => {
    vi.useFakeTimers();
    try {
      renderBoot(autoFullMode);
      markEveryRegisteredAssetDone();
      loadingTracker.markFirstFrame();
      flushSync();
      const overlay = containerElement.querySelector(".loading-overlay") as HTMLElement | null;
      expect(overlay).not.toBeNull();
      // Still visible immediately after ready; the linger delay has not yet elapsed.
      expect(overlay?.dataset.state).toBe("visible");
      vi.advanceTimersByTime(1000);
      flushSync();
      expect(overlay?.dataset.state).toBe("fading");
    } finally {
      vi.useRealTimers();
    }
  });

  it("unmounts the overlay after the opacity transition ends", () => {
    vi.useFakeTimers();
    try {
      renderBoot(autoFullMode);
      markEveryRegisteredAssetDone();
      loadingTracker.markFirstFrame();
      flushSync();
      vi.advanceTimersByTime(1000);
      flushSync();
      const overlay = containerElement.querySelector(".loading-overlay");
      expect(overlay).not.toBeNull();
      dispatchOpacityTransitionEnd(overlay!);
      flushSync();
      expect(containerElement.querySelector(".loading-overlay")).toBeNull();
      expect(containerElement.querySelector("[data-testid='children']")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
