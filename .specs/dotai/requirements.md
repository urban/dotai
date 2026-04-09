---
name: dotai-requirements
created_at: 2026-04-07T18:47:30Z
updated_at: 2026-04-07T22:35:56Z
generated_by:
  root_skill: specification-authoring
  producing_skill: requirements
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - requirements
    - write-requirements
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - requirements
    document-traceability: []
    artifact-naming: []
    requirements:
      - write-requirements
    write-requirements: []
source_artifacts:
  charter: .specs/dotai/charter.md
  user_stories: .specs/dotai/user-stories.md
---

## Functional Requirements

- FR1.1: The product shall resolve skill lifecycle operations against the current working directory by default and shall switch the target to the home-directory Agent location only when the operator passes `--global`.
  - Story traceability: Target Selection and Discovery / Inspect installed skills for the current project; Target Selection and Discovery / Apply skill workflows to the home-directory target with `--global`
- FR1.2: The product shall provide an operator-visible list workflow that shows the skills currently installed for the resolved local or global target.
  - Story traceability: Target Selection and Discovery / Inspect installed skills for the current project; Target Selection and Discovery / Apply skill workflows to the home-directory target with `--global`
- FR1.3: The product shall provide an operator-visible discovery workflow for explicit sources so an operator can inspect discoverable skills from a specified local, GitHub-hosted, or git-based source before installing them, and it shall not rely on any bundled default source.
  - Story traceability: Target Selection and Discovery / Inspect discoverable skills from an explicit source
- FR1.4: The product shall hide skills from operator-facing discovery and install-selection surfaces when their `SKILL.md` frontmatter sets `metadata.internal: true`.
  - Story traceability: Target Selection and Discovery / Hide internal skills from operator-facing discovery
- FR1.5: The product shall allow hidden internal skills to be installed when they are required to satisfy dependency resolution for a directly selected skill.
  - Story traceability: Installation and Dependency Resolution / Resolve same-source named dependencies automatically
- FR1.6: The product shall install one or more operator-selected skills from an explicit supported source into the resolved target skills directory without requiring manual directory copying.
  - Story traceability: Installation and Dependency Resolution / Install selected skills from an explicit source
- FR1.7: When an installed skill declares `metadata.dependencies` entries as skill names, the product shall resolve those names against the active source and install the referenced skills as same-source dependencies.
  - Story traceability: Installation and Dependency Resolution / Resolve same-source named dependencies automatically
- FR1.8: When an installed skill declares `metadata.dependencies` entries as explicit URLs, the product shall resolve and install the dependency skills referenced by those URLs as part of the same install workflow.
  - Story traceability: Installation and Dependency Resolution / Resolve URL-based dependencies automatically
- FR1.9: When dependency resolution fails because a named dependency is missing or a URL-based dependency cannot be fetched or interpreted, the product shall report the failing dependency and source problem clearly and shall not report the blocked install as successful.
  - Story traceability: Installation and Dependency Resolution / See clear install failures when dependencies cannot be resolved
- FR1.10: After a successful install and after every later remove or update operation that changes the installed skill set, the product shall write and maintain a normal lock file with a versioned schema for the resolved target.
  - Story traceability: Lock File and Lifecycle State / Persist installed-skill state in a lock file with a versioned schema; Removal and Refresh / Remove a skill and refresh dependency relationships; Removal and Refresh / Update installed skills from recorded source provenance
- FR1.11: The product shall record each installed skill in the lock file with enough provenance and dependency information to support later list, remove, update, and dependency-reconciliation workflows.
  - Story traceability: Lock File and Lifecycle State / Persist installed-skill state in a lock file with a versioned schema
- FR1.12: When an operator explicitly installs a skill that is already present only as an implicit dependency, the product shall preserve the installed skill and convert its lifecycle state to a direct install.
  - Story traceability: Lock File and Lifecycle State / Promote an implicit dependency to a direct install when explicitly chosen later
- FR1.13: When a directly installed skill later becomes required by other installed skills, the product shall keep that skill in the direct-install state while updating its dependency relationship tracking.
  - Story traceability: Lock File and Lifecycle State / Keep a directly installed skill direct when other skills begin depending on it
- FR1.14: The product shall prevent removal of an installed skill when other installed skills still require it, shall report the blocking dependent skills, and shall leave the installed files plus lock-file state unchanged.
  - Story traceability: Removal and Refresh / Prevent removals that would break remaining installed skills
