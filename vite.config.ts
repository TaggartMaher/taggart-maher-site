import { readFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { renderMarkdownToHtml } from "./src/portfolio/content/renderMarkdown";

// Compiles `import content from "./index.md?html"` to a pre-rendered
// HTML string at build time. The unified/remark pipeline therefore
// never ships to the browser and no markdown is parsed at runtime —
// Markdown.svelte just injects the string.
function markdownToHtmlPlugin(): Plugin {
  const htmlQuerySuffix = "?html";
  return {
    name: "markdown-to-html",
    enforce: "pre",
    async load(id) {
      if (!id.endsWith(".md" + htmlQuerySuffix)) return null;
      const filePath = id.slice(0, -htmlQuerySuffix.length);
      this.addWatchFile(filePath);
      const markdownSource = await readFile(filePath, "utf8");
      return `export default ${JSON.stringify(renderMarkdownToHtml(markdownSource))};`;
    },
  };
}

export default defineConfig({
  plugins: [markdownToHtmlPlugin(), svelte()],
  envPrefix: ["VITE_", "CELLS_", "STEAM_"],
  server: {
    host: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
  resolve: process.env.VITEST
    ? {
        // Vitest resolves packages with Node's default conditions, which
        // would pick Svelte's server build; the tests mount components
        // into jsdom, so force the browser build.
        conditions: ["browser"],
      }
    : undefined,
});
