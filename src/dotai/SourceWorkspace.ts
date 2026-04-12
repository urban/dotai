import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import type * as Scope from "effect/Scope";
import { Context, Effect, Layer } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import {
  DiscoveryRootNotFoundError,
  InvalidSourceLocatorError,
  type GitSource,
  type LocalSource,
  SourceMaterializationFailedError,
  type StagedSource,
} from "./domain";
import { RuntimeDirectories, type MissingHomeDirectoryError } from "./RuntimeDirectories";

const normalizeRef = (value: string): string | undefined => {
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

const makeGitSource = (options: {
  readonly URL: string;
  readonly ref?: string;
  readonly subpath?: string;
}): GitSource => ({
  URL: options.URL,
  _tag: "GitSource",
  ...(options.ref === undefined ? {} : { ref: options.ref }),
  ...(options.subpath === undefined ? {} : { subpath: options.subpath }),
});

const isSupportedRemoteUrl = (source: string): boolean => {
  if (!URL.canParse(source)) {
    return false;
  }

  const parsed = new URL(source);

  if (parsed.protocol === "file:" || parsed.protocol === "ssh:") {
    return true;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  if (parsed.pathname.endsWith(".git")) {
    return true;
  }

  const pathParts = parsed.pathname.split("/").filter((part) => part.length > 0);

  return (
    (parsed.hostname === "github.com" || parsed.hostname === "gitlab.com") && pathParts.length >= 2
  );
};

const normalizeGitUrl = (source: string): GitSource => {
  if (source.startsWith("github:")) {
    const withoutPrefix = source.slice("github:".length);
    const hashIndex = withoutPrefix.indexOf("#");
    const repository = hashIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, hashIndex);
    const ref = hashIndex === -1 ? undefined : normalizeRef(withoutPrefix.slice(hashIndex + 1));

    return makeGitSource({
      URL: `https://github.com/${repository}.git`,
      ref,
    });
  }

  if (source.startsWith("gitlab:")) {
    const withoutPrefix = source.slice("gitlab:".length);
    const hashIndex = withoutPrefix.indexOf("#");
    const repository = hashIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, hashIndex);
    const ref = hashIndex === -1 ? undefined : normalizeRef(withoutPrefix.slice(hashIndex + 1));

    return makeGitSource({
      URL: `https://gitlab.com/${repository}.git`,
      ref,
    });
  }

  if (source.startsWith("git@")) {
    return makeGitSource({
      URL: source,
    });
  }

  const parsed = URL.canParse(source) ? new URL(source) : undefined;

  if (parsed === undefined) {
    return makeGitSource({
      URL: source,
    });
  }

  if (parsed.hostname === "github.com") {
    const parts = parsed.pathname.split("/").filter((part) => part.length > 0);

    if (parts.length >= 4 && parts[2] === "tree") {
      const [owner, repository, , ref, ...subpathParts] = parts;

      return makeGitSource({
        URL: `https://github.com/${owner}/${repository}.git`,
        ref,
        subpath: subpathParts.length === 0 ? undefined : subpathParts.join("/"),
      });
    }

    if (parts.length >= 2) {
      const [owner, repository] = parts;
      const hashRef = normalizeRef(parsed.hash.replace(/^#/u, ""));

      return makeGitSource({
        URL: `https://github.com/${owner}/${trimTrailingSlash(repository).replace(/\.git$/u, "")}.git`,
        ref: hashRef,
      });
    }
  }

  return makeGitSource({
    URL: source,
    ref: normalizeRef(parsed.hash.replace(/^#/u, "")),
  });
};

const isGitSourceLocator = (source: string): boolean =>
  source.startsWith("file:") ||
  source.startsWith("github:") ||
  source.startsWith("gitlab:") ||
  source.startsWith("git@") ||
  source.startsWith("ssh://") ||
  (source.endsWith(".git") && !source.startsWith("git://")) ||
  isSupportedRemoteUrl(source);

const isUnsupportedUrlLocator = (source: string): boolean =>
  URL.canParse(source) && !isSupportedRemoteUrl(source);

export class SourceWorkspace extends Context.Service<
  SourceWorkspace,
  {
    readonly stage: (
      source: string,
    ) => Effect.Effect<
      StagedSource,
      | PlatformError.PlatformError
      | MissingHomeDirectoryError
      | DiscoveryRootNotFoundError
      | InvalidSourceLocatorError
      | SourceMaterializationFailedError,
      Scope.Scope
    >;
  }
>()("dotai/SourceWorkspace") {
  static readonly layer = Layer.effect(
    SourceWorkspace,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const runtimeDirectories = yield* RuntimeDirectories;
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const stage = Effect.fn("SourceWorkspace.stage")(function* (
        source: string,
      ): Effect.fn.Return<
        StagedSource,
        | PlatformError.PlatformError
        | MissingHomeDirectoryError
        | DiscoveryRootNotFoundError
        | InvalidSourceLocatorError
        | SourceMaterializationFailedError,
        Scope.Scope
      > {
        const directories = yield* runtimeDirectories.getDirectories();
        const trimmedSource = source.trim();

        if (trimmedSource.length === 0) {
          return yield* new InvalidSourceLocatorError({
            reason: "Source locator cannot be empty.",
            source,
          });
        }

        if (isUnsupportedUrlLocator(trimmedSource)) {
          return yield* new InvalidSourceLocatorError({
            reason:
              "Unsupported source locator. Use a local path, file URL, github:, gitlab:, or a git repository URL.",
            source,
          });
        }

        if (isGitSourceLocator(trimmedSource)) {
          const normalizedSource = normalizeGitUrl(trimmedSource);
          const workspacePath = yield* Effect.acquireRelease(
            fileSystem.makeTempDirectory({
              prefix: "dotai-source-",
            }),
            (workspaceToRemove) =>
              fileSystem
                .remove(workspaceToRemove, {
                  force: true,
                  recursive: true,
                })
                .pipe(Effect.orDie),
          );
          const repositoryPath = path.join(workspacePath, "repo");
          const cloneArguments =
            normalizedSource.ref === undefined
              ? ["clone", "--quiet", "--depth", "1", normalizedSource.URL, repositoryPath]
              : [
                  "clone",
                  "--quiet",
                  "--depth",
                  "1",
                  "--branch",
                  normalizedSource.ref,
                  normalizedSource.URL,
                  repositoryPath,
                ];

          const exitCode = yield* childProcessSpawner.exitCode(
            ChildProcess.make("git", cloneArguments, {
              cwd: directories.currentWorkingDirectory,
            }),
          );

          if (exitCode !== 0) {
            return yield* new SourceMaterializationFailedError({
              reason: "git clone failed.",
              source: trimmedSource,
            });
          }

          const selectionPath =
            normalizedSource.subpath === undefined
              ? repositoryPath
              : path.join(repositoryPath, normalizedSource.subpath);
          const selectionExists = yield* fileSystem.exists(selectionPath);

          if (!selectionExists) {
            return yield* new DiscoveryRootNotFoundError({
              path: selectionPath,
              source: trimmedSource,
            });
          }

          return {
            normalizedSource,
            namespacePath: repositoryPath,
            selectionPath,
            sourceLocator: source,
            workspacePath,
          } satisfies StagedSource;
        }

        const localSourcePath = path.resolve(directories.currentWorkingDirectory, trimmedSource);
        const sourceExists = yield* fileSystem.exists(localSourcePath);

        if (!sourceExists) {
          return yield* new DiscoveryRootNotFoundError({
            path: localSourcePath,
            source: trimmedSource,
          });
        }

        const normalizedPath = yield* fileSystem.realPath(localSourcePath);
        const normalizedSource: LocalSource = {
          _tag: "LocalSource",
          filepath: normalizedPath,
        };

        return {
          normalizedSource,
          namespacePath: normalizedPath,
          selectionPath: normalizedPath,
          sourceLocator: source,
          workspacePath: normalizedPath,
        } satisfies StagedSource;
      });

      return SourceWorkspace.of({
        stage,
      });
    }),
  );
}
