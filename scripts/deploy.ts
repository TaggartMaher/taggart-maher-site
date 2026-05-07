// Deploys dist/ to S3 and invalidates CloudFront. Run via `pnpm deploy`.
//
// Cache-Control strategy (set at upload time, honored by CloudFront's
// CachingOptimized policy):
//   - dist/assets/*  → 1y immutable (Vite hashes these)
//   - dist/index.html → 60s
//   - everything else → 1d
//
// Hashed asset versions are not deleted from S3 — clients mid-session may
// still need an old chunk. Periodic cleanup is out of scope here.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const BUCKET = "taggartmaher-com";
const DISTRIBUTION_ID = "E1MGHH06ERTWGT";
const REGION = "us-east-1";

const skipBuild = process.argv.includes("--skip-build");
const skipInvalidation = process.argv.includes("--skip-invalidation");

function run(command: string, args: string[]): void {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!skipBuild) {
  console.log("→ pnpm build");
  run("pnpm", ["build"]);
}

if (!existsSync("dist/index.html")) {
  console.error("dist/index.html missing — run `pnpm build` first.");
  process.exit(1);
}

console.log("→ sync hashed assets (1y immutable)");
run("aws", [
  "s3",
  "sync",
  "dist/assets/",
  `s3://${BUCKET}/assets/`,
  "--cache-control",
  "public, max-age=31536000, immutable",
  "--region",
  REGION,
]);

console.log("→ sync everything except assets/ and index.html (1d)");
run("aws", [
  "s3",
  "sync",
  "dist/",
  `s3://${BUCKET}/`,
  "--exclude",
  "index.html",
  "--exclude",
  "assets/*",
  "--cache-control",
  "public, max-age=86400",
  "--region",
  REGION,
]);

console.log("→ upload index.html (60s)");
run("aws", [
  "s3",
  "cp",
  "dist/index.html",
  `s3://${BUCKET}/index.html`,
  "--cache-control",
  "public, max-age=60",
  "--content-type",
  "text/html; charset=utf-8",
  "--region",
  REGION,
]);

if (!skipInvalidation) {
  console.log("→ CloudFront invalidation");
  run("aws", [
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    DISTRIBUTION_ID,
    "--paths",
    "/*",
  ]);
}

console.log("✓ deploy done");
