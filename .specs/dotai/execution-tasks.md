---
name: dotai-execution-tasks
created_at: 2026-04-10T14:39:34Z
updated_at: 2026-04-10T14:39:34Z
generated_by:
  root_skill: specification-to-execution
  producing_skill: task-generation
  skills_used:
    - specification-to-execution
    - document-traceability
    - artifact-naming
    - task-generation
    - write-task-tracking
  skill_graph:
    specification-to-execution:
      - document-traceability
      - artifact-naming
      - task-generation
    document-traceability: []
    artifact-naming: []
    task-generation:
      - write-task-tracking
    write-task-tracking: []
source_artifacts:
  execution_plan: .specs/dotai/execution-plan.md
---

## Task Summary

- Parent plan: .specs/dotai/execution-plan.md
- Scope: Implement the approved `dotai` CLI from the current greenfield repository baseline across read-only discovery, install and lock-file lifecycle management, safe uninstall and update workflows, and the shared operator-facing runtime edge.
- Tracking intent: Use these grouped tracer-bullet tasks to land thin end-to-end behaviors in plan order, update status as slices ship, and keep every implementation turn tied back to the execution plan rather than expanding scope ad hoc.
- Story / requirement / design anchors: Capability areas Target Selection and Discovery, Installation and Dependency Resolution, Lock File and Lifecycle State, and Removal and Refresh; story titles from `.specs/dotai/user-stories.md` because canonical `US1.x` IDs are not yet present; FR1.1-FR1.19, NFR2.1-NFR2.5, TC3.1-TC3.10, DR4.1-DR4.15; CLI Runtime Edge, SkillWorkflows, TargetPaths, SourceWorkspace, SkillCatalog, DependencyPlanner, MutationExecutor, LockfileStore, Failure and Recovery Strategy, and Testing Strategy.
- Runtime-edge obligations: Preserve the nested `dotai skills` grammar, resolved target and source context, prompt fallback when names are omitted, and explicit summary, warning, blocked, failure, and no-op rendering, including `No files or lock file were changed.` when planning blocks mutation.

## Stream Groups

### Inventory and Source Discovery

Objective: Establish the reusable read path for target resolution, source staging, manifest parsing, visibility filtering, and operator-visible list and discover behavior.

#### Task DOTAI-001

- Title: Deliver `dotai skills list` for local and global installed inventory
- Status: Not started
- Blocked by: None
- Plan references:
  - Execution plan / Inventory and Source Discovery / Establish the command and service skeleton for `dotai skills list`, including `MainLayer`, workflow entrypoints, target-path resolution, and installed-skill inventory rendering for local and global targets.
  - FR1.1-FR1.2; TC3.1-TC3.2, TC3.7; CLI Runtime Edge; SkillWorkflows; TargetPaths; SkillCatalog
- What to build: A first end-to-end read-only command path that decodes `dotai skills list [--global]`, resolves the correct target, reads installed skills from `.agents/skills`, and renders the approved inventory summary.
- Acceptance criteria:
  - The CLI exposes `dotai skills list [--global]` and routes it through the runtime edge into a workflow that resolves local and global target paths.
  - Temp-fixture verification proves the command renders installed skill names plus explicit target context without mutating files or requiring a lock file.
- Notes:
  - This is the first production tracer bullet and should establish the shared result-layout baseline for later workflows.

#### Task DOTAI-002

- Title: Deliver `dotai skills discover SOURCE` with hidden-skill filtering
- Status: Not started
- Blocked by: DOTAI-001
- Plan references:
  - Execution plan / Inventory and Source Discovery / Implement source-locator normalization, staged source access, and `dotai skills discover SOURCE [--global]` inventory reads with `metadata.internal: true` hidden from operator-facing discovery.
  - FR1.3-FR1.4; TC3.3-TC3.9; DR4.1, DR4.10-DR4.11; SourceWorkspace; SkillCatalog
- What to build: A discover command that accepts supported local and git-backed source locators, stages the source, parses `SKILL.md` manifests, and renders only operator-visible skills.
- Acceptance criteria:
  - Local-path and git-backed fixture sources normalize into staged workspaces that the command can inspect without changing the target skills directory.
  - Discovery output omits skills with `metadata.internal: true` while the underlying planner-facing catalog view still retains those skills for future dependency resolution.
- Notes:
  - Reuse the list renderer context so discover output already includes target and source details in the approved order.

#### Task DOTAI-003

- Title: Surface read-only discovery failures with cause-oriented CLI output
- Status: Not started
- Blocked by: DOTAI-002
- Plan references:
  - Execution plan / Inventory and Source Discovery / Add typed read-path failures for invalid locators, malformed manifests, and missing discovery roots so read-only workflows fail clearly before any mutation logic is introduced.
  - NFR2.2; TC3.8-TC3.9; Failure and Recovery Strategy; CLI Runtime Edge
