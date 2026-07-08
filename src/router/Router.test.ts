import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import RouterTestHarness from "./RouterTestHarness.svelte";

let containerElement: HTMLDivElement;
let mountedComponent: Record<string, unknown> | null = null;

beforeEach(() => {
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
});

function renderHarness(): void {
  mountedComponent = mount(RouterTestHarness, { target: containerElement });
  flushSync();
}

function readRenderedPath(): string | undefined {
  return containerElement.querySelector("[data-testid='path']")?.textContent ?? undefined;
}

describe("Router", () => {
  it("starts with the current document path", () => {
    window.history.replaceState({}, "", "/about");
    renderHarness();
    expect(readRenderedPath()).toBe("/about");
  });

  it("Link click pushes a new history entry and updates path", () => {
    renderHarness();
    const anchor = containerElement.querySelector("a") as HTMLAnchorElement;
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    flushSync();
    expect(window.location.pathname).toBe("/blog");
    expect(readRenderedPath()).toBe("/blog");
  });

  it("Link with cmd-key falls through to default browser behavior", () => {
    renderHarness();
    const anchor = containerElement.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    anchor.dispatchEvent(event);
    flushSync();
    // No preventDefault should be called, and our state should not update.
    expect(window.location.pathname).toBe("/");
  });

  it("popstate updates the path", () => {
    renderHarness();
    window.history.pushState({}, "", "/projects");
    window.dispatchEvent(new PopStateEvent("popstate"));
    flushSync();
    expect(readRenderedPath()).toBe("/projects");
  });
});
