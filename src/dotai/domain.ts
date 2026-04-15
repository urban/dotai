import { Runtime, Schema } from "effect";

export const ListWorkflowInput = Schema.Struct({
  global: Schema.Boolean,
});

export type ListWorkflowInput = Schema.Schema.Type<typeof ListWorkflowInput>;

export const DiscoverWorkflowInput = Schema.Struct({
  global: Schema.Boolean,
  source: Schema.String,
});

export type DiscoverWorkflowInput = Schema.Schema.Type<typeof DiscoverWorkflowInput>;

export const InstallWorkflowInput = Schema.Struct({
  global: Schema.Boolean,
  requestedSkillNames: Schema.NonEmptyArray(Schema.String),
  source: Schema.String,
});

export type InstallWorkflowInput = Schema.Schema.Type<typeof InstallWorkflowInput>;

export const UninstallWorkflowInput = Schema.Struct({
  global: Schema.Boolean,
  requestedSkillName: Schema.String,
});

export type UninstallWorkflowInput = Schema.Schema.Type<typeof UninstallWorkflowInput>;

export const UpdateWorkflowInput = Schema.Struct({
  global: Schema.Boolean,
  requestedSkillName: Schema.optional(Schema.String),
});

export type UpdateWorkflowInput = Schema.Schema.Type<typeof UpdateWorkflowInput>;

export interface ResolvedTarget {
  readonly targetKind: "local" | "global";
  readonly rootPath: string;
  readonly skillsPath: string;
  readonly lockfilePath: string;
  readonly stagingPath: string;
}

export interface ListWorkflowResult {
  readonly _tag: "ListWorkflowResult";
  readonly target: ResolvedTarget;
  readonly installedSkills: ReadonlyArray<string>;
}

export interface LocalSource {
  readonly _tag: "LocalSource";
  readonly filepath: string;
}

export interface GitSource {
  readonly _tag: "GitSource";
  readonly URL: string;
  readonly ref?: string;
  readonly subpath?: string;
}

export type NormalizedSource = LocalSource | GitSource;

export interface StagedSource {
  readonly sourceLocator: string;
  readonly normalizedSource: NormalizedSource;
  readonly workspacePath: string;
  readonly namespacePath: string;
  readonly selectionPath: string;
}

export interface SkillManifest {
  readonly name: string;
  readonly description: string;
  readonly metadata: {
    readonly dependencies: ReadonlyArray<string>;
    readonly internal: boolean;
  };
}

export interface DiscoveredSkill {
  readonly skillName: string;
  readonly skillPath: string;
  readonly manifest: SkillManifest;
  readonly source: NormalizedSource;
}

export interface SourceInventory {
  readonly allSkills: ReadonlyArray<DiscoveredSkill>;
  readonly visibleSkills: ReadonlyArray<DiscoveredSkill>;
}

export interface DiscoverWorkflowResult {
  readonly _tag: "DiscoverWorkflowResult";
  readonly target: ResolvedTarget;
  readonly source: StagedSource;
  readonly visibleSkills: ReadonlyArray<DiscoveredSkill>;
  readonly allSkills: ReadonlyArray<DiscoveredSkill>;
}

export interface InstalledSkill {
  readonly skillName: string;
  readonly skillPath: string;
  readonly manifest: SkillManifest;
}

export interface InstallWorkflowSuccessResult {
  readonly _tag: "InstallWorkflowResult";
  readonly alreadyDirectSkills: ReadonlyArray<string>;
  readonly dependencySkillsInstalled: ReadonlyArray<string>;
  readonly directSkillsInstalled: ReadonlyArray<string>;
  readonly lockfilePath: string;
  readonly source: StagedSource;
  readonly target: ResolvedTarget;
}

export interface InstallWorkflowNoopResult {
  readonly _tag: "InstallWorkflowNoopResult";
  readonly lockfilePath: string;
  readonly reason: string;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly source: StagedSource;
  readonly target: ResolvedTarget;
}

export type InstallWorkflowResult = InstallWorkflowSuccessResult | InstallWorkflowNoopResult;

export interface UninstallWorkflowBlockedResult {
  readonly _tag: "UninstallWorkflowBlockedResult";
  readonly blockingSkills: ReadonlyArray<string>;
  readonly lockfilePath: string;
  readonly requestedSkill: string;
  readonly target: ResolvedTarget;
}

export interface UninstallWorkflowSuccessResult {
  readonly _tag: "UninstallWorkflowResult";
  readonly lockfilePath: string;
  readonly pruneCandidates: ReadonlyArray<string>;
  readonly removedSkill: string;
  readonly target: ResolvedTarget;
}

export interface UninstallWorkflowNoopResult {
  readonly _tag: "UninstallWorkflowNoopResult";
  readonly lockfilePath: string;
  readonly reason: string;
  readonly requestedSkill: string;
  readonly target: ResolvedTarget;
}

export type UninstallWorkflowResult =
  | UninstallWorkflowBlockedResult
  | UninstallWorkflowSuccessResult
  | UninstallWorkflowNoopResult;

export interface UpdateWorkflowSuccessResult {
  readonly _tag: "UpdateWorkflowResult";
  readonly dependencySkillsUpdated: ReadonlyArray<string>;
  readonly lockfilePath: string;
  readonly target: ResolvedTarget;
  readonly updatedSkills: ReadonlyArray<string>;
}

export interface UpdateWorkflowNoopResult {
  readonly _tag: "UpdateWorkflowNoopResult";
  readonly lockfilePath: string;
  readonly reason: string;
  readonly requestedSkillName?: string;
  readonly target: ResolvedTarget;
}

export type UpdateWorkflowResult = UpdateWorkflowSuccessResult | UpdateWorkflowNoopResult;

