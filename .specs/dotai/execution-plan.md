---
name: dotai-execution-plan
created_at: 2026-04-10T14:39:34Z
updated_at: 2026-04-10T14:39:34Z
generated_by:
  root_skill: specification-to-execution
  producing_skill: execution-planning
  skills_used:
    - specification-to-execution
    - document-traceability
    - artifact-naming
    - execution-planning
    - write-execution-plan
  skill_graph:
    specification-to-execution:
      - document-traceability
      - artifact-naming
      - execution-planning
    document-traceability: []
    artifact-naming: []
    execution-planning:
      - write-execution-plan
    write-execution-plan: []
source_artifacts:
  charter: .specs/dotai/charter.md
  user_stories: .specs/dotai/user-stories.md
  requirements: .specs/dotai/requirements.md
  technical_design: .specs/dotai/technical-design.md
---

## Execution Summary

This plan coordinates the first implementation of `dotai` from the approved specification pack in a repository that is still effectively greenfield for runtime code. It sequences the work as four implementation streams: establish read-only inventory and discovery behavior first, add install plus lock-file commit behavior next, extend the same planning and commit boundary to uninstall and update, then harden the CLI runtime edge and verification matrix. The goal is to deliver operator-visible `dotai skills` workflows without drifting from the approved Effect service boundaries, lock-file semantics, or rollback guarantees.

## Scope Alignment

- Charter: .specs/dotai/charter.md
- User Stories: .specs/dotai/user-stories.md
- Requirements: .specs/dotai/requirements.md
- Technical Design: .specs/dotai/technical-design.md
- Story capability areas: Target Selection and Discovery; Installation and Dependency Resolution; Lock File and Lifecycle State; Removal and Refresh
- Story anchors: TODO: Confirm
- Requirement anchors: FR1.1-FR1.19; NFR2.1-NFR2.5; TC3.1-TC3.10; DR4.1-DR4.15; IR5.1-IR5.5; DEP6.1-DEP6.5
- Design anchors: CLI Runtime Edge; SkillWorkflows; TargetPaths; SourceWorkspace; SkillCatalog; DependencyPlanner; MutationExecutor; LockfileStore; Failure and Recovery Strategy; Testing Strategy
- Runtime-edge obligations: Preserve the nested `dotai skills` command grammar, `--global` target switching, prompt fallback when skill names are omitted, and explicit operator-facing success, warning, blocked, failure, and no-op rendering, including `No files or lock file were changed.` whenever planning blocks mutation before commit.
- In-scope implementation objective: Build the first working `dotai` CLI and its supporting Effect services so the approved list, discover, install or add, uninstall or remove, and update workflows can be implemented and validated from the current repository baseline.

## Implementation Streams

### Inventory and Source Discovery

- Objective: Establish the reusable read path for target resolution, source normalization and staging, manifest parsing, visibility filtering, and operator-visible list and discover behavior before any mutation work begins.
- Implements:
  - Target Selection and Discovery capability area
  - FR1.1-FR1.4, NFR2.2, TC3.1-TC3.9, DR4.1, DR4.10-DR4.11, IR5.1-IR5.3
  - CLI Runtime Edge; SkillWorkflows; TargetPaths; SourceWorkspace; SkillCatalog
- Interfaces / failure concerns: Invalid source locators, malformed `SKILL.md` frontmatter, hidden internal-skill filtering, local versus global target path reporting, and clear read-only failure rendering.
- Notes: This stream should deliver the first production tracer bullets because it creates observable CLI behavior and the catalog views that later install, uninstall, and update planning depend on.

### Install Planning and Lockfile Commit

- Objective: Deliver `install` and `add` as end-to-end workflows that expand dependencies, stage filesystem changes safely, and persist the lock file atomically with direct versus implicit install semantics.
- Implements:
  - Installation and Dependency Resolution capability area
  - Lock File and Lifecycle State capability area
  - FR1.5-FR1.13, FR1.19, NFR2.1-NFR2.5, DR4.2-DR4.15, IR5.1-IR5.4
  - DependencyPlanner; MutationExecutor; LockfileStore; SourceWorkspace; SkillCatalog
