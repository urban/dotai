---
"@urban/dotai": patch
---

Add a Bun shebang to the CLI entrypoint so the linked `dotai` binary runs correctly from `PATH` instead of being interpreted as a shell script.

Declare Bun as a runtime requirement in the package metadata and document local `bun link` / `PATH` usage in the README so the supported CLI execution model is explicit.

Preserve resolved local source paths without canonicalizing them through `realpath` so lockfile entries, rendered errors, and discovery results stay stable on macOS temp directories that alias `/var` to `/private/var`.
