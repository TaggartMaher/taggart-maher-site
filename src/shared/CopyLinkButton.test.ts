import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import CopyLinkButton from "./CopyLinkButton.svelte";

let containerElement: HTMLDivElement;
let mountedComponent: Record<string, unknown> | null = null;
let writeTextMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });
  containerElement = document.createElement("div");
  document.body.appendChild(containerElement);
});

afterEach(() => {
  if (mountedComponent) {
    unmount(mountedComponent);
    mountedComponent = null;
  }
  containerElement.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderButton(): HTMLButtonElement {
  mountedComponent = mount(CopyLinkButton, { target: containerElement });
  flushSync();
  return containerElement.querySelector("button") as HTMLButtonElement;
}

describe("CopyLinkButton", () => {
  it("writes the current URL to the clipboard on click and shows feedback", async () => {
    const button = renderButton();
    expect(button.textContent).toBe("Copy link");
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
    expect(writeTextMock).toHaveBeenCalledWith(window.location.href);
    expect(button.textContent).toBe("Copied");
  });

  it("reverts the label after the timeout elapses", async () => {
    const button = renderButton();
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
    expect(button.textContent).toBe("Copied");
    vi.advanceTimersByTime(2100);
    flushSync();
    expect(button.textContent).toBe("Copy link");
  });
});
