# Production Considerations

Working notes for getting this site production-ready. Updated as decisions are made.

## Decisions

- **Hosting:** AWS — S3 + CloudFront (static site).
- **Domains:** `taggartmaher.com` (apex) and `blog.taggartmaher.com`.
- **Source maps:** generate but don't ship — hidden source maps only.
- **Wire compression:** Brotli with gzip fallback at the CDN edge.
- **CDN caching:** required. Cheap-to-serve under traffic spikes is an explicit goal — long-cache hashed assets, short-cache `index.html`.
- **Asset compression:** lossless only. No quality loss in any media.
- **CI:** not doing GitHub Actions yet. Deploy stays manual via `scripts/deploy.ts`.
- **Stale EXRs:** the multi-hundred-MB EXRs in `public/composite/` are debug leftovers. Real site media is <20 MB total.

## Undecided / Researching

- **Analytics:** want set-and-forget. Candidates to evaluate later: Plausible, Cloudflare Web Analytics, AWS CloudFront access-log-based, or none. Defer.
- **Error tracking:** not yet decided (Sentry vs. nothing). Tied to analytics decision.

## Open Questions

- **Repo size for media:** is it fine to commit ~20 MB worth of media files to GitHub, or should the real site assets live in S3 and be pulled at deploy time? GitHub's hard limit is 100 MB per file and warns above 50 MB; 20 MB is technically fine, but is it a smell? Worth deciding before the EXR cleanup so we don't ping-pong.
- **Which files in `public/composite/` are real vs. stale debug artifacts?** Need a list of what to keep, what to delete, what to regenerate from Blender. Drives the size cleanup.
- **Apex vs. www:** redirect `www.taggartmaher.com` → apex, or the other way? Affects CloudFront + Route 53 setup.
- **Blog subdomain shape:** is `blog.taggartmaher.com` a separate CloudFront distribution / S3 bucket, or the same SPA serving a different route? Affects routing and deploy script.

## Punch List (condensed from audit)

### Blockers

- `scripts/deploy.ts` is a TODO stub — implement S3 sync + CloudFront invalidation.
- No top-level `ErrorBoundary` in `src/main.tsx`; a shader/EXR failure currently produces a blank page.
- `src/composite/*` (~2000 LoC of GPU code) has zero tests. Add at least `decodeExr.ts` parser tests and shader-compile error-path tests.

### High

- Clean up stale debug EXRs in `public/composite/` (open question above).
- `vite.config.ts` is bare — add hidden source maps, vendor `manualChunks`, explicit minify.
- Stamp build with git SHA so prod issues correlate to commits.
- Add SEO basics to `index.html`: description, OG tags, Twitter card, canonical, favicon set, `robots.txt`, `sitemap.xml`.
- Verify `scripts/bake-textures/Cargo.lock` is committed for reproducible asset bakes.

### CloudFront / caching plan

- `index.html`: short TTL (e.g., `Cache-Control: no-cache` or 60 s) so deploys go live immediately.
- Hashed JS/CSS assets (`*.[hash].js`): `Cache-Control: public, max-age=31536000, immutable`.
- Media in `public/composite/`: long max-age + `immutable` if filenames are content-addressed; otherwise short.
- Enable Brotli + gzip at the distribution.
- Use OAC (Origin Access Control) so S3 isn't public; CloudFront is the only reader.

### Medium

- Add fetch timeout + abort to `src/loading/loadAsset.ts`; the loading screen already has a fallback CTA — just wire it.
- Device-detection unsupported warning on the loading screen needs to distinguish a real mobile device from a desktop browser whose window just happens to be in a vertical aspect ratio. Current check conflates the two; a desktop user resizing narrow shouldn't see the "device not supported" message.
- A11y: `src/portfolio/Portfolio.tsx:452, 491–492` — interactive `<div onClick>`s need `role`/keyboard handlers.
- Gate ~9 `console.warn` calls behind `import.meta.env.DEV`.
- Add CSP headers via CloudFront response-headers policy once the third-party list is finalized (currently just Google Fonts).

### Low

- `optimize-ideas.md` is feature ideas, not perf — separate track.
- TypeScript is strict, ESLint is clean, no XSS surface — these are already fine.
