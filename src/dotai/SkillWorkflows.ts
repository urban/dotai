import type { PlatformError } from "effect/PlatformError";
import { Context, Effect, Layer } from "effect";

import type {
  DiscoverWorkflowInput,
  DiscoverWorkflowResult,
  InstallWorkflowInput,
  InstallWorkflowResult,
  ListWorkflowInput,
  ListWorkflowResult,
  UninstallWorkflowInput,
  UninstallWorkflowResult,
  UpdateWorkflowInput,
  UpdateWorkflowResult,
} from "./domain";
import {
  DependencyCycleDetectedError,
  DependencySkillNotFoundError,
  DependencySourceResolutionError,
  DiscoveryRootNotFoundError,
  InvalidSourceLocatorError,
  LockfileParseError,
  LockfileWriteError,
  MutationExecutionError,
  RequestedSkillNotFoundError,
  SkillManifestInvalidError,
  SourceMaterializationFailedError,
  UninstallRollbackError,
  UpdateLockfileRollbackError,
  UpdateMutationRollbackError,
  UpdateProvenanceNotFoundError,
  UpdateSourceRefreshError,
} from "./domain";
import { DependencyPlanner } from "./DependencyPlanner";
import { LockfileStore } from "./LockfileStore";
import { MissingHomeDirectoryError, RuntimeDirectories } from "./RuntimeDirectories";
import { SkillCatalog } from "./SkillCatalog";
import { SourceWorkspace } from "./SourceWorkspace";
import { TargetPaths } from "./TargetPaths";
import { MutationExecutor } from "./MutationExecutor";

export class SkillWorkflows extends Context.Service<
  SkillWorkflows,
  {
    readonly list: (
      input: ListWorkflowInput,
    ) => Effect.Effect<
      ListWorkflowResult,
      | PlatformError
      | MissingHomeDirectoryError
      | DiscoveryRootNotFoundError
      | SkillManifestInvalidError
    >;
    readonly discover: (
      input: DiscoverWorkflowInput,
    ) => Effect.Effect<
      DiscoverWorkflowResult,
      | PlatformError
      | MissingHomeDirectoryError
      | DiscoveryRootNotFoundError
      | InvalidSourceLocatorError
      | SkillManifestInvalidError
      | SourceMaterializationFailedError
    >;
    readonly install: (
      input: InstallWorkflowInput,
    ) => Effect.Effect<
      InstallWorkflowResult,
      | PlatformError
      | MissingHomeDirectoryError
      | DiscoveryRootNotFoundError
      | InvalidSourceLocatorError
      | SkillManifestInvalidError
      | SourceMaterializationFailedError
      | RequestedSkillNotFoundError
      | DependencySkillNotFoundError
      | DependencySourceResolutionError
      | DependencyCycleDetectedError
      | MutationExecutionError
      | LockfileParseError
      | LockfileWriteError
    >;
    readonly uninstall: (
      input: UninstallWorkflowInput,
    ) => Effect.Effect<
      UninstallWorkflowResult,
      | PlatformError
      | MissingHomeDirectoryError
      | DiscoveryRootNotFoundError
      | SkillManifestInvalidError
      | LockfileParseError
      | MutationExecutionError
      | UninstallRollbackError
      | LockfileWriteError
    >;
    readonly update: (
      input: UpdateWorkflowInput,
    ) => Effect.Effect<
      UpdateWorkflowResult,
      | PlatformError
      | MissingHomeDirectoryError
      | DiscoveryRootNotFoundError
      | InvalidSourceLocatorError
      | SkillManifestInvalidError
      | SourceMaterializationFailedError
      | RequestedSkillNotFoundError
      | DependencySkillNotFoundError
      | DependencySourceResolutionError
      | DependencyCycleDetectedError
      | MutationExecutionError
      | LockfileParseError
      | LockfileWriteError
      | UpdateMutationRollbackError
      | UpdateLockfileRollbackError
      | UpdateProvenanceNotFoundError
      | UpdateSourceRefreshError
    >;
  }
