import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import IncompatibilityGate from "./IncompatibilityGate.svelte";
import { FORCE_COMPOSITOR_SESSION_KEY, stripModeFromUrl } from "./gateUrl";
import { MODE_OVERRIDE_STORAGE_KEY } from "../mode/chooseMode";

let containerElement: HTMLDivElement;
let mountedComponent: Record<string, unknown> | null = null;

beforeEach(() => {
  containerElement = document.createElement("div");
  document.body.appendChild(containerElement);
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  if (mountedComponent) {
    unmount(mountedComponent);
    mountedComponent = null;
  }
  containerElement.remove();
  vi.restoreAllMocks();
});

function renderGate(props: { reason: string; onForce: () => void }): void {
  mountedComponent = mount(IncompatibilityGate, { target: containerElement, props });
  flushSync();
}

describe("stripModeFromUrl", () => {
  it("removes mode but preserves other query params and the path", () => {
    const url = new URL("https://example.com/projects?mode=full&debug=1#anchor");
    const result = stripModeFromUrl(url);
    expect(result).toBe("/projects?debug=1#anchor");
  });

  it("returns just the path when mode was the only param", () => {
    const url = new URL("https://example.com/about?mode=lite");
    expect(stripModeFromUrl(url)).toBe("/about");
  });
});

describe("IncompatibilityGate", () => {
  it("renders the reason text and both action buttons", () => {
    renderGate({ reason: "WebGL2 unavailable", onForce: () => {} });
    expect(containerElement.textContent).toContain("WebGL2 unavailable");
    expect(containerElement.textContent).toContain("Force it anyway");
    expect(containerElement.textContent).toContain("View recommended mode instead");
  });

  it("Force button sets the session flag and fires onForce", () => {
    const onForce = vi.fn();
    renderGate({ reason: "x", onForce });
    const buttons = containerElement.querySelectorAll("button");
    (buttons[0] as HTMLButtonElement).click();
    flushSync();
    expect(window.sessionStorage.getItem(FORCE_COMPOSITOR_SESSION_KEY)).toBe("1");
    expect(onForce).toHaveBeenCalledTimes(1);
  });

  it("Recommended button clears localStorage override and navigates to a stripped URL", () => {
    window.localStorage.setItem(MODE_OVERRIDE_STORAGE_KEY, "FULL_MODE");
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "https://example.com/projects?mode=full&keep=1",
        pathname: "/projects",
        search: "?mode=full&keep=1",
        hash: "",
        assign: assignSpy,
      },
    });

    renderGate({ reason: "x", onForce: () => {} });
    const buttons = containerElement.querySelectorAll("button");
    (buttons[1] as HTMLButtonElement).click();
    flushSync();
    expect(window.localStorage.getItem(MODE_OVERRIDE_STORAGE_KEY)).toBeNull();
    expect(assignSpy).toHaveBeenCalledWith("/projects?keep=1");
  });
});