- What to build: Typed invalid-source and invalid-manifest failures for list and discover flows, mapped into concise CLI error output that confirms no mutation occurred.
- Acceptance criteria:
  - Unsupported locator formats, missing roots, and malformed manifests are reported with a specific headline and the most relevant source or path context.
  - Failure paths end with a no-mutation footer and leave the target skills directory and lock file unchanged in fixture tests.
- Notes:
  - Keep the error model compatible with the technical-design tagged-error approach so later mutating workflows can reuse it.

### Install Planning and Lockfile Commit

Objective: Deliver install and add workflows that expand dependencies, mutate the skills directory safely, and persist lock-file state atomically.

#### Task DOTAI-004

- Title: Install one direct skill from an explicit source and persist the first lock entry
- Status: Not started
- Blocked by: DOTAI-002
- Plan references:
  - Execution plan / Install Planning and Lockfile Commit / Deliver the first `dotai skills install` tracer bullet for direct skill installation from an explicit source into the resolved target with initial lock-file persistence.
  - FR1.6, FR1.10-FR1.11; DR4.2-DR4.6, DR4.12-DR4.15; MutationExecutor; LockfileStore
- What to build: The smallest production-bound install path that takes one requested skill from a discovered source, copies it into the resolved target, writes the correct lock file, and renders an install summary.
- Acceptance criteria:
  - `dotai skills install SOURCE SKILL-NAME` copies the selected skill into the resolved target `.agents/skills` directory, writes the correct local or global lock file, and records the skill as a direct install.
  - The command summary shows target, source, installed skill, and lock-file context, and simulated lock-write failure proves the copied skill is rolled back before success is reported.
- Notes:
  - Start with the direct-install happy path before widening dependency behavior.

#### Task DOTAI-005

- Title: Expand install planning to same-source dependencies and direct-versus-implicit transitions
- Status: Not started
- Blocked by: DOTAI-004
- Plan references:
  - Execution plan / Install Planning and Lockfile Commit / Expand install planning to same-source named dependencies, hidden internal helper skills, and direct-versus-implicit lock transitions when a dependency later becomes a direct install.
  - FR1.5, FR1.7, FR1.12-FR1.13; DR4.5-DR4.11, DR4.14-DR4.15; DependencyPlanner; SkillCatalog; LockfileStore
- What to build: Dependency-aware install planning that auto-installs same-source dependencies, includes hidden helper skills when required, and keeps lock entries correct as operators later install a dependency directly.
- Acceptance criteria:
  - Installing a direct root skill automatically installs required same-source dependencies, marks dependency-only installs with `implicit: true`, and records `requiredBy` accurately.
  - Reinstalling a previously implicit dependency as a direct selection removes `implicit: true` without rewriting it as a fresh skill or dropping dependent relationships.
- Notes:
  - Treat dependency visibility and lock semantics as one slice so hidden helpers never leak into direct operator selection.

#### Task DOTAI-006

- Title: Resolve URL dependencies and block missing or cyclic install graphs before mutation
- Status: Not started
- Blocked by: DOTAI-005
- Plan references:
  - Execution plan / Install Planning and Lockfile Commit / Add URL-based dependency expansion, cycle detection, and commit rollback so blocked installs or failed commits preserve the prior skills directory and lock file.
  - FR1.8-FR1.9, FR1.19; NFR2.4; TC3.8-TC3.9; DR4.4, DR4.11; SourceWorkspace; DependencyPlanner; MutationExecutor; Failure and Recovery Strategy
- What to build: Install planning that follows supported URL dependency locators across additional sources, detects missing edges and cycles, and refuses mutation until the full graph is complete and safe.
- Acceptance criteria:
  - URL-based dependencies resolve from supported normalized sources and install successfully as part of one command when every dependency is available.
  - Missing dependencies, unsupported locators, or detected cycles produce blocked or failure output with exact dependency context and leave files plus lock state untouched.
- Notes:
  - Use local git fixtures rather than live network calls so cycle and failure coverage stays deterministic.

#### Task DOTAI-007

- Title: Add prompt-based install selection and approved install or add result rendering
- Status: Not started
- Blocked by: DOTAI-005
- Plan references:
  - Execution plan / Install Planning and Lockfile Commit / Wire `install` and `add` prompt fallback plus result rendering for direct installs, implicit dependencies, warnings, and no-op outcomes.
  - FR1.6-FR1.13; NFR2.1-NFR2.2; TC3.7; CLI Runtime Edge; Workflow result rendering contract
