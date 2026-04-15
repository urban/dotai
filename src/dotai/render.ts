import {
  DependencyCycleDetectedError,
  DependencySkillNotFoundError,
  DependencySourceResolutionError,
  DiscoveryRootNotFoundError,
  type DiscoverWorkflowInput,
  type DiscoverWorkflowResult,
  type InstallWorkflowInput,
  type InstallWorkflowResult,
  InvalidSourceLocatorError,
  LockfileParseError,
  LockfileWriteError,
  type ListWorkflowResult,
  MutationExecutionError,
  RequestedSkillNotFoundError,
  SkillManifestInvalidError,
  SourceMaterializationFailedError,
  type ResolvedTarget,
  UninstallRollbackError,
  type UninstallWorkflowResult,
  type UpdateWorkflowInput,
  UpdateLockfileRollbackError,
  UpdateMutationRollbackError,
  type UpdateWorkflowResult,
  UpdateProvenanceNotFoundError,
  UpdateSourceRefreshError,
} from "./domain";
import type { MissingHomeDirectoryError } from "./RuntimeDirectories";

interface RenderTargetContext {
  readonly rootPath: string;
  readonly targetKind: "local" | "global";
}

interface FailureContext {
  readonly source?: string | undefined;
  readonly target?: RenderTargetContext | undefined;
}

interface RenderSection {
  readonly heading: string;
  readonly lines: ReadonlyArray<string>;
}

interface RenderResult {
  readonly headline: string;
  readonly contextLines?: ReadonlyArray<string>;
  readonly primarySection?: RenderSection;
  readonly secondarySections?: ReadonlyArray<RenderSection>;
  readonly footer?: string;
}

const renderSection = (section: RenderSection): ReadonlyArray<string> => [
  section.heading,
  ...section.lines.map((line) => `- ${line}`),
];

const renderResult = ({
  headline,
  contextLines = [],
  primarySection,
  secondarySections = [],
  footer,
}: RenderResult): string =>
  [
    headline,
    ...contextLines,
    ...(primarySection === undefined ? [] : renderSection(primarySection)),
    ...secondarySections.flatMap(renderSection),
    ...(footer === undefined ? [] : [footer]),
  ].join("\n");

const renderContext = (
  context: FailureContext & {
    readonly lockfilePath?: string;
    readonly sourceRoot?: string;
    readonly skillsDirectory?: string;
  },
): ReadonlyArray<string> => [
  ...(context.target === undefined
    ? []
    : [
        `Target: ${context.target.targetKind}`,
        `Target root: ${context.target.rootPath}`,
        ...(context.skillsDirectory === undefined
          ? []
          : [`Skills directory: ${context.skillsDirectory}`]),
      ]),
  ...(context.source === undefined ? [] : [`Source: ${context.source}`]),
  ...(context.sourceRoot === undefined ? [] : [`Source root: ${context.sourceRoot}`]),
  ...(context.lockfilePath === undefined ? [] : [`Lock file: ${context.lockfilePath}`]),
];

export const renderNoMutationNoop = (
  reason: string,
  context: FailureContext & { readonly lockfilePath: string },
): string =>
  renderResult({
    headline: "No changes",
    contextLines: renderContext(context),
    primarySection: {
      heading: "Reason:",
      lines: [reason],
    },
    footer: "No files or lock file were changed.",
  });

export const renderListWorkflowResult = (result: ListWorkflowResult): string => {
  return renderResult({
    headline: "Installed skills",
    contextLines: renderContext({
      skillsDirectory: result.target.skillsPath,
      target: result.target,
    }),
    primarySection: {
      heading: "Skills:",
      lines:
        result.installedSkills.length === 0
          ? ["(none)"]
          : result.installedSkills.map((skillName) => skillName),
    },
  });
};

export const renderDiscoverWorkflowResult = (result: DiscoverWorkflowResult): string => {
  return renderResult({
    headline: "Discovered skills",
    contextLines: renderContext({
      source: result.source.sourceLocator,
      sourceRoot: result.source.selectionPath,
      target: result.target,
    }),
    primarySection: {
      heading: "Skills:",
      lines:
        result.visibleSkills.length === 0
          ? ["(none)"]
          : result.visibleSkills.map((skill) => skill.skillName),
    },
  });
};

