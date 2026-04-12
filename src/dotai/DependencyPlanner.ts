import type { PlatformError } from "effect/PlatformError";
import type * as Scope from "effect/Scope";
import { Context, Effect, Layer } from "effect";

import type {
  DiscoveredSkill,
  DotaiLockfile,
  InstallPlan,
  InstallPlanStep,
  InstalledSkill,
  LockEntry,
  NormalizedSource,
  SourceInventory,
  StagedSource,
  UninstallPlan,
  UpdatePlan,
} from "./domain";
import {
  DependencyCycleDetectedError,
  DependencySkillNotFoundError,
  DependencySourceResolutionError,
  DiscoveryRootNotFoundError,
  InvalidSourceLocatorError,
  RequestedSkillNotFoundError,
  SkillManifestInvalidError,
  SourceMaterializationFailedError,
  UpdateProvenanceNotFoundError,
  UpdateSourceRefreshError,
} from "./domain";
import { SkillCatalog } from "./SkillCatalog";
import { SourceWorkspace } from "./SourceWorkspace";
import type { MissingHomeDirectoryError } from "./RuntimeDirectories";

interface MutablePlannedSkill {
  readonly skill: DiscoveredSkill;
  readonly requiredBy: Set<string>;
  implicit: boolean;
}

interface SourceContext {
  readonly inventory: SourceInventory;
  readonly stagedSource: StagedSource;
}

interface SkillVisitContext {
  readonly explicit: boolean;
  readonly sourceContext: SourceContext;
}

const toSortedReadonlyArray = (values: Set<string>): ReadonlyArray<string> =>
  Array.from(values).sort((left, right) => left.localeCompare(right));

const dedupeValues = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const dedupedValues: Array<string> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    dedupedValues.push(value);
  }

  return dedupedValues;
};

const isDependencySourceLocator = (value: string): boolean =>
  value.startsWith("./") ||
  value.startsWith("../") ||
  value.startsWith("/") ||
  value.startsWith("file:") ||
  value.startsWith("github:") ||
  value.startsWith("gitlab:") ||
  value.startsWith("git@") ||
  value.startsWith("ssh://") ||
  value.startsWith("http://") ||
  value.startsWith("https://") ||
  value.startsWith("git://") ||
  value.endsWith(".git");

const formatNormalizedSource = (source: NormalizedSource): string =>
  source._tag === "LocalSource"
    ? source.filepath
    : [
        source.URL,
        ...(source.ref === undefined ? [] : [`#${source.ref}`]),
        ...(source.subpath === undefined ? [] : [`::${source.subpath}`]),
      ].join("");

const makeSourceContextKey = (source: NormalizedSource): string =>
  source._tag === "LocalSource"
    ? `local:${source.filepath}`
    : `git:${source.URL}:${source.ref ?? ""}:${source.subpath ?? ""}`;

const makeSkillNodeKey = (skill: DiscoveredSkill): string =>
  `${makeSourceContextKey(skill.source)}::${skill.skillName}`;

const makeSkillNodeLabel = (skill: DiscoveredSkill): string =>
  `${skill.skillName} [${formatNormalizedSource(skill.source)}]`;

const mapDependencySourceFailure = (
  error:
    | PlatformError
    | MissingHomeDirectoryError
    | DiscoveryRootNotFoundError
    | InvalidSourceLocatorError
    | SkillManifestInvalidError
    | SourceMaterializationFailedError,
  dependencyLocator: string,
  requiredBy: string,
): DependencySourceResolutionError => {
  switch (error._tag) {
    case "PlatformError":
      return new DependencySourceResolutionError({
        dependencyLocator,
        reason: error.reason.message,
        requiredBy,
      });
    case "MissingHomeDirectoryError":
      return new DependencySourceResolutionError({
        dependencyLocator,
        reason: error.message,
        requiredBy,
      });
    case "InvalidSourceLocatorError":
      return new DependencySourceResolutionError({
        dependencyLocator,
        reason: error.reason,
        requiredBy,
      });
    case "DiscoveryRootNotFoundError":
      return new DependencySourceResolutionError({
        dependencyLocator,
        reason: `Path not found: ${error.path}`,
        requiredBy,
      });
    case "SkillManifestInvalidError":
      return new DependencySourceResolutionError({
        dependencyLocator,
        reason: `Invalid manifest: ${error.manifestPath} (${error.reason})`,
        requiredBy,
      });
    case "SourceMaterializationFailedError":
      return new DependencySourceResolutionError({
        dependencyLocator,
        reason: error.reason,
        requiredBy,
      });
    default: {
      const _exhaustive: never = error;

      return _exhaustive;
    }
  }
};

