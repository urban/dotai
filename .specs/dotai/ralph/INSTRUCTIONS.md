# dotai LLM Execution Instructions

Use these instructions when working a single task from `./CHECKLIST.md`.

The checklist is only the task index. The authoritative task definition lives in:

- `../execution-tasks.md`

The authoritative architecture and sequencing context live in:

- `../technical-design.md`
- `../execution-plan.md`

## Required Inputs for Every Fresh Task Session

At the start of a session, read:

1. `./INSTRUCTIONS.md`
2. `./CHECKLIST.md`
3. `../execution-tasks.md`
4. `../execution-plan.md`
5. `../technical-design.md`
6. `../../../package.json`

Then find the selected `TASK_ID` in `../execution-tasks.md` and use that entry as the source of truth for:

- scope
- dependencies
- acceptance criteria
- plan references
- notes

## Single-Task Rule

Implement **exactly one** checklist task per session.

- Do not expand scope beyond the selected task.
- Do not partially implement later tasks unless the current task explicitly requires it.
- If a dependency task is incomplete, stop and report the dependency blocker instead of working around it.

## Dependency Rule

Before coding:

- confirm the selected task's dependencies from `../execution-tasks.md`
- verify those dependencies are actually complete in the repository, not just listed in the checklist
- if they are not complete, report that the task is blocked

## Required Design Alignment

Preserve the approved Effect v4 architecture.

### CLI and runtime composition

Keep the composition root aligned with the technical design:

- `effect/unstable/cli`
- `Command.run(...)`
- `BunServices.layer`
- `BunRuntime.runMain`

### Service boundaries

Keep responsibilities aligned with the named boundaries in the technical design:

- `SkillWorkflows`
- `TargetPaths`
- `SourceWorkspace`
- `SkillCatalog`
- `DependencyPlanner`
- `MutationExecutor`
- `LockfileStore`

### Effect v4 conventions

Prefer current Effect v4 patterns and conventions:

- `Context.Service`
- `Effect.fn("Service.method")`
- `Effect.gen`
- `Schema.optionalKey(...)` for omitted optional fields
- platform services instead of ad hoc runtime calls
- `ChildProcessSpawner` for git-backed process execution

## Testing Requirements

All automated testing must remain aligned with the spec:

- use Vitest
- use `@effect/vitest` for Effect-native tests
- do **not** introduce Bun Test Runner-based tests

When adding or updating tests, prefer:

- `it.effect`
- `it.live`
- shared `layer(...)` setup when appropriate
- boundary-oriented tests over private-helper tests

## Code Quality Requirements

Keep implementation changes minimal, surgical, and type-safe.

Do not:

- use `any`
- use non-null assertions (`!`)
- use type assertions (`as Type`)
- weaken type safety to get a task over the line
- rewrite unrelated code while working a single task

Prefer making illegal states unrepresentable.

## Task Completion Standard

A task is complete only when all of the following are true:

- the scoped behavior works end to end
- the task acceptance criteria in `../execution-tasks.md` are satisfied
- tests cover the intended behavior
- the implementation still matches `../technical-design.md`
- the implementation still matches `../execution-plan.md`
- `bun run check` passes

## Required Validation Step

Before finishing a task, run:

```sh
bun run check
```

Do not report the task complete if this fails.
