// Shared metadata types for markdown-backed content. Each project /
// blog entry lives in its own directory: a `metadata.ts` file exports
// the typed object below, and the prose lives in a sibling `index.md`
// compiled to HTML at build time via the `?html` query (see the
// markdown-to-html plugin in vite.config.ts).

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
  // Body prose: HTML rendered at build time from the entry's index.md.
  content: string;
  // Auto-attached by the aggregator from `hero.jpg` next to this
  // metadata file. Authors should NOT set this directly — drop a
  // hero.jpg into the project directory and the aggregator wires it
  // up. Undefined when no hero image is present.
  heroImage?: string;
  // When true, the aggregator skips this entry entirely so it does
  // not appear in the Projects window or via /projects/<id>. Use this
  // for placeholder / not-yet-finished entries that should stay in
  // the repo but be hidden from the site until they're ready.
  draft?: boolean;
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
  // When true, the aggregator skips this post so it does not appear
  // in the Blog window or via /blog/<id>. For drafts and
  // placeholders that should stay in the repo but stay off the site.
  draft?: boolean;
}
