import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "./Router";
import { useRouter } from "./useRouter";
import { Link } from "./Link";

let containerElement: HTMLDivElement;
let reactRoot: Root;

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  containerElement = document.createElement("div");
  document.body.appendChild(containerElement);
  reactRoot = createRoot(containerElement);
});

afterEach(() => {
  act(() => {
    reactRoot.unmount();
  });
  containerElement.remove();
});

function CurrentPath() {
  const { path } = useRouter();
  return <span data-testid="path">{path}</span>;
}

describe("Router", () => {
  it("starts with the current document path", () => {
    window.history.replaceState({}, "", "/about");
    act(() => {
      reactRoot.render(
        <Router>
          <CurrentPath />
        </Router>,
      );
    });
    expect(containerElement.querySelector("[data-testid='path']")?.textContent).toBe("/about");
  });

  it("Link click pushes a new history entry and updates path", () => {
    act(() => {
      reactRoot.render(
        <Router>
          <CurrentPath />
          <Link to="/blog">Blog</Link>
        </Router>,
      );
    });
    const anchor = containerElement.querySelector("a") as HTMLAnchorElement;
    act(() => {
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(window.location.pathname).toBe("/blog");
    expect(containerElement.querySelector("[data-testid='path']")?.textContent).toBe("/blog");
  });

  it("Link with cmd-key falls through to default browser behavior", () => {
    act(() => {
      reactRoot.render(
        <Router>
          <CurrentPath />
          <Link to="/blog">Blog</Link>
        </Router>,
      );
    });
    const anchor = containerElement.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    act(() => {
      anchor.dispatchEvent(event);
    });
    // No preventDefault should be called, and our state should not update.
    expect(window.location.pathname).toBe("/");
  });

  it("popstate updates the path", () => {
    act(() => {
      reactRoot.render(
        <Router>
          <CurrentPath />
        </Router>,
      );
    });
    window.history.pushState({}, "", "/projects");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(containerElement.querySelector("[data-testid='path']")?.textContent).toBe("/projects");
  });
});