- FR1.15: When a skill is removed successfully, the product shall delete the installed skill from the resolved target and update lock-file dependency relationships for remaining skills, including any implicit skills that no longer have dependents.
  - Story traceability: Removal and Refresh / Remove a skill and refresh dependency relationships; Lock File and Lifecycle State / Identify orphaned implicit dependencies as prune candidates
- FR1.16: The product shall provide an update workflow that refreshes installed skills from the provenance recorded for those skills in the lock file rather than from any bundled catalog.
  - Story traceability: Removal and Refresh / Update installed skills from recorded source provenance
- FR1.17: The update workflow shall support both full refresh with `dotai skills update` and selective refresh with `dotai skills update [skill-name ...]`.
  - Story traceability: Removal and Refresh / Update installed skills from recorded source provenance
- FR1.18: When an update cannot refresh an installed skill because its recorded file path or URL is no longer valid or reachable, the product shall identify the failing skill and recorded source clearly.
  - Story traceability: Removal and Refresh / See clear update failures when a recorded source cannot be refreshed
- FR1.19: When dependency resolution encounters a cycle across same-source named dependencies, URL-based dependencies, or a mix of both, the product shall treat the cycle as a hard error, report the dependency path that forms the cycle, and leave installed files plus lock-file state unchanged.
  - Story traceability: Installation and Dependency Resolution / See clear install failures when dependencies cannot be resolved; Removal and Refresh / See clear update failures when a recorded source cannot be refreshed

## Non-Functional Requirements

- NFR2.1: Mutating operations shall require explicit operator intent through direct command invocation, explicit selection, or equivalent unambiguous input before writing or deleting skill content.
- NFR2.2: The product shall emit clear operator-facing output for successful work, no-op outcomes, blocked removals, dependency-resolution failures, and source-refresh failures.
- NFR2.3: The lock file shall be treated as a normal project or global artifact whose schema is versioned for compatibility, while file-history versioning remains the responsibility of Git or other external source-control tooling.
- NFR2.4: The product shall keep lock-file state consistent with the installed skill set after successful add, remove, and update operations.
- NFR2.5: Operator-facing discovery shall stay focused on installable skills by excluding `metadata.internal: true` skills from discovery output while still allowing them to participate in dependency resolution.

## Technical Constraints

- TC3.1: Installed skills shall be written under `<target>/.agents/skills`, where `<target>` is the current working directory by default and the user home directory when `--global` is present.
- TC3.2: The local lock file shall be written at `<project-root>/dotai-lock.json`, and the global lock file shall be written at `~/.agents/.dotai-lock.json`.
- TC3.3: Skill discovery and dependency resolution shall read skill metadata from `SKILL.md` frontmatter.
- TC3.4: `metadata.dependencies` shall support dependency references expressed as same-source skill names or as explicit URLs.
- TC3.5: `metadata.internal: true` shall mark a skill as hidden from operator-facing discovery and install-selection surfaces without making it ineligible for dependency installation.
- TC3.6: The initial product scope shall not depend on or fall back to any bundled skill catalog.
- TC3.7: The CLI command surface shall be nested under `dotai skills` and shall provide `dotai skills list [--global]`, `dotai skills discover <source> [--global]`, `dotai skills install <source> [skill-name ...] [--global]`, `dotai skills add <source> [skill-name ...] [--global]` as an alias of `install`, `dotai skills uninstall [skill-name ...] [--global]`, `dotai skills remove [skill-name ...] [--global]` as an alias of `uninstall`, and `dotai skills update [skill-name ...] [--global]`.
- TC3.8: Supported explicit source locators and URL-based dependency locators shall include relative or absolute local filesystem paths; GitHub repository URLs such as `https://github.com/<owner>/<repo>`; GitHub tree URLs such as `https://github.com/<owner>/<repo>/tree/<ref>/<path>`, which shall normalize to repository URL `https://github.com/<owner>/<repo>.git` plus `ref` and `subpath`; generic git repository URLs such as `https://<host>/<org>/<repo>.git`, `ssh://git@<host>/<org>/<repo>.git`, and `git@<host>:<org>/<repo>.git`; GitHub shorthand `github:<owner>/<repo>` and `github:<owner>/<repo>#<ref>`; and GitLab shorthand `gitlab:<owner>/<repo>` and `gitlab:<owner>/<repo>#<ref>`.
- TC3.9: The initial product shall not accept `git://...`, arbitrary tarball URLs, or arbitrary HTTP directory URLs as install sources or URL-based dependency locators.
- TC3.10: The product shall run as a Bun CLI application.

