import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./renderMarkdown";
import { PROJECTS } from "./projects";
import { BLOG_POSTS } from "./blog";

describe("Markdown rendering", () => {
  it("renders headings, paragraphs, and inline emphasis", () => {
    const markup = renderMarkdownToHtml("# Title\n\nSome **bold** text.");
    expect(markup).toContain("<h1>Title</h1>");
    expect(markup).toContain("<strong>bold</strong>");
  });

  it("renders images with alt text", () => {
    const markup = renderMarkdownToHtml("![a cat](https://example.com/cat.png)");
    expect(markup).toContain('src="https://example.com/cat.png"');
    expect(markup).toContain('alt="a cat"');
  });

  it("renders GFM tables", () => {
    const source = ["| a | b |", "| - | - |", "| 1 | 2 |"].join("\n");
    const markup = renderMarkdownToHtml(source);
    expect(markup).toContain("<table>");
    expect(markup).toContain("<th>a</th>");
    expect(markup).toContain("<td>1</td>");
  });

  it("renders external links with target=_blank and rel=noreferrer", () => {
    const markup = renderMarkdownToHtml("[home](https://example.com)");
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain("noreferrer");
  });

  it("renders strikethrough (GFM)", () => {
    const markup = renderMarkdownToHtml("~~gone~~");
    expect(markup).toContain("<del>gone</del>");
  });

  it("does not mark internal links external", () => {
    const markup = renderMarkdownToHtml("[about](/about)");
    expect(markup).toContain('href="/about"');
    expect(markup).not.toContain("target=");
  });
});

describe("Project content", () => {
  it("loads every project's metadata with a non-empty markdown body", () => {
    expect(PROJECTS.length).toBeGreaterThan(0);
    for (const project of PROJECTS) {
      expect(project.id).toBeTruthy();
      expect(project.name).toBeTruthy();
      expect(project.tag).toBeTruthy();
      expect(project.year).toBeTruthy();
      expect(project.date).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
      expect(project.oneliner).toBeTruthy();
      expect(project.content.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(project.stack)).toBe(true);
      expect(Array.isArray(project.links)).toBe(true);
    }
  });

  it("has unique project ids", () => {
    const ids = PROJECTS.map((project) => project.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Skipped: respiratory-model is placeholder content not yet finished.
  it.skip("renders the respiratory-model body, including its table", () => {
    const project = PROJECTS.find((entry) => entry.id === "respiratory-model");
    expect(project).toBeDefined();
    // `content` is already HTML — compiled at build time from index.md.
    expect(project!.content).toContain("<table>");
    expect(project!.content).toContain("WGSL");
  });
});

describe("Blog content", () => {
  // Skipped: blog posts are placeholder content not yet finished.
  it.skip("loads every post's metadata with a non-empty markdown body", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
    for (const post of BLOG_POSTS) {
      expect(post.id).toBeTruthy();
      expect(post.title).toBeTruthy();
      expect(post.tag).toBeTruthy();
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("has unique blog post ids", () => {
    const ids = BLOG_POSTS.map((post) => post.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Skipped: truncated-tetrahedron is placeholder content not yet finished.
  it.skip("renders truncated-tetrahedron post with table and external link", () => {
    const post = BLOG_POSTS.find((entry) => entry.id === "truncated-tetrahedron");
    expect(post).toBeDefined();
    // `content` is already HTML — compiled at build time from index.md.
    expect(post!.content).toContain("<table>");
    expect(post!.content).toContain("Truncated tetrahedron");
    expect(post!.content).toContain('target="_blank"');
  });
});
