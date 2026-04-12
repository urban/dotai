# dotai

`dotai` is a CLI for agent skill management. It helps you discover, install, update, and remove reusable skills so teams can share them consistently across projects.

It can discover skills from local directories or git-backed sources, install them into local or global `.agents/skills` directories, record provenance in a lock file, and later update or uninstall what was installed.

## What it does

- discovers skills from a source repo or directory
- installs selected skills plus dependency skills
- hides `internal` helper skills from normal operator prompts
- records install provenance in `dotai-lock.json`
- updates installed skills from their recorded sources
- supports local installs and `--global` installs

## Skill format

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter:

```md
---
name: alpha
description: Example skill
metadata:
  dependencies:
    - helper
  internal: false
---
```

`dotai` searches the source root, `skills/`, `skills/.curated/`, `skills/.experimental/`, `skills/.system/`, and `.agents/skills/`.

## CLI

In a repo checkout:

```sh
bun install
bun run src/cli/main.ts --help
```

When installed as a package, the binary name is `dotai`.

Examples:

```sh
dotai skills list
dotai skills discover ./skills-source
dotai skills install ./skills-source alpha beta
dotai skills update
dotai skills uninstall alpha
dotai skills list --global
```

If `install`, `update`, or `uninstall` is run without a skill name, `dotai` prompts for a selection.

Supported source locators include:

- local paths
- `file://` URLs
- `github:owner/repo[#ref]`
- `gitlab:owner/repo[#ref]`
- SSH and git repository URLs

Git must be available for git-backed sources.

## Files it manages

- local skills: `.agents/skills/`
- local lock file: `dotai-lock.json`
- global skills: `~/.agents/skills/`
- global lock file: `~/.agents/.dotai-lock.json`

## Development

```sh
bun install
bun run check
```
