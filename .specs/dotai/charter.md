---
name: dotai-charter
created_at: 2026-04-07T01:52:23Z
updated_at: 2026-04-07T15:15:35Z
generated_by:
  root_skill: specification-authoring
  producing_skill: charter
  skills_used:
    - specification-authoring
    - document-traceability
    - artifact-naming
    - charter
    - write-charter
  skill_graph:
    specification-authoring:
      - document-traceability
      - artifact-naming
      - charter
    document-traceability: []
    artifact-naming: []
    charter:
      - write-charter
    write-charter: []
source_artifacts: {}
---

## Goals

- Deliver a standalone CLI named `dotai` for Agent skill lifecycle management.
- Let operators list, add, remove, and update Agent skills through CLI workflows instead of manually copying or deleting skill directories.
- Default skill operations to the current working directory and support home-directory installation only when the operator explicitly passes `--global`.
- Support acquiring and refreshing skills from explicit operator-specified sources rather than any bundled catalog, including local directories, GitHub-hosted sources, and git-based sources.
- Resolve and install skill dependencies declared in `metadata.dependencies`, including dependencies expressed as skill names within the active source or as explicit URLs.
- Persist a lock file with a versioned schema for the resolved local or global target so the CLI can record installed skill provenance, direct versus implicit installation, and dependency relationships, while leaving file history and version control to Git or other external tooling.
- Keep skill mutations safe by preserving dependency integrity, surfacing blockers before destructive changes, and requiring explicit operator intent for filesystem writes.
- Keep operator-facing discovery focused on installable skills by hiding skills explicitly marked internal in skill metadata.

## Non-Goals

- Bootstrap a full Agent environment outside skill lifecycle management, including initial setup flows and any `AGENTS.md` authoring, sync, merge, or conflict-resolution behavior.
- Ship, depend on, or fall back to a bundled skills source.
- Manage artifacts outside the Agent skills directory except where strictly required to support add, remove, update, or list behavior.
- Expand the initial release beyond the focused skill-management command set.
- Expose repository-maintainer validation, skill authoring, or packaging workflows as part of the initial operator-facing CLI.

## Personas / Actors

- Project developer: manages Agent skills for the current repository and wants safe, fast skill lifecycle operations.
- Home-directory maintainer: installs or refreshes shared Agent skills under the user home directory by explicitly using `--global`.
- Skill publisher or curator: provides installable skill sources in local or remote locations that `dotai` can consume.

## Success Criteria

- SC1.1: A project developer can run `dotai` in a repository and list both installed skills and discoverable skills available from a specified source without manually inspecting directories, while skills marked internal in metadata remain hidden from operator-facing discovery.
- SC1.2: A project developer can add one or more Agent skills from each supported explicit source type into the local target by default, without manually copying skill folders.
- SC1.3: A project developer can install a skill whose `metadata.dependencies` include same-source skill names or explicit URLs, and `dotai` resolves and installs those dependencies without manual follow-up.
- SC1.4: An operator can direct the same add, remove, update, and list workflows at the home-directory target only by passing `--global`.
- SC1.5: A project developer can remove installed Agent skills, and the CLI either completes the removal safely or clearly reports which remaining skills would be broken.
- SC1.6: A project developer can update installed Agent skills through the CLI, and the tool reports what was refreshed and any dependencies that were also changed.
- SC1.7: After skill installation, the CLI writes a normal lock file with a versioned schema for the resolved local or global target that records installed skill provenance, direct versus implicit installation, and dependency relationships clearly enough to support later lifecycle operations, without taking ownership of file-history versioning.
- SC1.8: The initial version keeps setup, `AGENTS.md`, and bundled catalogs clearly out of scope so downstream specification artifacts do not reintroduce them implicitly.