const selectDependencySkill = (
  sourceContext: SourceContext,
  dependencyLocator: string,
  requiredBy: string,
): { readonly skill: DiscoveredSkill } | { readonly reason: string } => {
  if (sourceContext.inventory.allSkills.length === 0) {
    return {
      reason: "Dependency source did not expose any skills at the selected root.",
    };
  }

  if (sourceContext.inventory.allSkills.length > 1) {
    return {
      reason: "Dependency source must resolve to exactly one skill at the selected root.",
    };
  }

  const [dependencySkill] = sourceContext.inventory.allSkills;

  if (dependencySkill === undefined) {
    return {
      reason: `Unable to resolve dependency '${dependencyLocator}' required by '${requiredBy}'.`,
    };
  }

  return {
    skill: dependencySkill,
  };
};

export class DependencyPlanner extends Context.Service<
  DependencyPlanner,
  {
    readonly planInstall: (
      currentLockfile: DotaiLockfile,
      requestedSkillNames: ReadonlyArray<string>,
      sourceContext: SourceContext,
    ) => Effect.Effect<
      InstallPlan,
      | PlatformError
      | MissingHomeDirectoryError
      | RequestedSkillNotFoundError
      | DependencyCycleDetectedError
      | DependencySkillNotFoundError
      | DependencySourceResolutionError
      | DiscoveryRootNotFoundError
      | InvalidSourceLocatorError
      | SkillManifestInvalidError
      | SourceMaterializationFailedError,
      Scope.Scope
    >;
    readonly planUninstall: (
      currentLockfile: DotaiLockfile,
      requestedSkillName: string,
      installedSkills: ReadonlyArray<InstalledSkill>,
    ) => Effect.Effect<UninstallPlan>;
    readonly planUpdate: (
      currentLockfile: DotaiLockfile,
      requestedSkillName?: string,
    ) => Effect.Effect<
      UpdatePlan,
      | PlatformError
      | MissingHomeDirectoryError
      | RequestedSkillNotFoundError
      | DependencyCycleDetectedError
      | DependencySkillNotFoundError
      | DependencySourceResolutionError
      | DiscoveryRootNotFoundError
      | InvalidSourceLocatorError
      | SkillManifestInvalidError
      | SourceMaterializationFailedError
      | UpdateProvenanceNotFoundError
      | UpdateSourceRefreshError,
      Scope.Scope
    >;
  }