## Data Requirements

- DR4.1: Each discovered skill shall expose a stable skill name from `SKILL.md` frontmatter so it can be listed, selected, installed, locked, updated, and referenced by dependency relationships.
- DR4.2: The lock file shall include a top-level `version` field so `dotai` can distinguish schema compatibility from file-history versioning.
- DR4.3: The lock file shall store installed skills in a top-level `skills` record keyed by skill name.
- DR4.4: Each lock-file skill entry shall include a `source` record that stores the provenance locator needed for refresh operations by using `filepath` for file-based sources or `URL` for URL-based sources; when the source is a normalized remote repository locator, the `source` record may also include `ref` and `subpath`.
- DR4.5: Each lock-file skill entry may include `implicit: true` only when the skill is installed solely to satisfy dependency resolution; when `implicit` is absent, the skill shall be treated as directly installed by the operator.
- DR4.6: Each lock-file skill entry shall include a `requiredBy` list containing the names of currently installed skills that require that skill.
- DR4.7: When an operator explicitly installs a skill that was previously recorded with `implicit: true`, the product shall remove the `implicit` marker from that lock entry instead of preserving dependency-only state.
- DR4.8: When a directly installed skill becomes required by additional installed skills, the product shall keep that lock entry in the direct-install state and update `requiredBy` to reflect the new dependents.
- DR4.9: When a lock entry has `implicit: true` and its `requiredBy` list becomes empty, the resulting state shall remain representable so the skill is identifiable as a prune candidate.
- DR4.10: `metadata.internal: true` shall hide a skill from operator-facing discovery, while absence of that field or any value other than `true` shall leave the skill discoverable unless another rule excludes it.
- DR4.11: Dependency entries expressed as skill names shall resolve within the active source namespace, while dependency entries expressed as URLs shall resolve from the referenced source location.
- DR4.12: The lock-file JSON field names shall use `version` for the top-level schema version, `skills` for the top-level installed-skill record, `source` for per-skill provenance, `filepath` or `URL` for the primary source locator, `ref` and `subpath` when a normalized remote source requires them, `implicit` for dependency-only installation state, and `requiredBy` for current dependents.
- DR4.13: The lock-file JSON envelope shall contain exactly a top-level numeric `version` field and a top-level `skills` object whose keys are installed skill names and whose values are lock entries.
- DR4.14: Every lock entry shall include `source` and `requiredBy`; `requiredBy` shall always be present as an array, including `[]` when a skill currently has no dependents.
- DR4.15: A lock entry shall omit `implicit` for direct installs and include `implicit: true` only for dependency-only installs.

## Integration Requirements

- IR5.1: The product shall integrate with the local filesystem to create or update the target `.agents/skills` directory, write installed skill content, remove uninstalled skill content, and read or write the lock file at the correct local or global path.
- IR5.2: The product shall integrate with explicit local source paths so discoverable skills and installable skill content can be read from the filesystem.
- IR5.3: The product shall integrate with explicit GitHub-hosted and git-based sources so discoverable skills and installable skill content can be retrieved from the supplied source locator.
- IR5.4: Update workflows shall integrate with the provenance recorded in the lock file rather than assuming a bundled or implicit source catalog.
- IR5.5: The product shall integrate with home-directory resolution when `--global` is present so global skill content and the global lock file land under the correct user-scoped Agent location.

## Dependencies

- DEP6.1: Read and write access to the resolved target directory and lock-file location is required for lifecycle operations to succeed.
- DEP6.2: Bun runtime availability is required to execute the CLI.
- DEP6.3: Network availability is required when installing from or updating against remote GitHub-hosted, git-based, or URL-based dependency sources.
- DEP6.4: Local filesystem path availability is required when using file-based sources or refreshing skills whose provenance is recorded as a `filepath`.
- DEP6.5: A system `git` executable shall be required for git-based source discovery, installation, and update workflows.

## Further Notes

- Assumptions: Same-source named dependencies may refer to skills hidden from discovery by `metadata.internal: true`; the lock file is expected to be committed to Git or other source control as an ordinary artifact when that fits the operator workflow; update operations use recorded provenance rather than a bundled catalog.
- Open questions: Whether prune candidates remain informational only in the initial release or receive a dedicated prune workflow later.
- TODO: Confirm: None.