export interface InstallPlanStep {
  readonly skill: DiscoveredSkill;
}

export interface InstallPlan {
  readonly alreadyDirectSkills: ReadonlyArray<string>;
  readonly dependencySkillsInstalled: ReadonlyArray<string>;
  readonly directSkillsInstalled: ReadonlyArray<string>;
  readonly skillsToInstall: ReadonlyArray<InstallPlanStep>;
  readonly nextLockfile: DotaiLockfile;
}

export interface UninstallPlanBlocked {
  readonly _tag: "UninstallPlanBlocked";
  readonly blockingSkills: ReadonlyArray<string>;
  readonly requestedSkillName: string;
}

export interface UninstallPlanReady {
  readonly _tag: "UninstallPlanReady";
  readonly nextLockfile: DotaiLockfile;
  readonly pruneCandidates: ReadonlyArray<string>;
  readonly requestedSkillName: string;
}

export interface UninstallPlanNoop {
  readonly _tag: "UninstallPlanNoop";
  readonly reason: string;
  readonly requestedSkillName: string;
}

export type UninstallPlan = UninstallPlanBlocked | UninstallPlanReady | UninstallPlanNoop;

export interface UpdatePlanReady {
  readonly _tag: "UpdatePlanReady";
  readonly dependencySkillsUpdated: ReadonlyArray<string>;
  readonly nextLockfile: DotaiLockfile;
  readonly skillsToRefresh: ReadonlyArray<DiscoveredSkill>;
  readonly updatedSkills: ReadonlyArray<string>;
}

export interface UpdatePlanNoop {
  readonly _tag: "UpdatePlanNoop";
  readonly reason: string;
  readonly requestedSkillName?: string;
}

export type UpdatePlan = UpdatePlanReady | UpdatePlanNoop;

export interface RuntimeDirectoryConfig {
  readonly currentWorkingDirectory: string;
  readonly homeDirectory: string;
}

export class InvalidSourceLocatorError extends Schema.TaggedErrorClass<InvalidSourceLocatorError>()(
  "InvalidSourceLocatorError",
  {
    reason: Schema.String,
    source: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class SourceMaterializationFailedError extends Schema.TaggedErrorClass<SourceMaterializationFailedError>()(
  "SourceMaterializationFailedError",
  {
    reason: Schema.String,
    source: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class DiscoveryRootNotFoundError extends Schema.TaggedErrorClass<DiscoveryRootNotFoundError>()(
  "DiscoveryRootNotFoundError",
  {
    path: Schema.String,
    source: Schema.optional(Schema.String),
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class SkillManifestInvalidError extends Schema.TaggedErrorClass<SkillManifestInvalidError>()(
  "SkillManifestInvalidError",
  {
    manifestPath: Schema.String,
    reason: Schema.String,
    source: Schema.optional(Schema.String),
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class RequestedSkillNotFoundError extends Schema.TaggedErrorClass<RequestedSkillNotFoundError>()(
  "RequestedSkillNotFoundError",
  {
    skillName: Schema.String,
    source: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class DependencySkillNotFoundError extends Schema.TaggedErrorClass<DependencySkillNotFoundError>()(
  "DependencySkillNotFoundError",
  {
    dependencyName: Schema.String,
    requiredBy: Schema.String,
    source: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class DependencySourceResolutionError extends Schema.TaggedErrorClass<DependencySourceResolutionError>()(
  "DependencySourceResolutionError",
  {
    dependencyLocator: Schema.String,
    reason: Schema.String,
    requiredBy: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class DependencyCycleDetectedError extends Schema.TaggedErrorClass<DependencyCycleDetectedError>()(
  "DependencyCycleDetectedError",
  {
    cyclePath: Schema.Array(Schema.String),
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export interface LockEntry {
  readonly requiredBy: ReadonlyArray<string>;
  readonly implicit?: true;
  readonly source: NormalizedSource;
}

export interface DotaiLockfile {
  readonly skills: Readonly<Record<string, LockEntry>>;
  readonly version: 1;
}

export class LockfileParseError extends Schema.TaggedErrorClass<LockfileParseError>()(
  "LockfileParseError",
  {
    lockfilePath: Schema.String,
    reason: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class LockfileWriteError extends Schema.TaggedErrorClass<LockfileWriteError>()(
  "LockfileWriteError",
  {
    lockfilePath: Schema.String,
    reason: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class MutationExecutionError extends Schema.TaggedErrorClass<MutationExecutionError>()(
  "MutationExecutionError",
  {
    path: Schema.String,
    reason: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class UninstallRollbackError extends Schema.TaggedErrorClass<UninstallRollbackError>()(
  "UninstallRollbackError",
  {
    lockfilePath: Schema.String,
    reason: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class UpdateMutationRollbackError extends Schema.TaggedErrorClass<UpdateMutationRollbackError>()(
  "UpdateMutationRollbackError",
  {
    path: Schema.optional(Schema.String),
    reason: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class UpdateLockfileRollbackError extends Schema.TaggedErrorClass<UpdateLockfileRollbackError>()(
  "UpdateLockfileRollbackError",
  {
    lockfilePath: Schema.String,
    reason: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class UpdateProvenanceNotFoundError extends Schema.TaggedErrorClass<UpdateProvenanceNotFoundError>()(
  "UpdateProvenanceNotFoundError",
  {
    reason: Schema.String,
    skillName: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}

export class UpdateSourceRefreshError extends Schema.TaggedErrorClass<UpdateSourceRefreshError>()(
  "UpdateSourceRefreshError",
  {
    reason: Schema.String,
    skillName: Schema.String,
    source: Schema.String,
  },
) {
  override readonly [Runtime.errorExitCode] = 1;
}