>()("dotai/SkillWorkflows") {
  static readonly layer = Layer.effect(
    SkillWorkflows,
    Effect.gen(function* () {
      const lockfileStore = yield* LockfileStore;
      const dependencyPlanner = yield* DependencyPlanner;
      const mutationExecutor = yield* MutationExecutor;
      const targetPaths = yield* TargetPaths;
      const skillCatalog = yield* SkillCatalog;
      const sourceWorkspace = yield* SourceWorkspace;

      const toUninstallRollbackError = (error: LockfileWriteError): UninstallRollbackError =>
        new UninstallRollbackError({
          lockfilePath: error.lockfilePath,
          reason: error.reason,
        });

      const toUpdateMutationRollbackError = (
        error: MutationExecutionError,
      ): UpdateMutationRollbackError =>
        new UpdateMutationRollbackError({
          path: error.path,
          reason: error.reason,
        });

      const toUpdateLockfileRollbackError = (
        error: LockfileWriteError,
      ): UpdateLockfileRollbackError =>
        new UpdateLockfileRollbackError({
          lockfilePath: error.lockfilePath,
          reason: error.reason,
        });

      const formatAlreadyDirectInstallReason = (requestedSkills: ReadonlyArray<string>): string => {
        const quotedSkillNames = requestedSkills.map((skillName) => `'${skillName}'`);

        return requestedSkills.length === 1
          ? `Skill ${quotedSkillNames[0]} is already installed directly.`
          : `Skills ${quotedSkillNames.join(", ")} are already installed directly.`;
      };

      const list = Effect.fn("SkillWorkflows.list")(function* (
        input: ListWorkflowInput,
      ): Effect.fn.Return<
        ListWorkflowResult,
        | PlatformError
        | MissingHomeDirectoryError
        | DiscoveryRootNotFoundError
        | SkillManifestInvalidError
      > {
        const target = yield* targetPaths.resolve(input);
        const installedSkills = yield* skillCatalog.listInstalledSkills(target.skillsPath);
        const result: ListWorkflowResult = {
          _tag: "ListWorkflowResult",
          target,
          installedSkills,
        };

        return result;
      });

      const discover = Effect.fn("SkillWorkflows.discover")(function* (
        input: DiscoverWorkflowInput,
      ): Effect.fn.Return<
        DiscoverWorkflowResult,
        | PlatformError
        | MissingHomeDirectoryError
        | DiscoveryRootNotFoundError
        | InvalidSourceLocatorError
        | SkillManifestInvalidError
        | SourceMaterializationFailedError
      > {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const target = yield* targetPaths.resolve(input);
            const stagedSource = yield* sourceWorkspace.stage(input.source);
            const inventory = yield* skillCatalog.discoverSourceSkills(
              stagedSource.selectionPath,
              stagedSource.normalizedSource,
            );

            const result: DiscoverWorkflowResult = {
              _tag: "DiscoverWorkflowResult",
              allSkills: inventory.allSkills,
              source: stagedSource,
              target,
              visibleSkills: inventory.visibleSkills,
            };

            return result;
          }),
        );
      });

      const install = Effect.fn("SkillWorkflows.install")(function* (
        input: InstallWorkflowInput,
      ): Effect.fn.Return<
        InstallWorkflowResult,
        | PlatformError
        | MissingHomeDirectoryError
        | DiscoveryRootNotFoundError
        | InvalidSourceLocatorError
        | SkillManifestInvalidError
        | SourceMaterializationFailedError
        | RequestedSkillNotFoundError
        | DependencySkillNotFoundError
        | DependencySourceResolutionError
        | DependencyCycleDetectedError
        | MutationExecutionError
        | LockfileParseError
        | LockfileWriteError
      > {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const target = yield* targetPaths.resolve(input);
            const stagedSource = yield* sourceWorkspace.stage(input.source);
            const inventory = yield* skillCatalog.discoverSourceSkills(
              stagedSource.selectionPath,
              stagedSource.normalizedSource,
            );
            const currentLockfile = yield* lockfileStore.read(target.lockfilePath);
            const installPlan = yield* dependencyPlanner.planInstall(
              currentLockfile,
              input.requestedSkillNames,
              {
                inventory,
                stagedSource,
              },
            );

            if (
              installPlan.skillsToInstall.length === 0 &&
              installPlan.directSkillsInstalled.length === 0
            ) {
              const result: InstallWorkflowResult = {
                _tag: "InstallWorkflowNoopResult",
                lockfilePath: target.lockfilePath,
                reason: formatAlreadyDirectInstallReason(installPlan.alreadyDirectSkills),
                requestedSkills: installPlan.alreadyDirectSkills,
                source: stagedSource,
                target,
              };

              return result;
            }

            const copiedSkillNames: Array<string> = [];

            const rollbackCopiedSkills = () =>
              Effect.forEach(
                [...copiedSkillNames].reverse(),
                (skillName) =>
                  mutationExecutor
                    .removeSkill(target, skillName)
                    .pipe(Effect.catch(() => Effect.void)),
                {
                  discard: true,
                },
              );

            yield* Effect.forEach(
              installPlan.skillsToInstall,
              (plannedSkill) =>
                mutationExecutor
                  .installSkill(target, plannedSkill.skill)
                  .pipe(
                    Effect.tap(() =>
                      Effect.sync(() => copiedSkillNames.push(plannedSkill.skill.skillName)),
                    ),
                  ),
              {
                discard: true,
              },
            ).pipe(
              Effect.catch((error) =>
                rollbackCopiedSkills().pipe(Effect.andThen(Effect.fail(error))),
              ),
            );

            yield* lockfileStore
              .write(target.lockfilePath, installPlan.nextLockfile)
              .pipe(
                Effect.catch((error) =>
                  rollbackCopiedSkills().pipe(Effect.andThen(Effect.fail(error))),
                ),
              );

            const result: InstallWorkflowResult = {
              _tag: "InstallWorkflowResult",
              alreadyDirectSkills: installPlan.alreadyDirectSkills,
              dependencySkillsInstalled: installPlan.dependencySkillsInstalled,
              directSkillsInstalled: installPlan.directSkillsInstalled,
              lockfilePath: target.lockfilePath,
              source: stagedSource,
              target,
            };

            return result;
          }),
        );
      });

      const uninstall = Effect.fn("SkillWorkflows.uninstall")(function* (
        input: UninstallWorkflowInput,
      ): Effect.fn.Return<
        UninstallWorkflowResult,
        | PlatformError
        | MissingHomeDirectoryError
        | DiscoveryRootNotFoundError
        | SkillManifestInvalidError
        | LockfileParseError
        | MutationExecutionError
        | UninstallRollbackError
        | LockfileWriteError
      > {
        const target = yield* targetPaths.resolve(input);
        const installedSkills = yield* skillCatalog.discoverInstalledSkills(target.skillsPath);
        const currentLockfile = yield* lockfileStore.read(target.lockfilePath);
        const uninstallPlan = yield* dependencyPlanner.planUninstall(
          currentLockfile,
          input.requestedSkillName,
          installedSkills,
        );

        switch (uninstallPlan._tag) {
          case "UninstallPlanBlocked":
            return {
              _tag: "UninstallWorkflowBlockedResult",
              blockingSkills: uninstallPlan.blockingSkills,
              lockfilePath: target.lockfilePath,
              requestedSkill: uninstallPlan.requestedSkillName,
              target,
            };
          case "UninstallPlanNoop":
            return {
              _tag: "UninstallWorkflowNoopResult",
              lockfilePath: target.lockfilePath,
              reason: uninstallPlan.reason,
              requestedSkill: uninstallPlan.requestedSkillName,
              target,
            };
          case "UninstallPlanReady":
            const rollbackThenFailLockWrite = (
              error: PlatformError | LockfileWriteError,
            ): Effect.Effect<
              void,
              PlatformError | MutationExecutionError | UninstallRollbackError
            > =>
              Effect.gen(function* () {
                yield* mutationExecutor.rollbackStagedSkillRemoval(
                  target,
                  uninstallPlan.requestedSkillName,
                );

                if (error._tag === "LockfileWriteError") {
                  return yield* toUninstallRollbackError(error);
                }

                return yield* error;
              });

            yield* mutationExecutor.stageSkillRemoval(target, uninstallPlan.requestedSkillName);

            yield* lockfileStore.write(target.lockfilePath, uninstallPlan.nextLockfile).pipe(
              Effect.matchEffect({
                onFailure: rollbackThenFailLockWrite,
                onSuccess: () => Effect.void,
              }),
            );

            yield* mutationExecutor
              .commitStagedSkillRemoval(target, uninstallPlan.requestedSkillName)
              .pipe(Effect.catch(() => Effect.void));

            return {
              _tag: "UninstallWorkflowResult",
              lockfilePath: target.lockfilePath,
              pruneCandidates: uninstallPlan.pruneCandidates,
              removedSkill: uninstallPlan.requestedSkillName,
              target,
            };
          default: {
            const _exhaustive: never = uninstallPlan;

            return _exhaustive;
          }
        }
      });

      const update = Effect.fn("SkillWorkflows.update")(function* (
        input: UpdateWorkflowInput,
      ): Effect.fn.Return<
        UpdateWorkflowResult,
        | PlatformError
        | MissingHomeDirectoryError
        | DiscoveryRootNotFoundError
        | InvalidSourceLocatorError
        | SkillManifestInvalidError
        | SourceMaterializationFailedError
        | RequestedSkillNotFoundError
        | DependencySkillNotFoundError
        | DependencySourceResolutionError
        | DependencyCycleDetectedError
        | MutationExecutionError
        | LockfileParseError
        | LockfileWriteError
        | UpdateMutationRollbackError
        | UpdateLockfileRollbackError
        | UpdateProvenanceNotFoundError
        | UpdateSourceRefreshError
      > {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const target = yield* targetPaths.resolve(input);
            const installedSkills = yield* skillCatalog.discoverInstalledSkills(target.skillsPath);
            const installedSkillNames = new Set(
              installedSkills.map((installedSkill) => installedSkill.skillName),
            );
            const currentLockfile = yield* lockfileStore.read(target.lockfilePath);
            const updatePlan = yield* dependencyPlanner.planUpdate(
              currentLockfile,
              input.requestedSkillName,
            );

            if (updatePlan._tag === "UpdatePlanNoop") {
              const result: UpdateWorkflowResult = {
                _tag: "UpdateWorkflowNoopResult",
                lockfilePath: target.lockfilePath,
                reason: updatePlan.reason,
                ...(input.requestedSkillName === undefined
                  ? {}
                  : { requestedSkillName: input.requestedSkillName }),
                target,
              };

              return result;
            }

            const stagedSkillNames: Array<string> = [];
            const installedSkillNamesDuringUpdate: Array<string> = [];

            const rollbackUpdatedSkills = () =>
              Effect.forEach(
                [...installedSkillNamesDuringUpdate].reverse(),
                (skillName) => mutationExecutor.removeSkill(target, skillName),
                {
                  discard: true,
                },
              ).pipe(
                Effect.andThen(
                  Effect.forEach(
                    [...stagedSkillNames].reverse(),
                    (skillName) => mutationExecutor.rollbackStagedSkillRemoval(target, skillName),
                    {
                      discard: true,
                    },
                  ),
                ),
              );

            const rollbackThenFailUpdateMutation = (
              error: MutationExecutionError | PlatformError,
            ): Effect.Effect<
              void,
              PlatformError | MutationExecutionError | UpdateMutationRollbackError
            > =>
              Effect.gen(function* () {
                yield* rollbackUpdatedSkills();

                if (error._tag === "MutationExecutionError") {
                  return yield* toUpdateMutationRollbackError(error);
                }

                return yield* error;
              });

            const rollbackThenFailUpdateLockfile = (
              error: LockfileWriteError | PlatformError,
            ): Effect.Effect<
              void,
              PlatformError | MutationExecutionError | UpdateLockfileRollbackError
            > =>
              Effect.gen(function* () {
                yield* rollbackUpdatedSkills();

                if (error._tag === "LockfileWriteError") {
                  return yield* toUpdateLockfileRollbackError(error);
                }

                return yield* error;
              });

            yield* Effect.forEach(
              updatePlan.skillsToRefresh,
              (skill) =>
                installedSkillNames.has(skill.skillName)
                  ? mutationExecutor
                      .stageSkillRemoval(target, skill.skillName)
                      .pipe(
                        Effect.tap(() => Effect.sync(() => stagedSkillNames.push(skill.skillName))),
                      )
                  : Effect.void,
              {
                discard: true,
              },
            ).pipe(
              Effect.matchEffect({
                onFailure: (error) =>
                  stagedSkillNames.length === 0 && installedSkillNamesDuringUpdate.length === 0
                    ? Effect.fail(error)
                    : rollbackThenFailUpdateMutation(error),
                onSuccess: () => Effect.void,
              }),
            );

            yield* Effect.forEach(
              updatePlan.skillsToRefresh,
              (skill) =>
                mutationExecutor
                  .installSkill(target, skill)
                  .pipe(
                    Effect.tap(() =>
                      Effect.sync(() => installedSkillNamesDuringUpdate.push(skill.skillName)),
                    ),
                  ),
              {
                discard: true,
              },
            ).pipe(
              Effect.matchEffect({
                onFailure: rollbackThenFailUpdateMutation,
                onSuccess: () => Effect.void,
              }),
            );

            yield* lockfileStore.write(target.lockfilePath, updatePlan.nextLockfile).pipe(
              Effect.matchEffect({
                onFailure: rollbackThenFailUpdateLockfile,
                onSuccess: () => Effect.void,
              }),
            );

            yield* Effect.forEach(
              stagedSkillNames,
              (skillName) =>
                mutationExecutor
                  .commitStagedSkillRemoval(target, skillName)
                  .pipe(Effect.catch(() => Effect.void)),
              {
                discard: true,
              },
            );

            const result: UpdateWorkflowResult = {
              _tag: "UpdateWorkflowResult",
              dependencySkillsUpdated: updatePlan.dependencySkillsUpdated,
              lockfilePath: target.lockfilePath,
              target,
              updatedSkills: updatePlan.updatedSkills,
            };

            return result;
          }),
        );
      });

      return SkillWorkflows.of({
        discover,
        install,
        list,
        uninstall,
        update,
      });
    }),
  );
}

