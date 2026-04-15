---
"@urban/dotai": patch
---

Fix the recently reported TypeScript regressions caused by stricter optional-property and override checks.

Preserve exact optional-property handling when rendering workflow output, normalizing git sources, parsing lockfiles, and building update results so `bun run check` passes cleanly again.
