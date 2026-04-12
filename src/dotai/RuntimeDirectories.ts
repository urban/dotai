import { Context, Effect, Layer, Schema } from "effect";

import type { RuntimeDirectoryConfig } from "./domain";

export class MissingHomeDirectoryError extends Schema.TaggedErrorClass<MissingHomeDirectoryError>()(
  "MissingHomeDirectoryError",
  {
    message: Schema.String,
  },
) {}

export class RuntimeDirectories extends Context.Service<
  RuntimeDirectories,
  {
    readonly getDirectories: () => Effect.Effect<RuntimeDirectoryConfig, MissingHomeDirectoryError>;
  }
>()("dotai/RuntimeDirectories") {
  static readonly layer = Layer.effect(
    RuntimeDirectories,
    Effect.sync(() =>
      RuntimeDirectories.of({
        getDirectories: Effect.fn("RuntimeDirectories.getDirectories")(function* () {
          const homeDirectory = process.env.HOME ?? process.env.USERPROFILE;

          if (homeDirectory === undefined) {
            return yield* new MissingHomeDirectoryError({
              message: "Could not resolve the user home directory.",
            });
          }

          return {
            currentWorkingDirectory: process.cwd(),
            homeDirectory,
          };
        }),
      }),
    ),
  );

  static layerForPaths = (config: RuntimeDirectoryConfig) =>
    Layer.succeed(
      RuntimeDirectories,
      RuntimeDirectories.of({
        getDirectories: Effect.fn("RuntimeDirectories.getDirectories")(function () {
          return Effect.succeed(config);
        }),
      }),
    );
}