- Interfaces / failure concerns: Same-source dependency expansion, URL dependency staging, cycle detection, direct-to-implicit state transitions, atomic lock-file replacement, and rollback when mutation or persistence fails.
- Notes: The first install slice should stay small, then widen to same-source and URL dependency cases once the commit boundary and lock-file projection are trustworthy.

### Safe Uninstall and Provenance-based Update

- Objective: Extend the same planning and commit model to uninstall and update so removals stay dependency-safe and refresh uses recorded provenance rather than any bundled catalog.
- Implements:
  - Removal and Refresh capability area
  - Lock File and Lifecycle State capability area
  - FR1.10, FR1.14-FR1.19, NFR2.2-NFR2.4, DR4.4-DR4.15, IR5.1-IR5.5
  - DependencyPlanner; MutationExecutor; LockfileStore; SourceWorkspace; Failure and Recovery Strategy
- Interfaces / failure concerns: Blocked uninstalls, prune-candidate state after safe removal, selective-update closure, missing or invalid recorded sources, dependency cycles during refresh, and rollback across multi-skill changes.
- Notes: This stream should reuse the install-time graph and commit machinery rather than re-implement workflow-specific mutation rules.

### CLI UX Hardening and Verification

- Objective: Complete the runtime edge with prompt flows, consistent renderer behavior, and the test matrix needed to keep the CLI trustworthy as more workflows land.
- Implements:
  - Target Selection and Discovery capability area
  - Installation and Dependency Resolution capability area
  - Removal and Refresh capability area
  - NFR2.1-NFR2.5, TC3.7, TC3.10, DEP6.2-DEP6.5
  - CLI Runtime Edge; Workflow result rendering contract; Testing Strategy
- Interfaces / failure concerns: Interactive fallback flows, hidden-skill exclusion in selection surfaces, consistent result-section ordering, repository-level `bun run check`, and fixtures for local and git-backed sources.
- Notes: Some renderer and test work should begin earlier, but this stream closes the operator-facing gaps after the core workflows exist end to end.

## Work Breakdown

### Inventory and Source Discovery

- [ ] Establish the command and service skeleton for `dotai skills list`, including `MainLayer`, workflow entrypoints, target-path resolution, and installed-skill inventory rendering for local and global targets.
  - Traceability: Target Selection and Discovery; FR1.1-FR1.2; TC3.1-TC3.2, TC3.7; CLI Runtime Edge, SkillWorkflows, TargetPaths, SkillCatalog
  - Verification focus: `dotai skills list` reports the resolved target and installed inventory correctly for temp local and global fixtures.
- [ ] Implement source-locator normalization, staged source access, and `dotai skills discover SOURCE [--global]` inventory reads with `metadata.internal: true` hidden from operator-facing discovery.
  - Traceability: Target Selection and Discovery; FR1.3-FR1.4; TC3.3-TC3.9; DR4.1, DR4.10-DR4.11; SourceWorkspace, SkillCatalog
  - Verification focus: `discover` works against supported local and git-backed fixtures, and hidden helper skills stay available to planners while remaining absent from operator-visible discovery.
- [ ] Add typed read-path failures for invalid locators, malformed manifests, and missing discovery roots so read-only workflows fail clearly before any mutation logic is introduced.
  - Traceability: NFR2.2; TC3.8-TC3.9; Failure and Recovery Strategy; CLI Runtime Edge
  - Verification focus: invalid source and manifest failures render concise cause-oriented output and leave filesystem state untouched.

### Install Planning and Lockfile Commit

- [ ] Deliver the first `dotai skills install` tracer bullet for direct skill installation from an explicit source into the resolved target with initial lock-file persistence.
  - Traceability: Installation and Dependency Resolution; Lock File and Lifecycle State; FR1.6, FR1.10-FR1.11; DR4.2-DR4.6, DR4.12-DR4.15; MutationExecutor, LockfileStore
  - Verification focus: a direct install copies the selected skill, writes the correct local or global lock-file path, and renders an install summary with target, source, and lock-file context.
- [ ] Expand install planning to same-source named dependencies, hidden internal helper skills, and direct-versus-implicit lock transitions when a dependency later becomes a direct install.
  - Traceability: Installation and Dependency Resolution; Lock File and Lifecycle State; FR1.5, FR1.7, FR1.12-FR1.13; DR4.5-DR4.11, DR4.14-DR4.15; DependencyPlanner, SkillCatalog, LockfileStore
  - Verification focus: install planning auto-installs same-source dependencies, records `requiredBy` correctly, preserves hidden dependency eligibility, and removes `implicit: true` when an operator later installs that skill directly.
