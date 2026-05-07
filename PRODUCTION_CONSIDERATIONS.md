# Production Considerations

Working notes for getting this site production-ready. Updated as decisions are made.

## Decisions

- **Hosting:** AWS — S3 + CloudFront (static site).
- **Domains:** `taggartmaher.com` (apex) and `blog.taggartmaher.com`.
- **Canonical host:** apex. `www.taggartmaher.com` 301-redirects to `taggartmaher.com`.
- **Blog routing:** `blog.taggartmaher.com` is served by the same SPA, route-based (one distribution, one bucket; SPA branches on host).
- **Media storage:** committed to the GitHub repo. ~20 MB is under GitHub's warn threshold; keeps deploys dumb (no separate asset fetch step).
- **Source maps:** generate but don't ship — hidden source maps only.
- **Wire compression:** Brotli with gzip fallback at the CDN edge.
- **CDN caching:** required. Cheap-to-serve under traffic spikes is an explicit goal — long-cache hashed assets, short-cache `index.html`.
- **Asset compression:** lossless only. No quality loss in any media.
- **CI:** not doing GitHub Actions yet. Deploy stays manual via `scripts/deploy.ts`.

## Deferred to post-launch

Decisions intentionally pushed past launch; revisit once the site is live.

- **Analytics:** deferred.
- **Error tracking:** deferred.

## Open Questions

_(none currently.)_

## Punch List (condensed from audit)

### Blockers

- `scripts/deploy.ts` is a TODO stub — implement S3 sync + CloudFront invalidation.
- No top-level `ErrorBoundary` in `src/main.tsx`; a shader/EXR failure currently produces a blank page.
- `src/composite/*` (~2000 LoC of GPU code) has zero tests. Add at least `decodeExr.ts` parser tests and shader-compile error-path tests.

### High

- `vite.config.ts` has only Vitest config — no `build` block (no source maps, no `manualChunks`, no explicit minify) and no `define` for git SHA injection.
- Stamp build with git SHA so prod issues correlate to commits.
- Add SEO basics to `index.html`: `robots.txt`, `sitemap.xml`. (Favicon set, `<meta name="description">`, canonical, OG tags, and Twitter card are wired. Favicon assets: `public/favicon.svg`, `favicon.ico`, `favicon-{16,32}x{16,32}.png`, `apple-touch-icon.png`. Social preview: `public/og-image.png` 1200×630, with `social-image.png` 2555×1329 retained as the unscaled source.)
- Verify `scripts/bake-textures/Cargo.lock` is committed for reproducible asset bakes.
- Content-hash `public/composite/` media at build time so it can ship with `immutable` long-cache headers. Requires a build step that renames files and rewrites references in the manifest + loader.

### CloudFront / caching plan

- `index.html`: `Cache-Control: public, max-age=60`. Deploys go live within 60 s; CloudFront invalidation can cut that to immediate.
- Hashed JS/CSS assets (`*.[hash].js`): `Cache-Control: public, max-age=31536000, immutable`.
- Media in `public/composite/`: `Cache-Control: public, max-age=31536000, immutable` after the asset pipeline content-hashes filenames (see High punch-list item).
- Enable Brotli + gzip at the distribution.
- Use OAC (Origin Access Control) so S3 isn't public; CloudFront is the only reader.
- SPA deep-link fallback: configure CloudFront to serve `/index.html` (status 200) for 404s on non-asset paths so client-side routes (`/blog/...`, deep links into the portfolio) resolve. Either a custom error response or a CloudFront Function on viewer-request.

### Medium

- Add fetch timeout + abort to `src/loading/loadAsset.ts`; the loading screen already has a fallback CTA — just wire it.
- Device-detection unsupported warning on the loading screen needs to distinguish a real mobile device from a desktop browser whose window just happens to be in a vertical aspect ratio. Current check conflates the two; a desktop user resizing narrow shouldn't see the "device not supported" message.
- A11y: interactive `<div onClick>`s need `role`/keyboard handlers — `src/portfolio/Portfolio.tsx:515` (welcome-hint dismiss) and `src/portfolio/Portfolio.tsx:554` (launcher backdrop).
- Markdown-rendered images (`src/portfolio/content/Markdown.tsx`) don't enforce/default an `alt` attribute; author content without alt text will ship inaccessible. Either lint markdown sources or default `alt=""` for decorative.
- Gate 11 `console.warn` calls behind `import.meta.env.DEV` — `Compositor.tsx` (3), `SteamCompositor.tsx` (5), `ScreenOverlay.tsx` (1), `CopyLinkButton.tsx` (2).
- Add CSP headers via CloudFront response-headers policy once the third-party list is finalized (currently just Google Fonts).

### Low

- `optimize-ideas.md` is feature ideas, not perf — separate track.
- TypeScript is strict, ESLint is clean, no XSS surface — these are already fine.
