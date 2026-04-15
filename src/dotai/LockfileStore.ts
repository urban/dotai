import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import { Context, Effect, Layer, Schema } from "effect";

import type { DotaiLockfile } from "./domain";
import { LockfileParseError, LockfileWriteError } from "./domain";

const LocalSourceSchema = Schema.TaggedStruct("LocalSource", {
  filepath: Schema.String,
});

const GitSourceSchema = Schema.TaggedStruct("GitSource", {
  ref: Schema.optionalKey(Schema.String),
  subpath: Schema.optionalKey(Schema.String),
  URL: Schema.String,
});

const NormalizedSourceSchema = Schema.Union([LocalSourceSchema, GitSourceSchema]);

const LockEntrySchema = Schema.Struct({
  implicit: Schema.optionalKey(Schema.Literal(true)),
  requiredBy: Schema.Array(Schema.String),
  source: NormalizedSourceSchema,
});

const DotaiLockfileSchema = Schema.Struct({
  skills: Schema.Record(Schema.String, LockEntrySchema),
  version: Schema.Literal(1),
});

const LockfileJsonSchema = Schema.fromJsonString(Schema.toCodecJson(DotaiLockfileSchema));

const decodeLockfileJson = Schema.decodeUnknownEffect(LockfileJsonSchema);

const encodeLockfileJson = Schema.encodeEffect(LockfileJsonSchema);

const emptyLockfile = (): DotaiLockfile => ({
  skills: {},
  version: 1,
});

const formatPlatformError = (error: PlatformError): string => error.reason.message;

const formatSchemaError = (error: Schema.SchemaError): string => error.message;

export class LockfileStore extends Context.Service<
  LockfileStore,
  {
    readonly read: (
      lockfilePath: string,
    ) => Effect.Effect<DotaiLockfile, PlatformError | LockfileParseError>;
    readonly write: (
      lockfilePath: string,
      lockfile: DotaiLockfile,
    ) => Effect.Effect<void, PlatformError | LockfileWriteError>;
  }
>()("dotai/LockfileStore") {
  static readonly layer = Layer.effect(
    LockfileStore,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const read = Effect.fn("LockfileStore.read")(function* (
        lockfilePath: string,
      ): Effect.fn.Return<DotaiLockfile, PlatformError | LockfileParseError> {
        const exists = yield* fileSystem.exists(lockfilePath);

        if (!exists) {
          return emptyLockfile();
        }

        const content = yield* fileSystem.readFileString(lockfilePath);

        return yield* decodeLockfileJson(content).pipe(
          Effect.mapError(
            (error) =>
              new LockfileParseError({
                lockfilePath,
                reason: formatSchemaError(error),
              }),
          ),
        );
      });

      const write = Effect.fn("LockfileStore.write")(function* (
        lockfilePath: string,
        lockfile: DotaiLockfile,
      ): Effect.fn.Return<void, PlatformError | LockfileWriteError> {
        const directoryPath = path.dirname(lockfilePath);
        const temporaryLockfilePath = `${lockfilePath}.tmp`;

        yield* fileSystem.makeDirectory(directoryPath, {
          recursive: true,
        });

        const json = yield* encodeLockfileJson(lockfile).pipe(
          Effect.map((encodedLockfile) => `${encodedLockfile}\n`),
          Effect.mapError(
            (error) =>
              new LockfileWriteError({
                lockfilePath,
                reason: formatSchemaError(error),
              }),
          ),
        );

        return yield* fileSystem.writeFileString(temporaryLockfilePath, json).pipe(
          Effect.andThen(fileSystem.rename(temporaryLockfilePath, lockfilePath)),
          Effect.catchTag("PlatformError", (error) =>
            fileSystem.remove(temporaryLockfilePath, { force: true }).pipe(
              Effect.catch(() => Effect.void),
              Effect.andThen(
                Effect.fail(
                  new LockfileWriteError({
                    lockfilePath,
                    reason: formatPlatformError(error),
                  }),
                ),
              ),
            ),
          ),
        );
      });

      return LockfileStore.of({
        read,
        write,
      });
    }),
  );
}