- What to build: Prompt fallback for install and add when names are omitted, plus consistent install, warning, and no-op output that reflects direct roots and implicit dependencies clearly.
- Acceptance criteria:
  - Omitting positional skill names prompts from operator-visible discoverable skills only, and the chosen selection still executes through the same install planner and commit boundary.
  - Install and add output uses the shared headline, context, primary result, optional secondary section, and footer order, including dependency summaries and explicit no-op messaging when nothing changes.
- Notes:
  - Hidden helper skills must remain installable only through dependency planning, not through direct prompt choices.

### Safe Uninstall and Provenance-based Update

Objective: Extend the install-time planning and commit boundary to safe removals and provenance-driven refresh.

#### Task DOTAI-008

- Title: Block unsafe uninstall requests when installed dependents still require the skill
- Status: Not started
- Blocked by: DOTAI-005
- Plan references:
  - Execution plan / Safe Uninstall and Provenance-based Update / Implement uninstall planning that blocks removals when remaining installed skills still depend on the target skill and reports the exact blocker set without mutating state.
  - FR1.14; NFR2.2; DR4.6-DR4.9; DependencyPlanner; LockfileStore; Failure and Recovery Strategy
- What to build: An uninstall planning path that inspects installed manifests plus lock relationships, detects dependents, and refuses to remove a skill while the installed set would become invalid.
- Acceptance criteria:
  - `dotai skills uninstall SKILL-NAME` and `remove SKILL-NAME` report the exact blocking dependent skills when the requested skill is still required.
  - Blocked uninstall tests prove the target skills directory and lock file remain byte-for-byte unchanged after the command exits.
- Notes:
  - This slice should establish the blocked-result renderer for later update failures too.

#### Task DOTAI-009

- Title: Remove an unblocked skill and refresh dependency relationships without pruning automatically
- Status: Not started
- Blocked by: DOTAI-008
- Plan references:
  - Execution plan / Safe Uninstall and Provenance-based Update / Deliver safe uninstall for unblocked skills, including skill-directory removal, refreshed `requiredBy` relationships, and visible orphan implicit prune-candidate state.
  - FR1.10, FR1.15; DR4.6-DR4.9, DR4.14-DR4.15; MutationExecutor; LockfileStore
- What to build: The safe-removal happy path that deletes an unblocked skill, rewrites lock-file relationships atomically, and leaves orphan implicit dependencies visible as prune candidates instead of auto-deleting them.
- Acceptance criteria:
  - Successful uninstall removes the requested skill directory, rewrites `requiredBy` lists for surviving skills, and preserves orphan implicit dependencies with `implicit: true` plus an empty `requiredBy` array.
  - Command output confirms the removed skill and any resulting prune candidates, and a simulated persistence failure restores both skills and lock state before success is reported.
- Notes:
  - Keep prune behavior informational only, matching the approved scope.

#### Task DOTAI-010

- Title: Refresh direct and selective update roots from recorded lock provenance
- Status: Not started
- Blocked by: DOTAI-006, DOTAI-009
- Plan references:
  - Execution plan / Safe Uninstall and Provenance-based Update / Deliver full and selective `dotai skills update` from recorded lock-file provenance, widening only the dependency closure needed to keep refreshed skills consistent.
  - FR1.16-FR1.19; TC3.7-TC3.9; DR4.4, DR4.12-DR4.15; SourceWorkspace; DependencyPlanner; LockfileStore
- What to build: Update workflows that treat lock-file provenance as the refresh source of truth, support full and selective roots, and widen the dependency closure only where consistency requires it.
- Acceptance criteria:
  - `dotai skills update` refreshes all direct installs from recorded source data, while `dotai skills update SKILL-NAME` refreshes only the requested roots plus affected dependencies.
  - Missing or invalid recorded sources fail with explicit skill and source context, and no update reports success unless both files and lock state commit together.
- Notes:
  - Reuse the install planner's normalized source and cycle handling instead of creating a separate refresh-only path.

#### Task DOTAI-011

- Title: Prove rollback keeps filesystem and lock state synchronized across uninstall and update failures
- Status: Not started
- Blocked by: DOTAI-010
- Plan references:
  - Execution plan / Safe Uninstall and Provenance-based Update / Reuse the install-time commit boundary for uninstall and update so multi-skill operations roll back cleanly when filesystem or lock-file persistence fails late.
  - FR1.10, FR1.14-FR1.19; NFR2.4; MutationExecutor; LockfileStore; Failure and Recovery Strategy
