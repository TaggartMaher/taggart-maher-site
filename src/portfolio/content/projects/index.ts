// Aggregator for all project entries. Each project is a directory
// next to this file containing a `metadata.ts` (with the typed default
// export) and an `index.md` (markdown body). An optional `hero.jpg`
// next to the metadata is auto-attached as the project's hero image —
// missing files just resolve to `undefined`.
//
// Order is derived from the `date` field on each metadata object,
// newest first. Drop a new directory in and it slots in automatically.

import type { ProjectMetadata } from "../types";

interface ProjectModule {
  default: ProjectMetadata;
}

const metadataModules = import.meta.glob<ProjectModule>("./*/metadata.ts", { eager: true });
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

export const PROJECTS: ProjectMetadata[] = Object.entries(metadataModules)
  .map(([path, mod]) => {
    const directoryMatch = path.match(/^\.\/([^/]+)\/metadata\.ts$/);
    const directoryName = directoryMatch ? directoryMatch[1] : null;
    const heroImage = directoryName ? heroImageByDir[directoryName] : undefined;
    return { ...mod.default, heroImage };
  })
  .filter((project) => !project.draft)
  .sort((a, b) => b.date.localeCompare(a.date));
