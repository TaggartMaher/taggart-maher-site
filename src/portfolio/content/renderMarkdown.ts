import type { Element, Root } from "hast";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export function isInternalHref(href: string | null): href is string {
  return typeof href === "string" && href.startsWith("/");
}

function isHttpHref(href: unknown): href is string {
  return typeof href === "string" && /^https?:\/\//i.test(href);
}

// External http(s) links open in a new tab, mirroring the anchor
// component the react-markdown version injected. Internal "/route"
// links are left untouched here; the Markdown component intercepts
// their clicks at runtime via a delegated listener.
function rehypeExternalLinksOpenInNewTab() {
  function visit(node: Root | Element): void {
    if (node.type === "element" && node.tagName === "a" && isHttpHref(node.properties.href)) {
      node.properties.target = "_blank";
      node.properties.rel = "noreferrer noopener";
    }
    for (const child of node.children) {
      if (child.type === "element") visit(child);
    }
  }
  return visit;
}

// Same pipeline react-markdown ran internally (remark-parse + remark-gfm
// + remark-rehype), but rendered to an HTML string instead of React
// elements. GFM gives us tables, autolinks, strikethrough, and task
// lists. Raw HTML in the markdown is dropped, matching react-markdown's
// default behavior.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeExternalLinksOpenInNewTab)
  .use(rehypeStringify);

export function renderMarkdownToHtml(source: string): string {
  return String(processor.processSync(source));
}
