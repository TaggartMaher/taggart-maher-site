import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import FallbackEntry from "../entries/FallbackEntry.svelte";

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

function renderAt(path: string): void {
  window.history.replaceState({}, "", path);
  mountedComponent = mount(FallbackEntry, {
    target: containerElement,
    props: { modeReason: { mode: "FALLBACK_MODE", source: "auto", detail: "test" } },
  });
  flushSync();
}

describe("LiteInterface routes", () => {
  // Skipped: home page copy is placeholder content not yet finished.
  it.skip("renders the home page at /", () => {
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

  // Skipped: project detail content is placeholder, not yet finished.
  it.skip("renders a project detail at /projects/:id", () => {
    renderAt("/projects/waybranch");
    expect(containerElement.textContent).toContain("Stack");
  });

  it("renders the blog index at /blog", () => {
    renderAt("/blog");
    expect(containerElement.textContent).toContain("Blog");
  });

  // Skipped: blog post content is placeholder, not yet finished.
  it.skip("renders a blog post at /blog/:id", () => {
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
