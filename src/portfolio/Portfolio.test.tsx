import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Portfolio } from "./Portfolio";
import { Router } from "../router/Router";

describe("Portfolio", () => {
  it("renders the desktop chrome with branding, taskbar, and section icons", () => {
    const markup = renderToStaticMarkup(
      <Router>
        <Portfolio ecoMode={false} onToggleEcoMode={() => {}} />
      </Router>,
    );

    // Taskbar branding and section icons identify the desktop shell.
    expect(markup).toContain("tm-portfolio");
    expect(markup).toContain("About Me");
    expect(markup).toContain("Experience");
    expect(markup).toContain("Projects");
    expect(markup).toContain("Blog");
    expect(markup).toContain("Mystery");
    expect(markup).toContain("README.md");
    expect(markup).toContain("Contact");
    expect(markup).toContain("ECO MODE");
    expect(markup).toContain("Site Settings");
  });
});
