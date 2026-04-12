import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import { Context, Effect, Layer, Schema } from "effect";

import type { DotaiLockfile, LockEntry, NormalizedSource } from "./domain";
import { LockfileParseError, LockfileWriteError } from "./domain";

const LocalSourceSchema = Schema.Struct({
  _tag: Schema.Literal("LocalSource"),
  filepath: Schema.String,
});

const GitSourceSchema = Schema.Struct({
  _tag: Schema.Literal("GitSource"),
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

const encodeLockEntry = Schema.encodeUnknownSync(LockEntrySchema);

const emptyLockfile = (): DotaiLockfile => ({
  skills: {},
  version: 1,
});

const formatPlatformError = (error: PlatformError): string => error.reason.message;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseNormalizedSource = (
  value: unknown,
): { readonly source: NormalizedSource } | { readonly reason: string } => {
  if (!isRecord(value) || typeof value._tag !== "string") {
    return {
      reason: "Lock entry source must be an object with a supported _tag.",
    };
  }

  if (value._tag === "LocalSource") {
    if (typeof value.filepath !== "string") {
      return {
        reason: "LocalSource entries must include a string filepath.",
      };
    }

    return {
      source: {
        _tag: "LocalSource",
        filepath: value.filepath,
      },
    };
  }

  if (value._tag === "GitSource") {
    if (typeof value.URL !== "string") {
      return {
        reason: "GitSource entries must include a string URL.",
      };
    }

    if (value.ref !== undefined && typeof value.ref !== "string") {
      return {
        reason: "GitSource ref must be a string when present.",
      };
    }

    if (value.subpath !== undefined && typeof value.subpath !== "string") {
      return {
        reason: "GitSource subpath must be a string when present.",
      };
    }

    return {
      source: {
        _tag: "GitSource",
        ref: value.ref,
        subpath: value.subpath,
        URL: value.URL,
      },
    };
  }

  return {
    reason: `Unsupported source tag '${value._tag}'.`,
  };
};

const parseLockEntry = (
  value: unknown,
): { readonly entry: LockEntry } | { readonly reason: string } => {
  if (!isRecord(value)) {
    return {
      reason: "Lock entries must be objects.",
    };
  }

  if (
    !Array.isArray(value.requiredBy) ||
    value.requiredBy.some((item) => typeof item !== "string")
  ) {
    return {
      reason: "Lock entry requiredBy must be an array of strings.",
    };
  }

  if (value.implicit !== undefined && value.implicit !== true) {
    return {
      reason: "Lock entry implicit must be omitted or true.",
    };
  }

  const parsedSource = parseNormalizedSource(value.source);

  if ("reason" in parsedSource) {
    return parsedSource;
  }

  return {
    entry: {
      ...(value.implicit === true ? { implicit: true } : {}),
      requiredBy: value.requiredBy,
      source: parsedSource.source,
    },
  };
};

const parseDotaiLockfile = (
  value: unknown,
): { readonly lockfile: DotaiLockfile } | { readonly reason: string } => {
  if (!isRecord(value)) {
    return {
      reason: "Lock file root must be an object.",
    };
  }

  if (value.version !== 1) {
    return {
      reason: "Lock file version must be 1.",
    };
  }

  if (!isRecord(value.skills)) {
    return {
      reason: "Lock file skills must be an object keyed by skill name.",
    };
  }

  const skills: Record<string, LockEntry> = {};

  for (const [skillName, entryValue] of Object.entries(value.skills)) {
    const parsedEntry = parseLockEntry(entryValue);

    if ("reason" in parsedEntry) {
      return {
        reason: `Skill '${skillName}': ${parsedEntry.reason}`,
      };
    }

    skills[skillName] = parsedEntry.entry;
  }

  return {
    lockfile: {
      skills,
      version: 1,
    },
  };
};

const encodeLockfile = (lockfile: DotaiLockfile) => ({
  skills: Object.fromEntries(
    Object.entries(lockfile.skills).map(([skillName, entry]) => [
      skillName,
      encodeLockEntry(entry),
    ]),
  ),
  version: lockfile.version,
});

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
        const parsed = yield* Effect.try({
          try: () => JSON.parse(content),
          catch: (cause) =>
            new LockfileParseError({
              lockfilePath,
              reason: cause instanceof Error ? cause.message : "Invalid JSON.",
            }),
        });

        const decoded = parseDotaiLockfile(parsed);

        if ("reason" in decoded) {
          return yield* Effect.fail(
            new LockfileParseError({
              lockfilePath,
              reason: decoded.reason,
            }),
          );
        }

        return decoded.lockfile;
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

        const encodedLockfile = yield* Effect.try({
          try: () => encodeLockfile(lockfile),
          catch: (cause) =>
            new LockfileWriteError({
              lockfilePath,
              reason:
                cause instanceof Error
                  ? cause.message
                  : "Failed to encode the lock file with the expected schema.",
            }),
        });

        const json = `${JSON.stringify(encodedLockfile, null, 2)}\n`;

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
