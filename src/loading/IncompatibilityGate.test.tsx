import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IncompatibilityGate } from "./IncompatibilityGate";
import { FORCE_COMPOSITOR_SESSION_KEY, stripModeFromUrl } from "./gateUrl";
import { MODE_OVERRIDE_STORAGE_KEY } from "../mode/chooseMode";

let containerElement: HTMLDivElement;
let reactRoot: Root;

beforeEach(() => {
  containerElement = document.createElement("div");
  document.body.appendChild(containerElement);
  reactRoot = createRoot(containerElement);
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  act(() => {
    reactRoot.unmount();
  });
  containerElement.remove();
  vi.restoreAllMocks();
});

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
    act(() => {
      reactRoot.render(<IncompatibilityGate reason="WebGL2 unavailable" onForce={() => {}} />);
    });
    expect(containerElement.textContent).toContain("WebGL2 unavailable");
    expect(containerElement.textContent).toContain("Force it anyway");
    expect(containerElement.textContent).toContain("View recommended mode instead");
  });

  it("Force button sets the session flag and fires onForce", () => {
    const onForce = vi.fn();
    act(() => {
      reactRoot.render(<IncompatibilityGate reason="x" onForce={onForce} />);
    });
    const buttons = containerElement.querySelectorAll("button");
    act(() => {
      (buttons[0] as HTMLButtonElement).click();
    });
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

    act(() => {
      reactRoot.render(<IncompatibilityGate reason="x" onForce={() => {}} />);
    });
    const buttons = containerElement.querySelectorAll("button");
    act(() => {
      (buttons[1] as HTMLButtonElement).click();
    });
    expect(window.localStorage.getItem(MODE_OVERRIDE_STORAGE_KEY)).toBeNull();
    expect(assignSpy).toHaveBeenCalledWith("/projects?keep=1");
  });
});
