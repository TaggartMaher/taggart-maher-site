# Taggart Maher's developer site

A production grade portfolio site for displaying information about myself in a professional context.


## Coding style
Do not abbreviate variable names ever. for example, use "index" instead of "i".
Readability is most important.
Do not add abstractions without telling the user, do not add optimizations or abstractions that are not specifically requested. You may suggest optimizations, but do not implement them yourself without considering the user's thoughts.

## Workflow
After any code change, run `./format.sh` and `./test.sh` from the repo root. Both must pass before a change is considered done.

Tests should be added intentionally as features develop — not as an afterthought, not blanket coverage. Every change must leave all lints and tests passing.

### Software Versions
- Blender 5.1.0