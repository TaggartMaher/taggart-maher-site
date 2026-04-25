import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Portfolio } from "./Portfolio";

describe("Portfolio", () => {
  it("renders the headline, all three section headings, and a contact link", () => {
    const markup = renderToStaticMarkup(<Portfolio />);

    expect(markup).toContain("Taggart Maher");
    expect(markup).toContain(">About<");
    expect(markup).toContain(">Projects<");
    expect(markup).toContain(">Contact<");
    expect(markup).toContain("mailto:taggart.maher@gmail.com");
  });
});
