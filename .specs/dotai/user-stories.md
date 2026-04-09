---
name: dotai-user-stories
created_at: 2026-04-07T14:09:59Z
updated_at: 2026-04-07T15:15:35Z
generated_by:
  root_skill: specification-authoring
  producing_skill: user-story-authoring
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - user-story-authoring
    - write-user-stories
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - user-story-authoring
    document-traceability: []
    artifact-naming: []
    user-story-authoring:
      - write-user-stories
    write-user-stories: []
source_artifacts:
  charter: .specs/dotai/charter.md
---

# User Stories

## Capability Area: Target Selection and Discovery

### Story: Inspect installed skills for the current project

- Actor: Project developer
- Situation: The developer wants to understand which Agent skills are already installed for the repository they are working in.
- Action: They use `dotai` to list the installed skills for the current working directory without using `--global`.
- Outcome: They can decide what to add, remove, or update without manually inspecting `.agents/skills`.
- Observation: The CLI identifies the current project target and displays the installed skills associated with that local target.

### Story: Inspect discoverable skills from an explicit source

- Actor: Project developer
- Situation: The developer is considering a local directory, GitHub-hosted source, or git-based source as the origin for new skills.
- Action: They use `dotai` to inspect that explicit source before installing anything.
- Outcome: They can see which skills are discoverable from the specified source and choose what to install.
- Observation: The CLI identifies the requested source and lists the skills that are available for operator-facing discovery from that source.

### Story: Apply skill workflows to the home-directory target with `--global`

- Actor: Home-directory maintainer
- Situation: The maintainer wants to manage shared Agent skills outside a single repository.
- Action: They run list, install, remove, or update workflows with the `--global` flag.
- Outcome: The same lifecycle workflows apply to the home-directory target instead of the current repository.
- Observation: The CLI reports the home-directory target and treats that global target as the location for skill mutations and lifecycle tracking.

### Story: Hide internal skills from operator-facing discovery

- Actor: Project developer
- Situation: A source contains a mix of public skills and helper skills whose `SKILL.md` frontmatter sets `metadata.internal: true`.
- Action: They list discoverable skills or choose installable skills from that source.
- Outcome: They see only operator-facing skills and are not asked to choose internal helper skills directly.
- Observation: Skills marked `metadata.internal: true` do not appear in operator-facing discovery or install-selection surfaces.

## Capability Area: Installation and Dependency Resolution

### Story: Install selected skills from an explicit source

- Actor: Project developer
- Situation: The developer wants to add one or more Agent skills from a source they trust.
- Action: They select skills from an explicit local, GitHub-hosted, or git-based source and ask `dotai` to install them.
- Outcome: The requested skills are added to the resolved local or global target without manual copying.
- Observation: The CLI reports which requested skills were installed and where they were written.

### Story: Resolve same-source named dependencies automatically

- Actor: Project developer
- Situation: A selected skill declares `metadata.dependencies` entries that name other skills from the same source, including helper skills that may be hidden from discovery.
- Action: They install the selected skill.
- Outcome: `dotai` installs the required named dependencies automatically so the selected skill is usable without manual follow-up.
- Observation: The CLI reports the requested skill together with any automatically installed same-source dependencies, including dependencies that were not separately discoverable.

### Story: Resolve URL-based dependencies automatically

- Actor: Project developer
- Situation: A selected skill declares `metadata.dependencies` entries as explicit URLs instead of same-source skill names.
- Action: They install the selected skill.
- Outcome: `dotai` fetches and installs the referenced dependency skills from those URLs as part of the same install flow.
- Observation: The CLI reports the URL-sourced dependencies it resolved and the skills installed from them.

### Story: See clear install failures when dependencies cannot be resolved

- Actor: Project developer
- Situation: A selected skill depends on a missing same-source skill or on a URL that cannot be fetched or interpreted.
- Action: They attempt the install.
- Outcome: They understand which dependency blocked the install and what source or reference needs correction.
- Observation: The CLI identifies the failing dependency and source problem instead of leaving the operator with a misleading partial result.

