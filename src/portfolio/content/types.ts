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
  // ISO-ish date string (YYYY-MM or YYYY-MM-DD) used to sort the
  // Projects list chronologically. Year is kept separately because the
  // UI displays just the year.
  date: string;
  status?: string;
  tag: string;
  oneliner: string;
  stack: string[];
  links: ContentLink[];
  // Markdown body, loaded as a raw string by the entry's metadata.ts.
  content: string;
  // Auto-attached by the aggregator from `hero.jpg` next to this
  // metadata file. Authors should NOT set this directly — drop a
  // hero.jpg into the project directory and the aggregator wires it
  // up. Undefined when no hero image is present.
  heroImage?: string;
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
  // Auto-attached by the aggregator from `hero.jpg` next to this
  // metadata file. Authors should NOT set this directly — drop a
  // hero.jpg into the post directory and the aggregator wires it up.
  heroImage?: string;
}
