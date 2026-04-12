import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import { Context, Effect, Layer } from "effect";

import type { DiscoveredSkill, ResolvedTarget } from "./domain";
import { MutationExecutionError } from "./domain";

const formatPlatformError = (error: PlatformError): string => error.reason.message;

interface StagedSkillRemoval {
  readonly backupPath: string;
  readonly originalPath: string;
  readonly skillName: string;
}

export class MutationExecutor extends Context.Service<
  MutationExecutor,
  {
    readonly installSkill: (
      target: ResolvedTarget,
      skill: DiscoveredSkill,
    ) => Effect.Effect<void, PlatformError | MutationExecutionError>;
    readonly removeSkill: (
      target: ResolvedTarget,
      skillName: string,
    ) => Effect.Effect<void, PlatformError>;
    readonly stageSkillRemoval: (
      target: ResolvedTarget,
      skillName: string,
    ) => Effect.Effect<void, PlatformError | MutationExecutionError>;
    readonly rollbackStagedSkillRemoval: (
      target: ResolvedTarget,
      skillName: string,
    ) => Effect.Effect<void, PlatformError | MutationExecutionError>;
    readonly commitStagedSkillRemoval: (
      target: ResolvedTarget,
      skillName: string,
    ) => Effect.Effect<void, PlatformError>;
  }
>()("dotai/MutationExecutor") {
  static readonly layer = Layer.effect(
    MutationExecutor,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const copyDirectory = Effect.fn("MutationExecutor.copyDirectory")(function* (
        sourcePath: string,
        destinationPath: string,
      ): Effect.fn.Return<void, PlatformError | MutationExecutionError> {
        yield* fileSystem.makeDirectory(destinationPath, {
          recursive: true,
        });

        const entries = yield* fileSystem.readDirectory(sourcePath);

        for (const entry of entries) {
          const sourceEntryPath = path.join(sourcePath, entry);
          const destinationEntryPath = path.join(destinationPath, entry);
          const entryInfo = yield* fileSystem.stat(sourceEntryPath);

          if (entryInfo.type === "Directory") {
            yield* copyDirectory(sourceEntryPath, destinationEntryPath);
            continue;
          }

          if (entryInfo.type === "File") {
            const data = yield* fileSystem.readFile(sourceEntryPath);

            yield* fileSystem.writeFile(destinationEntryPath, data);
            continue;
          }

          return yield* new MutationExecutionError({
            path: sourceEntryPath,
            reason: "Only regular files and directories can be installed.",
          });
        }
      });

      const installSkill = Effect.fn("MutationExecutor.installSkill")(function* (
        target: ResolvedTarget,
        skill: DiscoveredSkill,
      ): Effect.fn.Return<void, PlatformError | MutationExecutionError> {
        const destinationPath = path.join(target.skillsPath, skill.skillName);
        const destinationExists = yield* fileSystem.exists(destinationPath);

        if (destinationExists) {
          return yield* new MutationExecutionError({
            path: destinationPath,
            reason: `Skill '${skill.skillName}' is already installed.`,
          });
        }

        yield* fileSystem.makeDirectory(target.skillsPath, {
          recursive: true,
        });

        return yield* copyDirectory(skill.skillPath, destinationPath).pipe(
          Effect.catchTag("PlatformError", (error) =>
            Effect.fail(
              new MutationExecutionError({
                path: destinationPath,
                reason: formatPlatformError(error),
              }),
            ),
          ),
        );
      });

      const removeSkill = Effect.fn("MutationExecutor.removeSkill")(function* (
        target: ResolvedTarget,
        skillName: string,
      ): Effect.fn.Return<void, PlatformError> {
        const destinationPath = path.join(target.skillsPath, skillName);
        const destinationExists = yield* fileSystem.exists(destinationPath);

        if (!destinationExists) {
          return;
        }

        yield* fileSystem.remove(destinationPath, {
          force: true,
          recursive: true,
        });
      });

      const getStagedRemoval = (target: ResolvedTarget, skillName: string): StagedSkillRemoval => ({
        backupPath: path.join(target.stagingPath, "uninstall", skillName),
        originalPath: path.join(target.skillsPath, skillName),
        skillName,
      });

      const stageSkillRemoval = Effect.fn("MutationExecutor.stageSkillRemoval")(function* (
        target: ResolvedTarget,
        skillName: string,
      ): Effect.fn.Return<void, PlatformError | MutationExecutionError> {
        const stagedRemoval = getStagedRemoval(target, skillName);
        const destinationExists = yield* fileSystem.exists(stagedRemoval.originalPath);

        if (!destinationExists) {
          return yield* new MutationExecutionError({
            path: stagedRemoval.originalPath,
            reason: `Skill '${skillName}' is not installed.`,
          });
        }

        yield* fileSystem.makeDirectory(path.dirname(stagedRemoval.backupPath), {
          recursive: true,
        });

        const backupExists = yield* fileSystem.exists(stagedRemoval.backupPath);

        if (backupExists) {
          yield* fileSystem.remove(stagedRemoval.backupPath, {
            force: true,
            recursive: true,
          });
        }

        return yield* fileSystem.rename(stagedRemoval.originalPath, stagedRemoval.backupPath).pipe(
          Effect.catchTag("PlatformError", (error) =>
            Effect.fail(
              new MutationExecutionError({
                path: stagedRemoval.originalPath,
                reason: formatPlatformError(error),
              }),
            ),
          ),
        );
      });

      const rollbackStagedSkillRemoval = Effect.fn("MutationExecutor.rollbackStagedSkillRemoval")(
        function* (
          target: ResolvedTarget,
          skillName: string,
        ): Effect.fn.Return<void, PlatformError | MutationExecutionError> {
          const stagedRemoval = getStagedRemoval(target, skillName);
          const backupExists = yield* fileSystem.exists(stagedRemoval.backupPath);

          if (!backupExists) {
            return;
          }

          yield* fileSystem.makeDirectory(path.dirname(stagedRemoval.originalPath), {
            recursive: true,
          });

          return yield* fileSystem
            .rename(stagedRemoval.backupPath, stagedRemoval.originalPath)
            .pipe(
              Effect.catchTag("PlatformError", (error) =>
                Effect.fail(
                  new MutationExecutionError({
                    path: stagedRemoval.originalPath,
                    reason: formatPlatformError(error),
                  }),
                ),
              ),
            );
        },
      );

      const commitStagedSkillRemoval = Effect.fn("MutationExecutor.commitStagedSkillRemoval")(
        function* (
          target: ResolvedTarget,
          skillName: string,
        ): Effect.fn.Return<void, PlatformError> {
          const stagedRemoval = getStagedRemoval(target, skillName);
          const backupExists = yield* fileSystem.exists(stagedRemoval.backupPath);

          if (!backupExists) {
            return;
          }

          yield* fileSystem.remove(stagedRemoval.backupPath, {
            force: true,
            recursive: true,
          });
        },
      );

      return MutationExecutor.of({
        commitStagedSkillRemoval,
        installSkill,
        removeSkill,
        rollbackStagedSkillRemoval,
        stageSkillRemoval,
      });
    }),
  );
}