>()("dotai/DependencyPlanner") {
  static readonly layer = Layer.effect(
    DependencyPlanner,
    Effect.gen(function* () {
      const skillCatalog = yield* SkillCatalog;
      const sourceWorkspace = yield* SourceWorkspace;

      const planInstall = Effect.fn("DependencyPlanner.planInstall")(function* (
        currentLockfile: DotaiLockfile,
        requestedSkillNames: ReadonlyArray<string>,
        rootSourceContext: SourceContext,
      ): Effect.fn.Return<
        InstallPlan,
        | PlatformError
        | MissingHomeDirectoryError
        | RequestedSkillNotFoundError
        | DependencyCycleDetectedError
        | DependencySkillNotFoundError
        | DependencySourceResolutionError
        | DiscoveryRootNotFoundError
        | InvalidSourceLocatorError
        | SkillManifestInvalidError
        | SourceMaterializationFailedError,
        Scope.Scope
      > {
        const visibleSkillsByName = new Map(
          rootSourceContext.inventory.visibleSkills.map(
            (skill) => [skill.skillName, skill] as const,
          ),
        );
        const requestedSkills: Array<DiscoveredSkill> = [];

        for (const requestedSkillName of dedupeValues(requestedSkillNames)) {
          const requestedSkill = visibleSkillsByName.get(requestedSkillName);

          if (requestedSkill === undefined) {
            return yield* new RequestedSkillNotFoundError({
              skillName: requestedSkillName,
              source: rootSourceContext.stagedSource.sourceLocator,
            });
          }

          requestedSkills.push(requestedSkill);
        }

        const requestedSkillNameSet = new Set(
          requestedSkills.map((requestedSkill) => requestedSkill.skillName),
        );
        const orderedNewSkills: Array<InstallPlanStep> = [];
        const plannedSkills = new Map<string, MutablePlannedSkill>();
        const sourceContextsByKey = new Map<string, SourceContext>([
          [
            makeSourceContextKey(rootSourceContext.stagedSource.normalizedSource),
            rootSourceContext,
          ],
        ]);
        const inProgressSkillKeys: Array<string> = [];
        const inProgressSkillLabels: Array<string> = [];
        const visitedSkillKeys = new Set<string>();

        const ensurePlannedSkill = (skill: DiscoveredSkill): MutablePlannedSkill => {
          const existingPlannedSkill = plannedSkills.get(skill.skillName);

          if (existingPlannedSkill !== undefined) {
            return existingPlannedSkill;
          }

          const existingLockEntry = currentLockfile.skills[skill.skillName];
          const plannedSkill: MutablePlannedSkill = {
            implicit: existingLockEntry?.implicit === true,
            requiredBy: new Set(existingLockEntry?.requiredBy ?? []),
            skill,
          };

          plannedSkills.set(skill.skillName, plannedSkill);

          return plannedSkill;
        };

        const loadSourceContext = Effect.fn("DependencyPlanner.loadSourceContext")(function* (
          dependencyLocator: string,
          requiredBy: string,
        ): Effect.fn.Return<
          SourceContext,
          | PlatformError
          | MissingHomeDirectoryError
          | DependencySourceResolutionError
          | DiscoveryRootNotFoundError
          | InvalidSourceLocatorError
          | SkillManifestInvalidError
          | SourceMaterializationFailedError,
          Scope.Scope
        > {
          const stagedSource = yield* sourceWorkspace
            .stage(dependencyLocator)
            .pipe(
              Effect.mapError((error) =>
                mapDependencySourceFailure(error, dependencyLocator, requiredBy),
              ),
            );
          const sourceContextKey = makeSourceContextKey(stagedSource.normalizedSource);
          const existingSourceContext = sourceContextsByKey.get(sourceContextKey);

          if (existingSourceContext !== undefined) {
            return existingSourceContext;
          }

          const inventory = yield* skillCatalog
            .discoverSourceSkills(stagedSource.selectionPath, stagedSource.normalizedSource)
            .pipe(
              Effect.mapError((error) =>
                mapDependencySourceFailure(error, dependencyLocator, requiredBy),
              ),
            );
          const sourceContext: SourceContext = {
            inventory,
            stagedSource,
          };

          sourceContextsByKey.set(sourceContextKey, sourceContext);

          return sourceContext;
        });

        const visit = Effect.fn("DependencyPlanner.visit")(function* (
          skill: DiscoveredSkill,
          context: SkillVisitContext,
        ): Effect.fn.Return<
          void,
          | PlatformError
          | MissingHomeDirectoryError
          | DependencyCycleDetectedError
          | DependencySkillNotFoundError
          | DependencySourceResolutionError
          | DiscoveryRootNotFoundError
          | InvalidSourceLocatorError
          | SkillManifestInvalidError
          | SourceMaterializationFailedError,
          Scope.Scope
        > {
          const skillNodeKey = makeSkillNodeKey(skill);
          const cycleStartIndex = inProgressSkillKeys.indexOf(skillNodeKey);

          if (cycleStartIndex !== -1) {
            return yield* new DependencyCycleDetectedError({
              cyclePath: [
                ...inProgressSkillLabels.slice(cycleStartIndex),
                makeSkillNodeLabel(skill),
              ],
            });
          }

          if (visitedSkillKeys.has(skillNodeKey)) {
            if (context.explicit) {
              ensurePlannedSkill(skill).implicit = false;
            }

            return;
          }

          inProgressSkillKeys.push(skillNodeKey);
          inProgressSkillLabels.push(makeSkillNodeLabel(skill));

          const plannedSkill = ensurePlannedSkill(skill);

          if (context.explicit) {
            plannedSkill.implicit = false;
          }

          for (const dependencyName of skill.manifest.metadata.dependencies) {
            const dependencySkill = yield* (function* (): Effect.fn.Return<
              DiscoveredSkill,
              | PlatformError
              | MissingHomeDirectoryError
              | DependencySkillNotFoundError
              | DependencySourceResolutionError
              | DiscoveryRootNotFoundError
              | InvalidSourceLocatorError
              | SkillManifestInvalidError
              | SourceMaterializationFailedError,
              Scope.Scope
            > {
              if (!isDependencySourceLocator(dependencyName)) {
                const allSkillsByName = new Map(
                  context.sourceContext.inventory.allSkills.map(
                    (dependencySkill) => [dependencySkill.skillName, dependencySkill] as const,
                  ),
                );
                const sameSourceDependency = allSkillsByName.get(dependencyName);

                if (sameSourceDependency === undefined) {
                  return yield* new DependencySkillNotFoundError({
                    dependencyName,
                    requiredBy: skill.skillName,
                    source: formatNormalizedSource(
                      context.sourceContext.stagedSource.normalizedSource,
                    ),
                  });
                }

                return sameSourceDependency;
              }

              const dependencySourceContext = yield* loadSourceContext(
                dependencyName,
                skill.skillName,
              );
              const selectedDependencySkill = selectDependencySkill(
                dependencySourceContext,
                dependencyName,
                skill.skillName,
              );

              if ("reason" in selectedDependencySkill) {
                return yield* new DependencySourceResolutionError({
                  dependencyLocator: dependencyName,
                  reason: selectedDependencySkill.reason,
                  requiredBy: skill.skillName,
                });
              }

              return selectedDependencySkill.skill;
            })();
            const plannedDependency = ensurePlannedSkill(dependencySkill);

            plannedDependency.requiredBy.add(skill.skillName);

            if (!(dependencySkill.skillName in currentLockfile.skills)) {
              plannedDependency.implicit = true;
            }

            const dependencySourceContextKey = makeSourceContextKey(dependencySkill.source);
            const dependencySourceContext = sourceContextsByKey.get(dependencySourceContextKey);

            if (dependencySourceContext === undefined) {
              return yield* new DependencySourceResolutionError({
                dependencyLocator: formatNormalizedSource(dependencySkill.source),
                reason: "Dependency source context was not available for planning.",
                requiredBy: skill.skillName,
              });
            }

            yield* visit(dependencySkill, {
              explicit: false,
              sourceContext: dependencySourceContext,
            });
          }

          inProgressSkillKeys.pop();
          inProgressSkillLabels.pop();
          visitedSkillKeys.add(skillNodeKey);

          if (!(skill.skillName in currentLockfile.skills)) {
            orderedNewSkills.push({
              skill,
            });
          }
        });

        for (const requestedSkill of requestedSkills) {
          yield* visit(requestedSkill, {
            explicit: true,
            sourceContext: rootSourceContext,
          });
        }

        const nextSkills = {
          ...currentLockfile.skills,
        };

        for (const [skillName, plannedSkill] of plannedSkills.entries()) {
          nextSkills[skillName] = {
            ...(plannedSkill.implicit ? { implicit: true } : {}),
            requiredBy: toSortedReadonlyArray(plannedSkill.requiredBy),
            source: plannedSkill.skill.source,
          };
        }

        return {
          alreadyDirectSkills: requestedSkills
            .map((requestedSkill) => requestedSkill.skillName)
            .filter((skillName) => {
              const existingLockEntry = currentLockfile.skills[skillName];

              return existingLockEntry !== undefined && existingLockEntry.implicit !== true;
            }),
          dependencySkillsInstalled: orderedNewSkills
            .map((step) => step.skill.skillName)
            .filter((skillName) => !requestedSkillNameSet.has(skillName)),
          directSkillsInstalled: requestedSkills
            .map((requestedSkill) => requestedSkill.skillName)
            .filter((skillName) => {
              const existingLockEntry = currentLockfile.skills[skillName];

              return existingLockEntry === undefined || existingLockEntry.implicit === true;
            }),
          nextLockfile: {
            skills: nextSkills,
            version: 1,
          },
          skillsToInstall: orderedNewSkills,
        };
      });

      const planUninstall = Effect.fn("DependencyPlanner.planUninstall")(function* (
        currentLockfile: DotaiLockfile,
        requestedSkillName: string,
        installedSkills: ReadonlyArray<InstalledSkill>,
      ): Effect.fn.Return<UninstallPlan> {
        yield* Effect.void;

        const installedSkillNames = new Set(
          installedSkills.map((installedSkill) => installedSkill.skillName),
        );
        const requestedSkillIsInstalled = installedSkillNames.has(requestedSkillName);

        if (!requestedSkillIsInstalled) {
          return {
            _tag: "UninstallPlanNoop",
            reason: `Skill '${requestedSkillName}' is not installed.`,
            requestedSkillName,
          };
        }

        const blockingSkills = new Set<string>();
        const requestedLockEntry = currentLockfile.skills[requestedSkillName];

        for (const blocker of requestedLockEntry?.requiredBy ?? []) {
          if (installedSkillNames.has(blocker)) {
            blockingSkills.add(blocker);
          }
        }

        for (const installedSkill of installedSkills) {
          if (installedSkill.skillName === requestedSkillName) {
            continue;
          }

          if (installedSkill.manifest.metadata.dependencies.includes(requestedSkillName)) {
            blockingSkills.add(installedSkill.skillName);
          }
        }

        if (blockingSkills.size > 0) {
          return {
            _tag: "UninstallPlanBlocked",
            blockingSkills: toSortedReadonlyArray(blockingSkills),
            requestedSkillName,
          };
        }

        const nextSkills: Record<string, LockEntry> = Object.fromEntries(
          Object.entries(currentLockfile.skills)
            .filter(([skillName]) => skillName !== requestedSkillName)
            .map(([skillName, entry]) => [
              skillName,
              {
                ...(entry.implicit === true ? { implicit: true } : {}),
                requiredBy: entry.requiredBy.filter(
                  (requiredBySkill) => requiredBySkill !== requestedSkillName,
                ),
                source: entry.source,
              },
            ]),
        );

        const pruneCandidates = Object.entries(nextSkills)
          .filter(([, entry]) => entry.implicit === true && entry.requiredBy.length === 0)
          .map(([skillName]) => skillName)
          .sort((left, right) => left.localeCompare(right));

        return {
          _tag: "UninstallPlanReady",
          nextLockfile: {
            skills: nextSkills,
            version: 1,
          },
          pruneCandidates,
          requestedSkillName,
        };
      });

      const planUpdate = Effect.fn("DependencyPlanner.planUpdate")(function* (
        currentLockfile: DotaiLockfile,
        requestedSkillName?: string,
      ): Effect.fn.Return<
        UpdatePlan,
        | PlatformError
        | MissingHomeDirectoryError
        | RequestedSkillNotFoundError
        | DependencyCycleDetectedError
        | DependencySkillNotFoundError
        | DependencySourceResolutionError
        | DiscoveryRootNotFoundError
        | InvalidSourceLocatorError
        | SkillManifestInvalidError
        | SourceMaterializationFailedError
        | UpdateProvenanceNotFoundError
        | UpdateSourceRefreshError,
        Scope.Scope
      > {
        const updateRootNames =
          requestedSkillName === undefined
            ? Object.entries(currentLockfile.skills)
                .filter(([, entry]) => entry.implicit !== true)
                .map(([skillName]) => skillName)
                .sort((left, right) => left.localeCompare(right))
            : [requestedSkillName];

        if (updateRootNames.length === 0) {
          return {
            _tag: "UpdatePlanNoop",
            reason: "No directly installed skills are recorded for update.",
          };
        }

        const sourceContextsByKey = new Map<string, SourceContext>();
        const refreshedSkills = new Map<string, MutablePlannedSkill>();
        const refreshedOrder: Array<string> = [];
        const refreshedGraphDependents = new Map<string, Set<string>>();
        const visitedSkillKeys = new Set<string>();
        const inProgressSkillKeys: Array<string> = [];
        const inProgressSkillLabels: Array<string> = [];
        const updateRootSet = new Set(updateRootNames);

        const ensureRefreshedSkill = (skill: DiscoveredSkill): MutablePlannedSkill => {
          const existingRefreshedSkill = refreshedSkills.get(skill.skillName);

          if (existingRefreshedSkill !== undefined) {
            return existingRefreshedSkill;
          }

          const existingLockEntry = currentLockfile.skills[skill.skillName];
          const refreshedSkill: MutablePlannedSkill = {
            implicit: existingLockEntry?.implicit === true,
            requiredBy: new Set(
              (existingLockEntry?.requiredBy ?? []).filter(
                (requiredBySkill) => !updateRootSet.has(requiredBySkill),
              ),
            ),
            skill,
          };

          refreshedSkills.set(skill.skillName, refreshedSkill);

          return refreshedSkill;
        };

        const addDependencyEdge = (skillName: string, requiredBy: string) => {
          const existingDependents = refreshedGraphDependents.get(skillName);

          if (existingDependents !== undefined) {
            existingDependents.add(requiredBy);
            return;
          }

          refreshedGraphDependents.set(skillName, new Set([requiredBy]));
        };

        const loadRootSourceContext = Effect.fn("DependencyPlanner.loadRootSourceContext")(
          function* (
            skillName: string,
          ): Effect.fn.Return<
            SourceContext,
            | PlatformError
            | MissingHomeDirectoryError
            | DiscoveryRootNotFoundError
            | InvalidSourceLocatorError
            | SkillManifestInvalidError
            | SourceMaterializationFailedError
            | UpdateProvenanceNotFoundError
            | UpdateSourceRefreshError,
            Scope.Scope
          > {
            const lockEntry = currentLockfile.skills[skillName];

            if (lockEntry === undefined) {
              return yield* new UpdateProvenanceNotFoundError({
                reason: "No recorded lock-file provenance is available for this skill.",
                skillName,
              });
            }

            const sourceLocator = formatNormalizedSource(lockEntry.source);
            const stagedSource = yield* sourceWorkspace.stage(sourceLocator).pipe(
              Effect.mapError((error) => {
                switch (error._tag) {
                  case "PlatformError":
                    return new UpdateSourceRefreshError({
                      reason: error.reason.message,
                      skillName,
                      source: sourceLocator,
                    });
                  case "MissingHomeDirectoryError":
                    return new UpdateSourceRefreshError({
                      reason: error.message,
                      skillName,
                      source: sourceLocator,
                    });
                  case "InvalidSourceLocatorError":
                    return new UpdateSourceRefreshError({
                      reason: error.reason,
                      skillName,
                      source: sourceLocator,
                    });
                  case "DiscoveryRootNotFoundError":
                    return new UpdateSourceRefreshError({
                      reason: `Path not found: ${error.path}`,
                      skillName,
                      source: sourceLocator,
                    });
                  case "SourceMaterializationFailedError":
                    return new UpdateSourceRefreshError({
                      reason: error.reason,
                      skillName,
                      source: sourceLocator,
                    });
                  default: {
                    const _exhaustive: never = error;

                    return _exhaustive;
                  }
                }
              }),
            );
            const sourceContextKey = makeSourceContextKey(stagedSource.normalizedSource);
            const existingSourceContext = sourceContextsByKey.get(sourceContextKey);

            if (existingSourceContext !== undefined) {
              return existingSourceContext;
            }

            const inventory = yield* skillCatalog
              .discoverSourceSkills(stagedSource.selectionPath, stagedSource.normalizedSource)
              .pipe(
                Effect.mapError((error) => {
                  switch (error._tag) {
                    case "PlatformError":
                      return new UpdateSourceRefreshError({
                        reason: error.reason.message,
                        skillName,
                        source: sourceLocator,
                      });
                    case "DiscoveryRootNotFoundError":
                      return new UpdateSourceRefreshError({
                        reason: `Path not found: ${error.path}`,
                        skillName,
                        source: sourceLocator,
                      });
                    case "SkillManifestInvalidError":
                      return new UpdateSourceRefreshError({
                        reason: `Invalid manifest: ${error.manifestPath} (${error.reason})`,
                        skillName,
                        source: sourceLocator,
                      });
                    default: {
                      const _exhaustive: never = error;

                      return _exhaustive;
                    }
                  }
                }),
              );
            const sourceContext: SourceContext = {
              inventory,
              stagedSource,
            };

            sourceContextsByKey.set(sourceContextKey, sourceContext);

            return sourceContext;
          },
        );

        const loadDependencySourceContext = Effect.fn(
          "DependencyPlanner.loadDependencySourceContext",
        )(function* (
          dependencyLocator: string,
          requiredBy: string,
        ): Effect.fn.Return<
          SourceContext,
          | PlatformError
          | MissingHomeDirectoryError
          | DependencySourceResolutionError
          | DiscoveryRootNotFoundError
          | InvalidSourceLocatorError
          | SkillManifestInvalidError
          | SourceMaterializationFailedError,
          Scope.Scope
        > {
          const stagedSource = yield* sourceWorkspace
            .stage(dependencyLocator)
            .pipe(
              Effect.mapError((error) =>
                mapDependencySourceFailure(error, dependencyLocator, requiredBy),
              ),
            );
          const sourceContextKey = makeSourceContextKey(stagedSource.normalizedSource);
          const existingSourceContext = sourceContextsByKey.get(sourceContextKey);

          if (existingSourceContext !== undefined) {
            return existingSourceContext;
          }

          const inventory = yield* skillCatalog
            .discoverSourceSkills(stagedSource.selectionPath, stagedSource.normalizedSource)
            .pipe(
              Effect.mapError((error) =>
                mapDependencySourceFailure(error, dependencyLocator, requiredBy),
              ),
            );
          const sourceContext: SourceContext = {
            inventory,
            stagedSource,
          };

          sourceContextsByKey.set(sourceContextKey, sourceContext);

          return sourceContext;
        });

        const visit = Effect.fn("DependencyPlanner.visitForUpdate")(function* (
          skill: DiscoveredSkill,
          context: SkillVisitContext,
        ): Effect.fn.Return<
          void,
          | PlatformError
          | MissingHomeDirectoryError
          | DependencyCycleDetectedError
          | DependencySkillNotFoundError
          | DependencySourceResolutionError
          | DiscoveryRootNotFoundError
          | InvalidSourceLocatorError
          | SkillManifestInvalidError
          | SourceMaterializationFailedError,
          Scope.Scope
        > {
          const skillNodeKey = makeSkillNodeKey(skill);
          const cycleStartIndex = inProgressSkillKeys.indexOf(skillNodeKey);

          if (cycleStartIndex !== -1) {
            return yield* new DependencyCycleDetectedError({
              cyclePath: [
                ...inProgressSkillLabels.slice(cycleStartIndex),
                makeSkillNodeLabel(skill),
              ],
            });
          }

          if (visitedSkillKeys.has(skillNodeKey)) {
            if (context.explicit) {
              ensureRefreshedSkill(skill).implicit = false;
            }

            return;
          }

          inProgressSkillKeys.push(skillNodeKey);
          inProgressSkillLabels.push(makeSkillNodeLabel(skill));

          const refreshedSkill = ensureRefreshedSkill(skill);

          if (context.explicit) {
            refreshedSkill.implicit = false;
          }

          for (const dependencyName of skill.manifest.metadata.dependencies) {
            const dependencySkill = yield* (function* (): Effect.fn.Return<
              DiscoveredSkill,
              | PlatformError
              | MissingHomeDirectoryError
              | DependencySkillNotFoundError
              | DependencySourceResolutionError
              | DiscoveryRootNotFoundError
              | InvalidSourceLocatorError
              | SkillManifestInvalidError
              | SourceMaterializationFailedError,
              Scope.Scope
            > {
              if (!isDependencySourceLocator(dependencyName)) {
                const allSkillsByName = new Map(
                  context.sourceContext.inventory.allSkills.map(
                    (dependencySkill) => [dependencySkill.skillName, dependencySkill] as const,
                  ),
                );
                const sameSourceDependency = allSkillsByName.get(dependencyName);

                if (sameSourceDependency === undefined) {
                  return yield* new DependencySkillNotFoundError({
                    dependencyName,
                    requiredBy: skill.skillName,
                    source: formatNormalizedSource(
                      context.sourceContext.stagedSource.normalizedSource,
                    ),
                  });
                }

                return sameSourceDependency;
              }

              const dependencySourceContext = yield* loadDependencySourceContext(
                dependencyName,
                skill.skillName,
              );
              const selectedDependencySkill = selectDependencySkill(
                dependencySourceContext,
                dependencyName,
                skill.skillName,
              );

              if ("reason" in selectedDependencySkill) {
                return yield* new DependencySourceResolutionError({
                  dependencyLocator: dependencyName,
                  reason: selectedDependencySkill.reason,
                  requiredBy: skill.skillName,
                });
              }

              return selectedDependencySkill.skill;
            })();

            addDependencyEdge(dependencySkill.skillName, skill.skillName);

            const plannedDependency = ensureRefreshedSkill(dependencySkill);

            if (!(dependencySkill.skillName in currentLockfile.skills)) {
              plannedDependency.implicit = true;
            }

            const dependencySourceContextKey = makeSourceContextKey(dependencySkill.source);
            const dependencySourceContext = sourceContextsByKey.get(dependencySourceContextKey);

            if (dependencySourceContext === undefined) {
              return yield* new DependencySourceResolutionError({
                dependencyLocator: formatNormalizedSource(dependencySkill.source),
                reason: "Dependency source context was not available for planning.",
                requiredBy: skill.skillName,
              });
            }

            yield* visit(dependencySkill, {
              explicit: false,
              sourceContext: dependencySourceContext,
            });
          }

          inProgressSkillKeys.pop();
          inProgressSkillLabels.pop();
          visitedSkillKeys.add(skillNodeKey);
          refreshedOrder.push(skill.skillName);
        });

        for (const rootSkillName of updateRootNames) {
          const rootSourceContext = yield* loadRootSourceContext(rootSkillName);
          const visibleSkillsByName = new Map(
            rootSourceContext.inventory.visibleSkills.map(
              (skill) => [skill.skillName, skill] as const,
            ),
          );
          const requestedSkill = visibleSkillsByName.get(rootSkillName);

          if (requestedSkill === undefined) {
            return yield* new RequestedSkillNotFoundError({
              skillName: rootSkillName,
              source: rootSourceContext.stagedSource.sourceLocator,
            });
          }

          yield* visit(requestedSkill, {
            explicit: true,
            sourceContext: rootSourceContext,
          });
        }

        const closureSkillNames = new Set(refreshedOrder);
        const nextSkills: Record<string, LockEntry> = Object.fromEntries(
          Object.entries(currentLockfile.skills).map(([skillName, entry]) => [
            skillName,
            {
              ...(entry.implicit === true ? { implicit: true } : {}),
              requiredBy: entry.requiredBy.filter(
                (requiredBySkill) => !closureSkillNames.has(requiredBySkill),
              ),
              source: entry.source,
            },
          ]),
        );

        for (const skillName of refreshedOrder) {
          const refreshedSkill = refreshedSkills.get(skillName);

          if (refreshedSkill === undefined) {
            continue;
          }

          const updatedRequiredBy = new Set(refreshedSkill.requiredBy);

          for (const requiredBy of refreshedGraphDependents.get(skillName) ?? []) {
            updatedRequiredBy.add(requiredBy);
          }

          nextSkills[skillName] = {
            ...(refreshedSkill.implicit ? { implicit: true } : {}),
            requiredBy: toSortedReadonlyArray(updatedRequiredBy),
            source: refreshedSkill.skill.source,
          };
        }

        const refreshedSkillsInOrder = refreshedOrder
          .map((skillName) => refreshedSkills.get(skillName)?.skill)
          .filter((skill): skill is DiscoveredSkill => skill !== undefined);

        return {
          _tag: "UpdatePlanReady",
          dependencySkillsUpdated: refreshedSkillsInOrder
            .map((skill) => skill.skillName)
            .filter((skillName) => !updateRootSet.has(skillName)),
          nextLockfile: {
            skills: nextSkills,
            version: 1,
          },
          skillsToRefresh: refreshedSkillsInOrder,
          updatedSkills: updateRootNames,
        };
      });

      return DependencyPlanner.of({
        planInstall,
        planUninstall,
        planUpdate,
      });
    }),
  );
}