- What to build: Failure-injection coverage and any supporting commit-boundary wiring needed to guarantee uninstall and update leave the previously committed state intact when late-stage operations fail.
- Acceptance criteria:
  - Injected rename, copy, or lock-write failures during uninstall and update restore the prior skills directory and prior lock-file contents before the command exits.
  - Failure output distinguishes no-mutation pre-commit failures from rolled-back post-stage failures so operators can tell whether recovery happened.
- Notes:
  - This task is complete only when the rollback guarantee is demonstrated, not merely described.

### CLI UX Hardening and Verification

Objective: Finish prompt flows, shared rendering, and automated verification so the CLI stays reliable as implementation expands.

#### Task DOTAI-012

- Title: Add prompt fallback for uninstall and update without leaking hidden or ineligible selections
- Status: Not started
- Blocked by: DOTAI-008, DOTAI-010
- Plan references:
  - Execution plan / CLI UX Hardening and Verification / Complete prompt fallback for uninstall and update so omitted skill names still lead to safe, operator-visible selections scoped to the resolved target.
  - FR1.1, FR1.14-FR1.17; NFR2.1-NFR2.2; CLI Runtime Edge; SkillCatalog
- What to build: Prompt-driven uninstall and update selections that appear when names are omitted, limit choices to the current target's eligible visible skills, and preserve local-versus-global context.
- Acceptance criteria:
  - Omitting names on uninstall or update shows only the installed skills that the current workflow can act on for the resolved local or global target.
  - Completing a prompted selection executes the same workflow path as positional input and renders the same structured result layout.
- Notes:
  - Keep the selection contract behavior-oriented: prompt choice should always map to a real command outcome.

#### Task DOTAI-013

- Title: Normalize renderer output across success, warning, blocked, failure, and no-op cases
- Status: Not started
- Blocked by: DOTAI-007, DOTAI-008, DOTAI-010
- Plan references:
  - Execution plan / CLI UX Hardening and Verification / Implement the shared renderer for summary, warning, blocked, failure, and no-op results across all workflows.
  - NFR2.2; TC3.7; Workflow result rendering contract; Failure and Recovery Strategy
- What to build: One shared result-rendering path that every workflow uses so output ordering, wording, and mutation-status footers stay consistent.
- Acceptance criteria:
  - Every workflow outcome renders headline, context, primary result, optional secondary sections, and the correct mutation footer in the approved order.
  - Blocked and failure cases surface the exact blocker set or cause-oriented context without printing raw stack traces in normal output.
- Notes:
  - This task can refactor earlier workflow-specific output once all major behaviors exist.

#### Task DOTAI-014

- Title: Replace placeholder verification with automated unit, integration, and CLI coverage
- Status: Not started
- Blocked by: DOTAI-011, DOTAI-012, DOTAI-013
- Plan references:
  - Execution plan / CLI UX Hardening and Verification / Add automated unit, integration, git-fixture, and CLI tests that cover path resolution, source normalization, dependency planning, rollback, prompt flows, and renderer output, then keep `bun run check` green.
  - NFR2.4; TC3.10; DEP6.2-DEP6.5; Testing Strategy
- What to build: A real automated test suite and repository validation path that prove the CLI behavior, dependency safety, and rollback guarantees instead of relying on manual checks.
- Acceptance criteria:
  - The repository replaces the placeholder test behavior with automated coverage for target resolution, source normalization, install or uninstall or update planning, rollback, prompt flows, and renderer output.
  - `bun run check` passes against the new verification matrix and becomes a meaningful completion gate for ongoing `dotai` implementation work.
- Notes:
  - TODO: Confirm the final test runner and prompt-test harness before starting this task, because the repository currently has only a placeholder test script.

## Dependency Map

- DOTAI-001 -> None
- DOTAI-002 -> DOTAI-001
- DOTAI-003 -> DOTAI-002
- DOTAI-004 -> DOTAI-002
- DOTAI-005 -> DOTAI-004
- DOTAI-006 -> DOTAI-005
- DOTAI-007 -> DOTAI-005
- DOTAI-008 -> DOTAI-005
- DOTAI-009 -> DOTAI-008
- DOTAI-010 -> DOTAI-006, DOTAI-009
- DOTAI-011 -> DOTAI-010
- DOTAI-012 -> DOTAI-008, DOTAI-010
- DOTAI-013 -> DOTAI-007, DOTAI-008, DOTAI-010
- DOTAI-014 -> DOTAI-011, DOTAI-012, DOTAI-013

## Tracking Notes

- Active stream: Inventory and Source Discovery
- Global blockers: None
- TODO: Confirm: Select the concrete automated test runner and prompt-test harness before starting DOTAI-014, because the repository currently uses a placeholder `bun run test` script and that choice affects fixture and helper design.
