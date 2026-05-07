// Aggregator for all blog posts. Each post is a directory next to
// this file containing a `metadata.ts` (with the typed default export)
// and an `index.md` (markdown body). An optional `hero.jpg` next to
// the metadata is auto-attached as the post's hero image — missing
// files just resolve to `undefined`.
//
// Order is derived from the `date` field on each metadata object,
// newest first. Drop a new directory in and it slots in automatically.

import type { BlogMetadata } from "../types";

interface BlogModule {
  default: BlogMetadata;
}

const metadataModules = import.meta.glob<BlogModule>("./*/metadata.ts", { eager: true });
const heroImageModules = import.meta.glob<string>("./*/hero.jpg", {
  eager: true,
  query: "?url",
  import: "default",
});

const heroImageByDir: Record<string, string> = {};
for (const [path, url] of Object.entries(heroImageModules)) {
  const match = path.match(/^\.\/([^/]+)\/hero\.jpg$/);
  if (match) heroImageByDir[match[1]] = url;
}

export const BLOG_POSTS: BlogMetadata[] = Object.entries(metadataModules)
  .map(([path, mod]) => {
    const directoryMatch = path.match(/^\.\/([^/]+)\/metadata\.ts$/);
    const directoryName = directoryMatch ? directoryMatch[1] : null;
    const heroImage = directoryName ? heroImageByDir[directoryName] : undefined;
    return { ...mod.default, heroImage };
  })
  .filter((post) => !post.draft)
  .sort((a, b) => b.date.localeCompare(a.date));
