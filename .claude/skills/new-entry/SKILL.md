---
name: new-entry
description: Scaffold a new project or blog post directory under src/portfolio/content. Use when the user says "new project", "new blog post", "add a project", "scaffold a blog entry", or any variant of starting a fresh content entry.
---

# Scaffold a new project or blog entry

The site auto-discovers content from directories under
`src/portfolio/content/projects/` and `src/portfolio/content/blog/`.
Each directory contains:

- `metadata.ts` — typed default export (`ProjectMetadata` or
  `BlogMetadata`)
- `index.md` — the prose body, loaded as a raw string
- `hero.jpg` — optional hero image; auto-attached if present, no
  config needed

Set `draft: true` on the metadata to keep an entry in the repo while
hiding it from the site (the aggregator filters drafts out).

The aggregators in each section's `index.ts` use `import.meta.glob`
to discover everything; the **only** thing controlling display order
is the `date` field (sorted descending). You do not need to edit
any index file.

## Step 1 — Ask the user which kind of entry

If not already obvious from their request, ask:

- Project (something built) or blog post (something written)?

## Step 2 — Ask the user for entry-specific fields

Use **one** AskUserQuestion call with multiple sub-questions where
possible. Field requirements:

### Project

| Field      | Type             | Notes                                                                      |
| ---------- | ---------------- | -------------------------------------------------------------------------- |
| `id`       | kebab            | Becomes the directory name. Must be unique vs. existing dirs.              |
| `name`     | string           | Display name.                                                              |
| `year`     | string           | Display year, e.g. `"2026"`.                                               |
| `date`     | YYYY-MM          | Drives chronological sort. Newer dates appear higher in the Projects list. |
| `tag`      | string           | Short category tag, e.g. `"VFX · Blender · WGSL"`.                         |
| `oneliner` | string           | One-sentence summary shown above the body.                                 |
| `stack`    | string[]         | Comma-split list of tech.                                                  |
| `links`    | label/href pairs | Outbound links. Empty array is valid.                                      |
| `status`   | optional         | If supplied (e.g. `"Upcoming"`), shown as a pill on the card.              |

### Blog

| Field      | Type       | Notes                                                                  |
| ---------- | ---------- | ---------------------------------------------------------------------- |
| `id`       | kebab      | Becomes the directory name. Must be unique vs. existing dirs.          |
| `title`    | string     | Display title.                                                         |
| `year`     | string     | Display year.                                                          |
| `date`     | YYYY-MM-DD | Drives chronological sort. Newer dates appear higher in the Blog list. |
| `tag`      | string     | Category tag, e.g. `"Engineering"`.                                    |
| `excerpt`  | string     | Short summary shown on the index card.                                 |
| `readtime` | string     | E.g. `"6 min"`.                                                        |
| `icon`     | optional   | Emoji prefix for the post tag chip.                                    |
| `links`    | optional   | label/href pairs.                                                      |

If the user offers freeform answers, accept them and infer the rest
where reasonable (e.g. derive `id` from `name`/`title` by
kebab-casing). Confirm any inferred values with the user before
writing files.

## Step 3 — Verify the date slots in correctly

Read every existing `metadata.ts` in the target section and surface
the resulting sorted list to the user with the new entry inserted at
its date-derived position. Ask them to confirm the slot is correct
before writing — if not, they can adjust the date.

For projects: `src/portfolio/content/projects/*/metadata.ts`
For blog: `src/portfolio/content/blog/*/metadata.ts`

## Step 4 — Verify the directory does not already exist

```bash
ls src/portfolio/content/<section>/<id>
```

If the directory exists, surface that and ask the user whether to
pick a different id or overwrite.

## Step 5 — Write the two required files

Write `metadata.ts` and `index.md` under
`src/portfolio/content/<section>/<id>/`. **Do not** include a
`heroImage` field — the aggregator attaches it automatically when a
`hero.jpg` is present in the same directory. Tell the user where to
drop the hero image, but do not attempt to create one yourself.

### Project `metadata.ts` template

```ts
import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "<id>",
  name: "<name>",
  year: "<year>",
  date: "<YYYY-MM>",
  tag: "<tag>",
  oneliner: "<oneliner>",
  stack: ["<tech1>", "<tech2>"],
  links: [{ label: "<label>", href: "<href>" }],
  content,
};

export default metadata;
```

If `status` was supplied, include it after `date`. If `links` is
empty, use `links: [],`.

### Blog `metadata.ts` template

```ts
import type { BlogMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: BlogMetadata = {
  id: "<id>",
  title: "<title>",
  year: "<year>",
  date: "<YYYY-MM-DD>",
  tag: "<tag>",
  excerpt: "<excerpt>",
  readtime: "<readtime>",
  content,
};

export default metadata;
```

If `icon` or `links` were supplied, include them.

### `index.md` template

```markdown
# <name or title>

[ Body content goes here. Standard markdown — headings, lists, links,
images, code blocks. Internal links starting with `/` route through
the in-app router. ]
```

Leave the body as a brief stub the user can fill in unless they
gave you content to drop in directly.

## Step 6 — Run the formatter and tests

```bash
./format.sh && ./test.sh
```

Both must pass. The aggregator picks the new entry up automatically
on the next dev-server reload — no other files need editing.

## Step 7 — Confirm with the user

Report:

- Path to the directory you created
- Where to drop `hero.jpg` (same directory; ~1200×630 ideally for
  social-card aspect)
- The chronological position the entry will appear in
- Any TODO fields the user should fill in (placeholder content,
  links, etc.)

## What NOT to do

- Do not edit `src/portfolio/content/<section>/index.ts` — the
  aggregator is auto-discovering and sorting; manual edits would
  duplicate or override that.
- Do not author a `heroImage` field on the metadata — it is attached
  by the aggregator from `hero.jpg` if present.
- Do not generate a placeholder hero image. Missing `hero.jpg`
  resolves to `undefined` and the UI falls back to the striped
  placeholder cleanly.
- Do not skip the date validation step. Wrong dates produce wrong
  ordering, which is the whole point of this scaffolding flow.