- [ ] Add URL-based dependency expansion, cycle detection, and commit rollback so blocked installs or failed commits preserve the prior skills directory and lock file.
  - Traceability: Installation and Dependency Resolution; FR1.8-FR1.9, FR1.19; NFR2.4; TC3.8-TC3.9; DR4.4, DR4.11; SourceWorkspace, DependencyPlanner, MutationExecutor, Failure and Recovery Strategy
  - Verification focus: URL dependency installs succeed from staged remote fixtures, and missing dependencies, detected cycles, copy failures, or lock-write failures report the cause and keep state unchanged or rolled back cleanly.
- [ ] Wire `install` and `add` prompt fallback plus result rendering for direct installs, implicit dependencies, warnings, and no-op outcomes.
  - Traceability: Installation and Dependency Resolution; FR1.6-FR1.13; NFR2.1-NFR2.2; TC3.7; CLI Runtime Edge, Workflow result rendering contract
  - Verification focus: install and add commands with and without positional names produce the approved renderer layout and never expose hidden helper skills as direct prompt choices.

### Safe Uninstall and Provenance-based Update

- [ ] Implement uninstall planning that blocks removals when remaining installed skills still depend on the target skill and reports the exact blocker set without mutating state.
  - Traceability: Removal and Refresh; FR1.14; NFR2.2; DR4.6-DR4.9; DependencyPlanner, LockfileStore, Failure and Recovery Strategy
  - Verification focus: blocked uninstall paths print dependent-skill blockers and preserve both installed files and lock-file contents exactly.
- [ ] Deliver safe uninstall for unblocked skills, including skill-directory removal, refreshed `requiredBy` relationships, and visible orphan implicit prune-candidate state.
  - Traceability: Removal and Refresh; Lock File and Lifecycle State; FR1.10, FR1.15; DR4.6-DR4.9, DR4.14-DR4.15; MutationExecutor, LockfileStore
  - Verification focus: safe uninstall removes the skill, rewrites the lock file atomically, and leaves orphan implicit dependencies identifiable without deleting them automatically.
- [ ] Deliver full and selective `dotai skills update` from recorded lock-file provenance, widening only the dependency closure needed to keep refreshed skills consistent.
  - Traceability: Removal and Refresh; FR1.16-FR1.19; TC3.7-TC3.9; DR4.4, DR4.12-DR4.15; SourceWorkspace, DependencyPlanner, LockfileStore
  - Verification focus: full update refreshes direct installs from recorded sources, selective update refreshes the requested roots plus affected dependencies, and missing or invalid recorded sources fail with explicit skill and source context.
- [ ] Reuse the install-time commit boundary for uninstall and update so multi-skill operations roll back cleanly when filesystem or lock-file persistence fails late.
  - Traceability: Removal and Refresh; FR1.10, FR1.14-FR1.19; NFR2.4; MutationExecutor, LockfileStore, Failure and Recovery Strategy
  - Verification focus: injected rename or lock-write failures during uninstall or update leave the committed skills directory and lock file synchronized.

### CLI UX Hardening and Verification

- [ ] Complete prompt fallback for uninstall and update so omitted skill names still lead to safe, operator-visible selections scoped to the resolved target.
  - Traceability: Target Selection and Discovery; Removal and Refresh; FR1.1, FR1.14-FR1.17; NFR2.1-NFR2.2; CLI Runtime Edge, SkillCatalog
  - Verification focus: uninstall and update prompt flows show only eligible visible installed skills, preserve target context, and respect local versus global scope.
- [ ] Implement the shared renderer for summary, warning, blocked, failure, and no-op results across all workflows.
  - Traceability: NFR2.2; TC3.7; Workflow result rendering contract; Failure and Recovery Strategy
  - Verification focus: outputs follow headline, context, primary result, optional secondary sections, and mutation footer ordering for every workflow outcome.
- [ ] Add automated unit, integration, git-fixture, and CLI tests that cover path resolution, source normalization, dependency planning, rollback, prompt flows, and renderer output, then keep `bun run check` green.
  - Traceability: NFR2.4; TC3.10; DEP6.2-DEP6.5; Testing Strategy
  - Verification focus: repository validation proves the command surface, dependency safety rules, and commit-boundary guarantees instead of relying on manual verification alone.

