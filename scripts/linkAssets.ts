// Symlink the per-pass Blender render directories into public/composite/ so
// Vite serves them as static assets. Runs before `vite dev` and `vite build`.
//
// If BLENDER_RENDERS_DIR is unset or any pass directory is missing, this
// script prints a warning and exits successfully — the site falls back to
// the no-CGI path at runtime. It must never fail the build.

import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const passes = ["beauty", "whitelight", "position"] as const;

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const compositeDir = join(repoRoot, "public", "composite");

const blenderRendersDir = process.env.BLENDER_RENDERS_DIR;

if (!blenderRendersDir) {
  console.warn(
    "[assets] BLENDER_RENDERS_DIR is not set — skipping pass symlinks. Site will run in fallback mode.",
  );
  process.exit(0);
}

mkdirSync(compositeDir, { recursive: true });

let allPassesLinked = true;

for (const pass of passes) {
  const sourceDirectory = join(blenderRendersDir, pass);
  const targetLink = join(compositeDir, pass);

  const sourceExists = existsSync(sourceDirectory) && lstatSync(sourceDirectory).isDirectory();
  if (!sourceExists) {
    console.warn(`[assets] missing pass directory: ${sourceDirectory} — skipping`);
    allPassesLinked = false;
    continue;
  }

  if (existsSync(targetLink) || lstatSync(targetLink, { throwIfNoEntry: false })) {
    const currentStat = lstatSync(targetLink, { throwIfNoEntry: false });
    if (currentStat?.isSymbolicLink() && readlinkSync(targetLink) === sourceDirectory) {
      continue;
    }
    rmSync(targetLink, { recursive: true, force: true });
  }

  symlinkSync(sourceDirectory, targetLink, "dir");
  console.log(`[assets] linked ${pass} -> ${sourceDirectory}`);
}

if (!allPassesLinked) {
  console.warn("[assets] one or more pass directories missing — site will run in fallback mode.");
}