export const renderInstallWorkflowResult = (result: InstallWorkflowResult): string => {
  switch (result._tag) {
    case "InstallWorkflowResult":
      return renderResult({
        headline: "Installed skills",
        contextLines: renderContext({
          lockfilePath: result.lockfilePath,
          source: result.source.sourceLocator,
          target: result.target,
        }),
        primarySection: {
          heading: "Directly installed:",
          lines: result.directSkillsInstalled,
        },
        secondarySections: [
          ...(result.alreadyDirectSkills.length === 0
            ? []
            : [
                {
                  heading: "Already direct:",
                  lines: result.alreadyDirectSkills,
                },
              ]),
          ...(result.dependencySkillsInstalled.length === 0
            ? []
            : [
                {
                  heading: "Dependencies installed:",
                  lines: result.dependencySkillsInstalled,
                },
              ]),
        ],
        footer: "Lock file updated.",
      });
    case "InstallWorkflowNoopResult":
      return renderNoMutationNoop(result.reason, {
        lockfilePath: result.lockfilePath,
        source: result.source.sourceLocator,
        target: result.target,
      });
    default: {
      const _exhaustive: never = result;

      return _exhaustive;
    }
  }
};

export const renderUninstallWorkflowResult = (result: UninstallWorkflowResult): string => {
  switch (result._tag) {
    case "UninstallWorkflowResult":
      return renderResult({
        headline: "Removed skills",
        contextLines: renderContext({
          lockfilePath: result.lockfilePath,
          target: result.target,
        }),
        primarySection: {
          heading: "Removed:",
          lines: [result.removedSkill],
        },
        secondarySections:
          result.pruneCandidates.length === 0
            ? []
            : [
                {
                  heading: "Prune candidates:",
                  lines: result.pruneCandidates,
                },
              ],
        footer: "Lock file updated.",
      });
    case "UninstallWorkflowBlockedResult":
      return renderResult({
        headline: "Uninstall blocked",
        contextLines: renderContext({
          lockfilePath: result.lockfilePath,
          target: result.target,
        }),
        primarySection: {
          heading: "Requested skill:",
          lines: [result.requestedSkill],
        },
        secondarySections: [
          {
            heading: "Blocking skills:",
            lines: result.blockingSkills,
          },
        ],
        footer: "No files or lock file were changed.",
      });
    case "UninstallWorkflowNoopResult":
      return renderNoMutationNoop(result.reason, {
        lockfilePath: result.lockfilePath,
        target: result.target,
      });
    default: {
      const _exhaustive: never = result;

      return _exhaustive;
    }
  }
};

export const renderUpdateWorkflowResult = (result: UpdateWorkflowResult): string => {
  switch (result._tag) {
    case "UpdateWorkflowResult":
      return renderResult({
        headline: "Updated skills",
        contextLines: renderContext({
          lockfilePath: result.lockfilePath,
          target: result.target,
        }),
        primarySection: {
          heading: "Updated roots:",
          lines: result.updatedSkills,
        },
        secondarySections:
          result.dependencySkillsUpdated.length === 0
            ? []
            : [
                {
                  heading: "Dependencies updated:",
                  lines: result.dependencySkillsUpdated,
                },
              ],
        footer: "Lock file updated.",
      });
    case "UpdateWorkflowNoopResult":
      return renderNoMutationNoop(result.reason, {
        lockfilePath: result.lockfilePath,
        target: result.target,
      });
    default: {
      const _exhaustive: never = result;

      return _exhaustive;
    }
  }
};

const renderFailure = (
  headline: string,
  context: FailureContext,
  causeLines: ReadonlyArray<string>,
  footer = "No files or lock file were changed.",
): string =>
  renderResult({
    headline,
    contextLines: renderContext(context),
    primarySection: {
      heading: "Cause:",
      lines: causeLines,
    },
    footer,
  });

export const renderReadOnlyFailure = (
  headline: string,
  context: FailureContext,
  causeLines: ReadonlyArray<string>,
): string => renderFailure(headline, context, causeLines);

export const renderListWorkflowFailure = (
  error: MissingHomeDirectoryError | DiscoveryRootNotFoundError | SkillManifestInvalidError,
  target?: ResolvedTarget,
): string => {
  switch (error._tag) {
    case "MissingHomeDirectoryError":
      return renderFailure("Error: missing home directory", { target }, [error.message]);
    case "DiscoveryRootNotFoundError":
      return renderFailure("Error: missing discovery root", { target }, [`Path: ${error.path}`]);
    case "SkillManifestInvalidError":
      return renderFailure("Error: invalid skill manifest", { target }, [
        `Manifest: ${error.manifestPath}`,
        error.reason,
      ]);
    default: {
      const _exhaustive: never = error;

      return _exhaustive;
    }
  }
};

