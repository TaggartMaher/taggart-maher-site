import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "../router/Router";
import { ModeProvider } from "../mode/ModeContext";
import { LiteInterface } from "./LiteInterface";

let containerElement: HTMLDivElement;
let reactRoot: Root;

beforeEach(() => {
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

function renderAt(path: string): void {
  window.history.replaceState({}, "", path);
  act(() => {
    reactRoot.render(
      <ModeProvider modeReason={{ mode: "FALLBACK_MODE", source: "auto", detail: "test" }}>
        <Router>
          <LiteInterface />
        </Router>
      </ModeProvider>,
    );
  });
}

describe("LiteInterface routes", () => {
  it("renders the home page at /", () => {
    renderAt("/");
    expect(containerElement.textContent).toContain("tm-portfolio");
  });

  it("renders the about page at /about", () => {
    renderAt("/about");
    expect(containerElement.textContent).toContain("Fact sheet");
  });

  it("renders the projects index at /projects", () => {
    renderAt("/projects");
    expect(containerElement.textContent).toContain("Projects");
  });

  it("renders a project detail at /projects/:id", () => {
    renderAt("/projects/waybranch");
    expect(containerElement.textContent).toContain("Stack");
  });

  it("renders the blog index at /blog", () => {
    renderAt("/blog");
    expect(containerElement.textContent).toContain("Blog");
  });

  it("renders a blog post at /blog/:id", () => {
    renderAt("/blog/the-forge");
    expect(containerElement.textContent).toContain("Copy link");
  });

  it("renders the settings page at /settings", () => {
    renderAt("/settings");
    expect(containerElement.textContent).toContain("Site Settings");
  });

  it("renders not-found for unknown paths", () => {
    renderAt("/no-such-page");
    expect(containerElement.textContent).toContain("Not found");
  });
});