## Dependency and Sequencing Strategy

- Prerequisites: Bun runtime, a system `git` executable for git-backed sources, fixture repositories for local and remote-source tests, and the approved specification pack already in `.specs/dotai/`.
- Sequencing notes: Start with Inventory and Source Discovery so target resolution, source normalization, manifest parsing, and renderer context exist before mutation work. Begin Install Planning and Lockfile Commit once the read path is stable enough to support install-source selection and manifest decoding. Start Safe Uninstall and Provenance-based Update after the install-time dependency graph, lock-file model, and commit boundary have proved they can preserve state safely. Run CLI UX Hardening and Verification throughout, but hold the final renderer normalization and test-matrix closure until every workflow has landed at least one end-to-end slice.
- Coordination risks: The repository currently has only placeholder runtime code, so package layout, CLI bin wiring, and test harness selection must be introduced without collapsing the designed service boundaries; remote-source fixtures can become brittle if they depend on live network behavior instead of local git repositories; rollback testing needs deliberate failure injection so commit-boundary guarantees are proved rather than assumed.

## Validation Checkpoints

- `dotai skills list [--global]` resolves the correct target paths and renders installed inventory with explicit target context.
- `dotai skills discover SOURCE [--global]` normalizes supported locators, hides `metadata.internal: true` from operator-facing discovery, and reports invalid source or manifest failures clearly.
- `dotai skills install SOURCE [skill-name ...] [--global]` and `dotai skills add SOURCE [skill-name ...] [--global]` install requested skills plus dependencies, write the correct lock file atomically, and preserve direct versus implicit semantics.
- Install planning detects missing dependencies and cycles before mutation, and blocked installs render the failing dependency path plus `No files or lock file were changed.`.
- `dotai skills uninstall [skill-name ...] [--global]` and `dotai skills remove [skill-name ...] [--global]` block removals with dependents, complete safe removals when unblocked, and keep lock-file relationships accurate.
- `dotai skills update [skill-name ...] [--global]` refreshes from recorded provenance, supports full and selective refresh, and reports missing recorded sources with skill-specific context.
- Injected copy, rename, or lock-write failures prove rollback leaves the skills directory and lock file synchronized.
- Automated unit, integration, git-fixture, and CLI tests pass, and repository-wide validation completes with `bun run check`.

## Risks and Mitigations

- Risk: Greenfield implementation work could drift from the approved service boundaries and turn the CLI edge into an orchestration layer.
- Mitigation: Establish the `SkillWorkflows` contract and service boundaries early, then keep later tasks anchored to those interfaces rather than ad hoc command handlers.
- Risk: Remote-source support and URL-based dependencies could introduce nondeterministic tests or brittle network assumptions.
- Mitigation: Prefer local bare git repositories and fixture trees for integration coverage, and reserve live-network behavior for manual spot checks only.
- Risk: Lock-file and filesystem mutations could diverge if rollback is not exercised under failure.
- Mitigation: Add explicit failure-injection coverage for copy, rename, and lock-write steps before treating install, uninstall, or update as complete.
- Risk: Hidden internal skills could accidentally leak into operator prompts or discovery output while still being required for dependency planning.
- Mitigation: Keep discovery and planning inventories distinct in `SkillCatalog` and verify both views in CLI and planner tests.

## Progress Tracking

- Status: Not started
- Active stream: Inventory and Source Discovery
- Notes: Execution artifacts authored. Implementation can begin with the list and discover tracer bullets, then widen into install, uninstall, update, and verification work in plan order.

## Further Notes

- Repository context: `src/index.ts` is currently only a placeholder export, so implementation will need to introduce the CLI entrypoint, service layout, and tests from scratch while preserving the approved Effect architecture.
- Story-anchor note: Canonical `US1.x` story IDs are not present in `.specs/dotai/user-stories.md`, so execution traceability currently relies on capability areas and story titles until those IDs are assigned.
- TODO: Confirm: Choose the concrete automated test runner and prompt-test harness before the CLI UX Hardening and Verification stream is broken into implementation commits, because the current `bun run test` script is a placeholder and that choice affects fixture setup and task slicing.