export const renderDiscoverWorkflowFailure = (
  error:
    | MissingHomeDirectoryError
    | DiscoveryRootNotFoundError
    | InvalidSourceLocatorError
    | SkillManifestInvalidError
    | SourceMaterializationFailedError,
  input: DiscoverWorkflowInput,
  target?: ResolvedTarget,
): string => {
  switch (error._tag) {
    case "MissingHomeDirectoryError":
      return renderFailure("Error: missing home directory", { source: input.source, target }, [
        error.message,
      ]);
    case "InvalidSourceLocatorError":
      return renderFailure("Error: invalid source locator", { source: error.source, target }, [
        error.reason,
      ]);
    case "SourceMaterializationFailedError":
      return renderFailure("Error: failed to stage source", { source: error.source, target }, [
        error.reason,
      ]);
    case "DiscoveryRootNotFoundError":
      return renderFailure(
        "Error: missing discovery root",
        { source: error.source ?? input.source, target },
        [`Path: ${error.path}`],
      );
    case "SkillManifestInvalidError":
      return renderFailure(
        "Error: invalid skill manifest",
        { source: error.source ?? input.source, target },
        [`Manifest: ${error.manifestPath}`, error.reason],
      );
    default: {
      const _exhaustive: never = error;

      return _exhaustive;
    }
  }
};

export const renderInstallWorkflowFailure = (
  error:
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
    | LockfileWriteError,
  input: InstallWorkflowInput,
  target?: ResolvedTarget,
): string => {
  switch (error._tag) {
    case "MissingHomeDirectoryError":
      return renderFailure("Error: missing home directory", { source: input.source, target }, [
        error.message,
      ]);
    case "InvalidSourceLocatorError":
      return renderFailure("Error: invalid source locator", { source: error.source, target }, [
        error.reason,
      ]);
    case "SourceMaterializationFailedError":
      return renderFailure("Error: failed to stage source", { source: error.source, target }, [
        error.reason,
      ]);
    case "DiscoveryRootNotFoundError":
      return renderFailure(
        "Error: missing discovery root",
        { source: error.source ?? input.source, target },
        [`Path: ${error.path}`],
      );
    case "SkillManifestInvalidError":
      return renderFailure(
        "Error: invalid skill manifest",
        { source: error.source ?? input.source, target },
        [`Manifest: ${error.manifestPath}`, error.reason],
      );
    case "RequestedSkillNotFoundError":
      return renderFailure("Error: requested skill not found", { source: error.source, target }, [
        `Skill: ${error.skillName}`,
      ]);
    case "DependencySkillNotFoundError":
      return renderFailure("Error: dependency not found", { source: error.source, target }, [
        `Dependency: ${error.dependencyName}`,
        `Required by: ${error.requiredBy}`,
      ]);
    case "DependencySourceResolutionError":
      return renderFailure(
        "Error: failed to resolve dependency source",
        { source: input.source, target },
        [
          `Dependency: ${error.dependencyLocator}`,
          `Required by: ${error.requiredBy}`,
          error.reason,
        ],
      );
    case "DependencyCycleDetectedError":
      return renderFailure("Error: dependency cycle detected", { source: input.source, target }, [
        `Cycle: ${error.cyclePath.join(" -> ")}`,
      ]);
    case "MutationExecutionError":
      return renderFailure("Error: failed to install skill", { source: input.source, target }, [
        `Path: ${error.path}`,
        error.reason,
      ]);
    case "LockfileParseError":
      return renderFailure("Error: invalid lock file", { source: input.source, target }, [
        `Lock file: ${error.lockfilePath}`,
        error.reason,
      ]);
    case "LockfileWriteError":
      return renderFailure("Error: failed to write lock file", { source: input.source, target }, [
        `Lock file: ${error.lockfilePath}`,
        error.reason,
      ]);
    default: {
      const _exhaustive: never = error;

      return _exhaustive;
    }
  }
};

