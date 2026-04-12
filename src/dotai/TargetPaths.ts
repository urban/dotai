import * as Path from "effect/Path";
import { Context, Effect, Layer } from "effect";

import type { ListWorkflowInput, ResolvedTarget } from "./domain";
import { MissingHomeDirectoryError, RuntimeDirectories } from "./RuntimeDirectories";

export class TargetPaths extends Context.Service<
  TargetPaths,
  {
    readonly resolve: (
      input: ListWorkflowInput,
    ) => Effect.Effect<ResolvedTarget, MissingHomeDirectoryError>;
  }
>()("dotai/TargetPaths") {
  static readonly layer = Layer.effect(
    TargetPaths,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const runtimeDirectories = yield* RuntimeDirectories;

      const resolve = Effect.fn("TargetPaths.resolve")(function* (
        input: ListWorkflowInput,
      ): Effect.fn.Return<ResolvedTarget, MissingHomeDirectoryError> {
        const directories = yield* runtimeDirectories.getDirectories();

        if (input.global) {
          const agentsRoot = path.join(directories.homeDirectory, ".agents");
          const target: ResolvedTarget = {
            targetKind: "global",
            rootPath: directories.homeDirectory,
            skillsPath: path.join(agentsRoot, "skills"),
            lockfilePath: path.join(agentsRoot, ".dotai-lock.json"),
            stagingPath: path.join(agentsRoot, ".dotai-stage"),
          };

          return target;
        }

        const target: ResolvedTarget = {
          targetKind: "local",
          rootPath: directories.currentWorkingDirectory,
          skillsPath: path.join(directories.currentWorkingDirectory, ".agents", "skills"),
          lockfilePath: path.join(directories.currentWorkingDirectory, "dotai-lock.json"),
          stagingPath: path.join(directories.currentWorkingDirectory, ".agents", ".dotai-stage"),
        };

        return target;
      });

      return TargetPaths.of({
        resolve,
      });
    }),
  );
}
