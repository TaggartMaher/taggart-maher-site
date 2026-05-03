import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CopyLinkButton } from "./CopyLinkButton";

let containerElement: HTMLDivElement;
let reactRoot: Root;
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
  reactRoot = createRoot(containerElement);
});

afterEach(() => {
  act(() => {
    reactRoot.unmount();
  });
  containerElement.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CopyLinkButton", () => {
  it("writes the current URL to the clipboard on click and shows feedback", async () => {
    act(() => {
      reactRoot.render(<CopyLinkButton />);
    });
    const button = containerElement.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Copy link");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(writeTextMock).toHaveBeenCalledWith(window.location.href);
    expect(button.textContent).toBe("Copied");
  });

  it("reverts the label after the timeout elapses", async () => {
    act(() => {
      reactRoot.render(<CopyLinkButton />);
    });
    const button = containerElement.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(button.textContent).toBe("Copied");
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(button.textContent).toBe("Copy link");
  });
});
