import { describe, expect, it } from "vitest";
import { matchRoute } from "./matchRoute";

describe("matchRoute", () => {
  it("matches a literal path", () => {
    expect(matchRoute("/about", "/about")).toEqual({ params: {} });
  });

  it("normalizes trailing slashes", () => {
    expect(matchRoute("/about", "/about/")).toEqual({ params: {} });
    expect(matchRoute("/about/", "/about")).toEqual({ params: {} });
  });

  it("matches the root", () => {
    expect(matchRoute("/", "/")).toEqual({ params: {} });
  });

  it("returns null when segment counts differ", () => {
    expect(matchRoute("/about", "/about/me")).toBeNull();
    expect(matchRoute("/about/me", "/about")).toBeNull();
  });

  it("captures a single :param", () => {
    expect(matchRoute("/projects/:id", "/projects/waybranch")).toEqual({
      params: { id: "waybranch" },
    });
  });

  it("captures multiple :params", () => {
    expect(matchRoute("/blog/:year/:slug", "/blog/2025/hello")).toEqual({
      params: { year: "2025", slug: "hello" },
    });
  });

  it("decodes uri-encoded params", () => {
    expect(matchRoute("/projects/:id", "/projects/cold%20glass")).toEqual({
      params: { id: "cold glass" },
    });
  });

  it("returns null when literal segments differ", () => {
    expect(matchRoute("/blog/:id", "/projects/foo")).toBeNull();
  });
});
