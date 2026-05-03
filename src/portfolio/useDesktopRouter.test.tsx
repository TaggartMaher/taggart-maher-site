import { describe, expect, it } from "vitest";
import { pathForState, targetForPath } from "./useDesktopRouter";

describe("targetForPath", () => {
  it("maps the root to the readme app", () => {
    expect(targetForPath("/")).toEqual({ appId: "readme" });
  });

  it("maps /about to the about app", () => {
    expect(targetForPath("/about")).toEqual({ appId: "about" });
  });

  it("maps /projects to projects with no sub-id", () => {
    expect(targetForPath("/projects")).toEqual({ appId: "projects" });
  });

  it("maps /projects/:id to projects with sub-id", () => {
    expect(targetForPath("/projects/waybranch")).toEqual({
      appId: "projects",
      projectsSubId: "waybranch",
    });
  });

  it("maps /blog to blog with null sub-id (collapses to index)", () => {
    expect(targetForPath("/blog")).toEqual({ appId: "blog", blogSubId: null });
  });

  it("maps /blog/:id to blog with sub-id", () => {
    expect(targetForPath("/blog/the-forge")).toEqual({
      appId: "blog",
      blogSubId: "the-forge",
    });
  });

  it("maps /settings to settings", () => {
    expect(targetForPath("/settings")).toEqual({ appId: "settings" });
  });

  it("returns null for unknown paths", () => {
    expect(targetForPath("/nope")).toBeNull();
  });
});

describe("pathForState", () => {
  it("renders / when nothing is focused", () => {
    expect(
      pathForState({
        focusedAppId: null,
        projectsSelectedId: "x",
        blogSelectedId: null,
      }),
    ).toBe("/");
  });

  it("renders /about for the about app", () => {
    expect(
      pathForState({
        focusedAppId: "about",
        projectsSelectedId: "x",
        blogSelectedId: null,
      }),
    ).toBe("/about");
  });

  it("renders /projects/:id when projects is focused with a selection", () => {
    expect(
      pathForState({
        focusedAppId: "projects",
        projectsSelectedId: "waybranch",
        blogSelectedId: null,
      }),
    ).toBe("/projects/waybranch");
  });

  it("renders /blog when blog is focused with no selection", () => {
    expect(
      pathForState({
        focusedAppId: "blog",
        projectsSelectedId: "x",
        blogSelectedId: null,
      }),
    ).toBe("/blog");
  });

  it("renders /blog/:id when blog is focused with a selection", () => {
    expect(
      pathForState({
        focusedAppId: "blog",
        projectsSelectedId: "x",
        blogSelectedId: "the-forge",
      }),
    ).toBe("/blog/the-forge");
  });
});
