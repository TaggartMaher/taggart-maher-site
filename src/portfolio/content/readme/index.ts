// Loads the homepage README, pre-rendered to HTML at build time.
// Imported by both the desktop ReadmeApp and the lite HomePage so they
// render identical content.

import readmeHtml from "./index.md?html";

export const README_HTML: string = readmeHtml;