export const renderUninstallWorkflowFailure = (
  error:
    | MissingHomeDirectoryError
    | DiscoveryRootNotFoundError
    | SkillManifestInvalidError
    | LockfileParseError
    | MutationExecutionError
    | UninstallRollbackError
    | LockfileWriteError,
  target?: ResolvedTarget,
): string => {
  switch (error._tag) {
    case "MissingHomeDirectoryError":
      return renderFailure("Error: missing home directory", { target }, [error.message]);
    case "DiscoveryRootNotFoundError":
      return renderFailure("Error: missing discovery root", { target }, [`Path: ${error.path}`]);
    case "SkillManifestInvalidError":
      return renderFailure("Error: invalid skill manifest", { target }, [
        `Manifest: ${error.manifestPath}`,
        error.reason,
      ]);
    case "LockfileParseError":
      return renderFailure("Error: invalid lock file", { target }, [
        `Lock file: ${error.lockfilePath}`,
        error.reason,
      ]);
    case "MutationExecutionError":
      return renderFailure("Error: failed to uninstall skill", { target }, [
        `Path: ${error.path}`,
        error.reason,
      ]);
    case "LockfileWriteError":
      return renderFailure("Error: failed to write lock file", { target }, [
        `Lock file: ${error.lockfilePath}`,
        error.reason,
      ]);
    case "UninstallRollbackError":
      return renderFailure(
        "Error: failed to write lock file",
        { target },
        [`Lock file: ${error.lockfilePath}`, error.reason],
        "Staged filesystem changes were rolled back. The previously committed state was restored.",
      );
    default: {
      const _exhaustive: never = error;

      return _exhaustive;
    }
  }
};

export const renderUpdateWorkflowFailure = (
  error:
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
    | UpdateSourceRefreshError,
  _input: UpdateWorkflowInput,
  target?: ResolvedTarget,
): string => {
  switch (error._tag) {
    case "MissingHomeDirectoryError":
      return renderFailure("Error: missing home directory", { target }, [error.message]);
    case "InvalidSourceLocatorError":
      return renderFailure("Error: invalid source locator", { source: error.source, target }, [
        error.reason,
      ]);
    case "SourceMaterializationFailedError":
      return renderFailure("Error: failed to stage source", { source: error.source, target }, [
        error.reason,
      ]);
    case "DiscoveryRootNotFoundError":
      return renderFailure("Error: missing discovery root", { source: error.source, target }, [
        `Path: ${error.path}`,
      ]);
    case "SkillManifestInvalidError":
      return renderFailure("Error: invalid skill manifest", { source: error.source, target }, [
        `Manifest: ${error.manifestPath}`,
        error.reason,
      ]);
    case "RequestedSkillNotFoundError":
      return renderFailure("Error: requested skill not found", { source: error.source, target }, [
        `Skill: ${error.skillName}`,
      ]);
    case "DependencySkillNotFoundError":
      return renderFailure("Error: dependency not found", { source: error.source, target }, [
        `Dependency: ${error.dependencyName}`,
        `Required by: ${error.requiredBy}`,
      ]);
    case "DependencySourceResolutionError":
      return renderFailure("Error: failed to resolve dependency source", { target }, [
        `Dependency: ${error.dependencyLocator}`,
        `Required by: ${error.requiredBy}`,
        error.reason,
      ]);
    case "DependencyCycleDetectedError":
      return renderFailure("Error: dependency cycle detected", { target }, [
        `Cycle: ${error.cyclePath.join(" -> ")}`,
      ]);
    case "MutationExecutionError":
      return renderFailure("Error: failed to refresh installed skill", { target }, [
        `Path: ${error.path}`,
        error.reason,
      ]);
    case "LockfileParseError":
      return renderFailure("Error: invalid lock file", { target }, [
        `Lock file: ${error.lockfilePath}`,
        error.reason,
      ]);
    case "LockfileWriteError":
      return renderFailure("Error: failed to write lock file", { target }, [
        `Lock file: ${error.lockfilePath}`,
        error.reason,
      ]);
    case "UpdateMutationRollbackError":
      return renderFailure(
        "Error: failed to refresh installed skill",
        { target },
        [...(error.path === undefined ? [] : [`Path: ${error.path}`]), error.reason],
        "Staged filesystem changes were rolled back. The previously committed state was restored.",
      );
    case "UpdateLockfileRollbackError":
      return renderFailure(
        "Error: failed to write lock file",
        { target },
        [`Lock file: ${error.lockfilePath}`, error.reason],
        "Staged filesystem changes were rolled back. The previously committed state was restored.",
      );
    case "UpdateProvenanceNotFoundError":
      return renderFailure("Error: missing recorded provenance", { target }, [
        `Skill: ${error.skillName}`,
        error.reason,
      ]);
    case "UpdateSourceRefreshError":
      return renderFailure(
        "Error: failed to refresh recorded source",
        { source: error.source, target },
        [`Skill: ${error.skillName}`, error.reason],
      );
    default: {
      const _exhaustive: never = error;

      return _exhaustive;
    }
  }
};
