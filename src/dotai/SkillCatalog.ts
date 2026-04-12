import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import { Context, Effect, Layer } from "effect";

import {
  DiscoveryRootNotFoundError,
  type DiscoveredSkill,
  type InstalledSkill,
  type NormalizedSource,
  SkillManifestInvalidError,
  type SkillManifest,
  type SourceInventory,
} from "./domain";

interface ParsedSkillDirectory {
  readonly manifest: SkillManifest;
  readonly skillName: string;
  readonly skillPath: string;
}

const extractFrontmatter = (content: string): string | undefined => {
  const normalized = content.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return undefined;
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);

  if (closingIndex === -1) {
    return undefined;
  }

  return normalized.slice(4, closingIndex);
};

const parseScalar = (line: string): string | undefined => {
  const separatorIndex = line.indexOf(":");

  if (separatorIndex === -1) {
    return undefined;
  }

  return line
    .slice(separatorIndex + 1)
    .trim()
    .replace(/^["']|["']$/gu, "");
};

const parseArrayItem = (line: string): string | undefined => {
  if (!line.startsWith("- ")) {
    return undefined;
  }

  return line
    .slice(2)
    .trim()
    .replace(/^["']|["']$/gu, "");
};

const parseSkillManifest = (
  content: string,
): { readonly manifest: SkillManifest } | { readonly reason: string } => {
  const frontmatter = extractFrontmatter(content);

  if (frontmatter === undefined) {
    return {
      reason: "Expected YAML frontmatter delimited by --- at the top of SKILL.md.",
    };
  }

  let name: string | undefined;
  let description: string | undefined;
  const dependencies: Array<string> = [];
  let inMetadata = false;
  let inDependencies = false;
  let internal = false;

  for (const rawLine of frontmatter.split("\n")) {
    const trimmedLine = rawLine.trim();

    if (trimmedLine.length === 0) {
      continue;
    }

    if (!rawLine.startsWith(" ")) {
      inMetadata = trimmedLine === "metadata:";
      inDependencies = false;

      if (trimmedLine.startsWith("name:")) {
        name = parseScalar(trimmedLine);
        continue;
      }

      if (trimmedLine.startsWith("description:")) {
        description = parseScalar(trimmedLine);
      }

      continue;
    }

    if (!inMetadata) {
      continue;
    }

    if (rawLine.startsWith("  ") && !rawLine.startsWith("    ")) {
      inDependencies = trimmedLine === "dependencies:";

      if (trimmedLine.startsWith("internal:")) {
        internal = parseScalar(trimmedLine) === "true";
      }

      continue;
    }

    if (inDependencies) {
      const dependency = parseArrayItem(trimmedLine);

      if (dependency !== undefined) {
        dependencies.push(dependency);
      }
    }
  }

  if (name === undefined || description === undefined) {
    return {
      reason: "Expected frontmatter fields 'name' and 'description'.",
    };
  }

  return {
    manifest: {
      description,
      metadata: {
        dependencies,
        internal,
      },
      name,
    },
  };
};

export class SkillCatalog extends Context.Service<
  SkillCatalog,
  {
    readonly discoverInstalledSkills: (
      skillsPath: string,
    ) => Effect.Effect<
      ReadonlyArray<InstalledSkill>,
      PlatformError | DiscoveryRootNotFoundError | SkillManifestInvalidError
    >;
    readonly listInstalledSkills: (
      skillsPath: string,
    ) => Effect.Effect<
      ReadonlyArray<string>,
      PlatformError | DiscoveryRootNotFoundError | SkillManifestInvalidError
    >;
    readonly discoverSourceSkills: (
      sourceRoot: string,
      source: NormalizedSource,
    ) => Effect.Effect<
      SourceInventory,
      PlatformError | DiscoveryRootNotFoundError | SkillManifestInvalidError
    >;
  }
>()("dotai/SkillCatalog") {
  static readonly layer = Layer.effect(
    SkillCatalog,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const discoverSkillDirectories = Effect.fn("SkillCatalog.discoverSkillDirectories")(
        function* (
          sourceRoot: string,
          source?: string,
        ): Effect.fn.Return<
          ReadonlyArray<ParsedSkillDirectory>,
          PlatformError | DiscoveryRootNotFoundError | SkillManifestInvalidError
        > {
          const sourceRootExists = yield* fileSystem.exists(sourceRoot);

          if (!sourceRootExists) {
            return yield* new DiscoveryRootNotFoundError({
              path: sourceRoot,
              source,
            });
          }

          const sourceRootInfo = yield* fileSystem.stat(sourceRoot);

          if (sourceRootInfo.type !== "Directory") {
            return yield* new DiscoveryRootNotFoundError({
              path: sourceRoot,
              source,
            });
          }

          const entries = yield* fileSystem.readDirectory(sourceRoot);
          const discoveredSkills: Array<ParsedSkillDirectory> = [];

          for (const entry of entries) {
            const entryPath = path.join(sourceRoot, entry);
            const info = yield* fileSystem.stat(entryPath);

            if (info.type !== "Directory") {
              continue;
            }

            const manifestPath = path.join(entryPath, "SKILL.md");
            const hasManifest = yield* fileSystem.exists(manifestPath);

            if (!hasManifest) {
              continue;
            }

            const manifestFile = yield* fileSystem.readFileString(manifestPath);
            const manifestResult = parseSkillManifest(manifestFile);

            if ("reason" in manifestResult) {
              return yield* new SkillManifestInvalidError({
                manifestPath,
                reason: manifestResult.reason,
                source,
              });
            }

            discoveredSkills.push({
              manifest: manifestResult.manifest,
              skillName: manifestResult.manifest.name,
              skillPath: entryPath,
            });
          }

          discoveredSkills.sort((left, right) => left.skillName.localeCompare(right.skillName));

          return discoveredSkills;
        },
      );

      const listInstalledSkills = Effect.fn("SkillCatalog.listInstalledSkills")(function* (
        skillsPath: string,
      ): Effect.fn.Return<
        ReadonlyArray<string>,
        PlatformError | DiscoveryRootNotFoundError | SkillManifestInvalidError
      > {
        const discoveredSkills = yield* discoverInstalledSkills(skillsPath);

        return discoveredSkills.map((skill) => skill.skillName);
      });

      const discoverInstalledSkills = Effect.fn("SkillCatalog.discoverInstalledSkills")(function* (
        skillsPath: string,
      ): Effect.fn.Return<
        ReadonlyArray<InstalledSkill>,
        PlatformError | DiscoveryRootNotFoundError | SkillManifestInvalidError
      > {
        const skillsPathExists = yield* fileSystem.exists(skillsPath);

        if (!skillsPathExists) {
          return [];
        }
        const discoveredSkills = yield* discoverSkillDirectories(skillsPath);

        return discoveredSkills.map(
          (skill): InstalledSkill => ({
            manifest: skill.manifest,
            skillName: skill.skillName,
            skillPath: skill.skillPath,
          }),
        );
      });

      const discoverSourceSkills = Effect.fn("SkillCatalog.discoverSourceSkills")(function* (
        sourceRoot: string,
        source: NormalizedSource,
      ): Effect.fn.Return<
        SourceInventory,
        PlatformError | DiscoveryRootNotFoundError | SkillManifestInvalidError
      > {
        const discoveredSkills = yield* discoverSkillDirectories(
          sourceRoot,
          source._tag === "LocalSource" ? source.filepath : source.URL,
        );
        const sourcedSkills = discoveredSkills.map(
          (skill): DiscoveredSkill => ({
            ...skill,
            source,
          }),
        );

        return {
          allSkills: sourcedSkills,
          visibleSkills: sourcedSkills.filter((skill) => !skill.manifest.metadata.internal),
        };
      });

      return SkillCatalog.of({
        discoverInstalledSkills,
        discoverSourceSkills,
        listInstalledSkills,
      });
    }),
  );
}
