// Shared metadata types for markdown-backed content. Each project /
// blog entry lives in its own directory: a `metadata.ts` file exports
// the typed object below, and the prose lives in a sibling `index.md`
// loaded via Vite's `?raw` query.

export interface ContentLink {
  label: string;
  href: string;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  year: string;
  status?: string;
  tag: string;
  icon: string;
  oneliner: string;
  stack: string[];
  links: ContentLink[];
  // Markdown body, loaded as a raw string by the entry's metadata.ts.
  content: string;
}

export interface BlogMetadata {
  id: string;
  title: string;
  year: string;
  // ISO date for sortable / displayable post date. Year is kept
  // separately because the existing UI shows just the year alongside
  // the read-time chip.
  date: string;
  tag: string;
  icon?: string;
  excerpt: string;
  readtime: string;
  links?: ContentLink[];
  content: string;
}
