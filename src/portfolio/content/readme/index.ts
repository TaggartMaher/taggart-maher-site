// Loads the homepage README markdown as a raw string. Imported by both
// the desktop ReadmeApp and the lite HomePage so they render identical
// content.

import readmeMarkdown from "./index.md?raw";

export const README_MARKDOWN: string = readmeMarkdown;
