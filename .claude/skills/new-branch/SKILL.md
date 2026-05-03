---
name: new-branch
description: Create a new local git branch off a remote base branch. Use when the user asks to "create a branch", "branch off X", "make a new branch from Y", or any variant of starting fresh work from a remote ref.
---

# Creating a new branch off a remote base

## Step 1 — Resolve the remote name

The user will often say "origin" out of habit. Do NOT assume the remote is named `origin`. Run:

```bash
git remote -v
```

If there is exactly one remote, use it. If there are multiple, ask which one. In this repo the remote is named `github`.

## Step 2 — Resolve the base branch name

The user may say "master" or "main" interchangeably. Verify the base branch actually exists on the chosen remote before branching:

```bash
git ls-remote --heads <remote> <base>
```

If the requested base does not exist (e.g. user said `master` but only `main` is present, or vice versa), surface this to the user and ask which they meant — do NOT silently substitute. In this repo the default branch is `master`.

## Step 3 — Fetch, then create

Always fetch before branching so the new branch is based on the latest remote tip:

```bash
git fetch <remote>
git checkout -b <new-branch-name> <remote>/<base>
```

This single `checkout -b` form sets up tracking against `<remote>/<base>` automatically, which is fine for a fresh feature branch. If the user later pushes, they will need `git push -u <remote> <new-branch-name>` to track their own remote branch instead.

## Step 4 — Confirm

Report the branch name, the remote, and the base it was cut from. Do not push automatically.

## What NOT to do

- Do not run `git pull` on the current branch as a substitute for `git fetch` — that mutates the branch the user is leaving.
- Do not stash, reset, or discard uncommitted changes to "clean up" before branching. `git checkout -b` carries working-tree changes onto the new branch, which is usually what the user wants. If there is a real conflict, surface it.
- Do not create the branch from the local base ref (e.g. `git checkout -b foo master`) when the user asked for the remote base — the local ref may be stale.