export interface MainLayerOptions {
  readonly lockfileStoreLayer?: Layer.Layer<LockfileStore, never>;
  readonly mutationExecutorLayer?: Layer.Layer<MutationExecutor, never>;
}

const makeServiceLayer = (
  runtimeDirectoriesLayer: Layer.Layer<RuntimeDirectories, never>,
  options?: MainLayerOptions,
) => {
  const baseLayer = Layer.mergeAll(
    TargetPaths.layer.pipe(Layer.provide(runtimeDirectoriesLayer)),
    SourceWorkspace.layer.pipe(Layer.provide(runtimeDirectoriesLayer)),
    SkillCatalog.layer,
    options?.mutationExecutorLayer ?? MutationExecutor.layer,
    options?.lockfileStoreLayer ?? LockfileStore.layer,
  );

  return Layer.mergeAll(baseLayer, DependencyPlanner.layer.pipe(Layer.provide(baseLayer)));
};

export const makeMainLayer = (
  runtimeDirectoriesLayer: Layer.Layer<RuntimeDirectories, never>,
  options?: MainLayerOptions,
) => {
  const serviceLayer = makeServiceLayer(runtimeDirectoriesLayer, options);

  return Layer.mergeAll(serviceLayer, SkillWorkflows.layer.pipe(Layer.provide(serviceLayer)));
};

export const MainLayer = makeMainLayer(RuntimeDirectories.layer);
