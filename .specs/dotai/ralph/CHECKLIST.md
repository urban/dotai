# dotai Task Checklist

The source of truth for scope, dependencies, acceptance criteria, and implementation notes is:

- `../execution-tasks.md`

If a checklist item and `../execution-tasks.md` ever disagree, follow `../execution-tasks.md`.

## Recommended Execution Order

### Stream 1: Inventory and Source Discovery

- [x] `DOTAI-001` — Deliver `dotai skills list` for local and global installed inventory  
       See: `../execution-tasks.md` → `DOTAI-001`  
       Depends on: None

- [x] `DOTAI-002` — Deliver `dotai skills discover SOURCE` with hidden-skill filtering  
       See: `../execution-tasks.md` → `DOTAI-002`  
       Depends on: `DOTAI-001`

- [x] `DOTAI-003` — Surface read-only discovery failures with cause-oriented CLI output  
       See: `../execution-tasks.md` → `DOTAI-003`  
       Depends on: `DOTAI-002`

### Stream 2: Install Planning and Lockfile Commit

- [x] `DOTAI-004` — Install one direct skill from an explicit source and persist the first lock entry  
       See: `../execution-tasks.md` → `DOTAI-004`  
       Depends on: `DOTAI-002`

- [x] `DOTAI-005` — Expand install planning to same-source dependencies and direct-versus-implicit transitions  
       See: `../execution-tasks.md` → `DOTAI-005`  
       Depends on: `DOTAI-004`

- [x] `DOTAI-006` — Resolve URL dependencies and block missing or cyclic install graphs before mutation  
       See: `../execution-tasks.md` → `DOTAI-006`  
       Depends on: `DOTAI-005`

- [x] `DOTAI-007` — Add prompt-based install selection and approved install/add result rendering  
       See: `../execution-tasks.md` → `DOTAI-007`  
       Depends on: `DOTAI-005`

### Stream 3: Safe Uninstall and Provenance-based Update

- [x] `DOTAI-008` — Block unsafe uninstall requests when installed dependents still require the skill  
       See: `../execution-tasks.md` → `DOTAI-008`  
       Depends on: `DOTAI-005`

- [x] `DOTAI-009` — Remove an unblocked skill and refresh dependency relationships without pruning automatically  
       See: `../execution-tasks.md` → `DOTAI-009`  
       Depends on: `DOTAI-008`

- [x] `DOTAI-010` — Refresh direct and selective update roots from recorded lock provenance  
       See: `../execution-tasks.md` → `DOTAI-010`  
       Depends on: `DOTAI-006`, `DOTAI-009`

- [x] `DOTAI-011` — Prove rollback keeps filesystem and lock state synchronized across uninstall and update failures  
       See: `../execution-tasks.md` → `DOTAI-011`  
       Depends on: `DOTAI-010`

### Stream 4: CLI UX Hardening and Verification

- [x] `DOTAI-012` — Add prompt fallback for uninstall and update without leaking hidden or ineligible selections  
       See: `../execution-tasks.md` → `DOTAI-012`  
       Depends on: `DOTAI-008`, `DOTAI-010`

- [x] `DOTAI-013` — Normalize renderer output across success, warning, blocked, failure, and no-op cases  
       See: `../execution-tasks.md` → `DOTAI-013`  
       Depends on: `DOTAI-007`, `DOTAI-008`, `DOTAI-010`

- [x] `DOTAI-014` — Replace placeholder verification with Vitest and `@effect/vitest` automated coverage  
       See: `../execution-tasks.md` → `DOTAI-014`  
       Depends on: `DOTAI-011`, `DOTAI-012`, `DOTAI-013`

## Project Completion Criteria

Do not consider the overall implementation complete until:

- [x] all `DOTAI-001` through `DOTAI-014` tasks are complete
- [x] all acceptance criteria in `../execution-tasks.md` are satisfied
- [x] the implementation still matches `../technical-design.md`
- [x] the implementation still matches `../execution-plan.md`
- [x] all automated tests run through Vitest + `@effect/vitest`
- [x] `bun run check` passes