## Capability Area: Lock File and Lifecycle State

### Story: Persist installed-skill state in a lock file with a versioned schema

- Actor: Project developer
- Situation: The developer installs skills into a repository or updates the installed set later.
- Action: They complete a mutating `dotai` skill workflow against the resolved target.
- Outcome: The target gains a normal lock file whose schema is versioned so `dotai` can record installed skills, their provenance, and their dependency relationships for future lifecycle operations without taking ownership of file-history versioning.
- Observation: A local workflow writes `dotai-lock.json` at the project root, while a global workflow writes `~/.agents/.dotai-lock.json`; each lock file records skill entries keyed by skill name and can be treated like an ordinary file in Git or other source control.

### Story: Record direct and implicit installs distinctly

- Actor: Project developer
- Situation: Some skills were chosen explicitly by the operator, while others were installed only to satisfy dependency resolution.
- Action: They review the resulting lifecycle state after installation.
- Outcome: They can distinguish skills they asked for directly from skills that exist only because another installed skill requires them.
- Observation: The lock file leaves `implicit` absent for direct installs and uses `implicit: true` for dependency-only installs.

### Story: Promote an implicit dependency to a direct install when explicitly chosen later

- Actor: Project developer
- Situation: A skill was previously installed only as a dependency, and the developer later decides they want that skill directly.
- Action: They explicitly install that skill in a later command.
- Outcome: The skill becomes protected as a direct install rather than continuing to behave like a dependency-only artifact.
- Observation: The lock entry for that skill no longer includes `implicit: true` after the explicit install.

### Story: Keep a directly installed skill direct when other skills begin depending on it

- Actor: Project developer
- Situation: A skill was installed directly first, and the developer later installs additional skills that also require it.
- Action: They complete the later installation.
- Outcome: The original skill remains treated as a direct install while still tracking which other skills depend on it.
- Observation: The lock entry remains direct rather than becoming implicit, and its `requiredBy` list is updated to reflect the new dependents.

### Story: Identify orphaned implicit dependencies as prune candidates

- Actor: Project developer
- Situation: A dependency-only skill no longer has any installed skills that require it after a remove or update flow.
- Action: They review the resulting lifecycle state.
- Outcome: They can see that the dependency is now a candidate for pruning instead of mistakenly treating it as still required.
- Observation: The dependency remains marked `implicit: true`, its `requiredBy` list becomes empty, and the resulting state makes it identifiable as a prune candidate.

## Capability Area: Removal and Refresh

### Story: Prevent removals that would break remaining installed skills

- Actor: Project developer
- Situation: The developer tries to remove a skill that is still required by other installed skills.
- Action: They request the removal.
- Outcome: The installed skill set remains valid, and they understand which dependencies must be addressed first.
- Observation: The CLI reports the blocking dependent skills and leaves the installed files and lifecycle state unchanged.

### Story: Remove a skill and refresh dependency relationships

- Actor: Project developer
- Situation: The developer removes a skill that is no longer needed and is safe to uninstall.
- Action: They complete the removal.
- Outcome: The target no longer contains that skill, and the remaining dependency relationships stay accurate.
- Observation: The CLI confirms the removal, and the lock file updates `requiredBy` relationships plus any newly orphaned implicit dependencies.

### Story: Update installed skills from recorded source provenance

- Actor: Project developer
- Situation: The developer wants to refresh installed skills without manually reconstructing where each skill originally came from.
- Action: They ask `dotai` to update installed skills using the provenance already recorded for the current target.
- Outcome: The selected installed skills and any affected dependencies are refreshed from their recorded sources.
- Observation: The CLI reports which skills were updated, which dependencies changed with them, and the lifecycle state remains consistent afterward.

### Story: See clear update failures when a recorded source cannot be refreshed

- Actor: Project developer
- Situation: An installed skill points at a recorded file path or URL that is no longer reachable or valid during an update.
- Action: They run an update.
- Outcome: They can identify which installed skill could not be refreshed and what source information needs correction.
- Observation: The CLI identifies the failing skill and recorded source rather than reporting a generic update failure.
