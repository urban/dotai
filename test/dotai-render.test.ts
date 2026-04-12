import { describe, expect, it } from "@effect/vitest";

import {
  DependencySourceResolutionError,
  type InstallWorkflowResult,
  type ResolvedTarget,
  type UninstallWorkflowResult,
  type UpdateWorkflowResult,
} from "../src/dotai/domain";
import {
  renderInstallWorkflowFailure,
  renderInstallWorkflowResult,
  renderNoMutationNoop,
  renderUninstallWorkflowResult,
  renderUpdateWorkflowResult,
} from "../src/dotai/render";

const target: ResolvedTarget = {
  lockfilePath: "/workspace/dotai-lock.json",
  rootPath: "/workspace",
  skillsPath: "/workspace/.agents/skills",
  stagingPath: "/workspace/.agents/.tmp",
  targetKind: "local",
};

describe("dotai renderer", () => {
  it("renders install success using the shared headline-context-primary-footer order", () => {
    const result: InstallWorkflowResult = {
      _tag: "InstallWorkflowResult",
      alreadyDirectSkills: [],
      dependencySkillsInstalled: ["beta", "gamma"],
      directSkillsInstalled: ["alpha"],
      lockfilePath: target.lockfilePath,
      source: {
        normalizedSource: {
          _tag: "LocalSource",
          filepath: "/catalog",
        },
        namespacePath: "/catalog",
        selectionPath: "/catalog",
        sourceLocator: "/catalog",
        workspacePath: "/tmp/catalog",
      },
      target,
    };

    expect(renderInstallWorkflowResult(result)).toBe(
      [
        "Installed skills",
        "Target: local",
        "Target root: /workspace",
        "Source: /catalog",
        "Lock file: /workspace/dotai-lock.json",
        "Directly installed:",
        "- alpha",
        "Dependencies installed:",
        "- beta",
        "- gamma",
        "Lock file updated.",
      ].join("\n"),
    );
  });

  it("renders already-direct roots after newly installed roots", () => {
    const result: InstallWorkflowResult = {
      _tag: "InstallWorkflowResult",
      alreadyDirectSkills: ["alpha"],
      dependencySkillsInstalled: ["gamma"],
      directSkillsInstalled: ["beta"],
      lockfilePath: target.lockfilePath,
      source: {
        normalizedSource: {
          _tag: "LocalSource",
          filepath: "/catalog",
        },
        namespacePath: "/catalog",
        selectionPath: "/catalog",
        sourceLocator: "/catalog",
        workspacePath: "/tmp/catalog",
      },
      target,
    };

    expect(renderInstallWorkflowResult(result)).toBe(
      [
        "Installed skills",
        "Target: local",
        "Target root: /workspace",
        "Source: /catalog",
        "Lock file: /workspace/dotai-lock.json",
        "Directly installed:",
        "- beta",
        "Already direct:",
        "- alpha",
        "Dependencies installed:",
        "- gamma",
        "Lock file updated.",
      ].join("\n"),
    );
  });

  it("renders uninstall blocked with primary and secondary sections before the no-mutation footer", () => {
    const result: UninstallWorkflowResult = {
      _tag: "UninstallWorkflowBlockedResult",
      blockingSkills: ["alpha", "gamma"],
      lockfilePath: target.lockfilePath,
      requestedSkill: "beta",
      target,
    };

    expect(renderUninstallWorkflowResult(result)).toBe(
      [
        "Uninstall blocked",
        "Target: local",
        "Target root: /workspace",
        "Lock file: /workspace/dotai-lock.json",
        "Requested skill:",
        "- beta",
        "Blocking skills:",
        "- alpha",
        "- gamma",
        "No files or lock file were changed.",
      ].join("\n"),
    );
  });

  it("renders shared no-op results through the centralized renderer", () => {
    expect(
      renderNoMutationNoop("Install selection was cancelled.", {
        lockfilePath: target.lockfilePath,
        source: "/catalog",
        target,
      }),
    ).toBe(
      [
        "No changes",
        "Target: local",
        "Target root: /workspace",
        "Source: /catalog",
        "Lock file: /workspace/dotai-lock.json",
        "Reason:",
        "- Install selection was cancelled.",
        "No files or lock file were changed.",
      ].join("\n"),
    );
  });

  it("renders failures with cause-oriented context and no stack output", () => {
    const error = new DependencySourceResolutionError({
      dependencyLocator: "https://example.com/skills",
      reason: "Unsupported dependency source.",
      requiredBy: "alpha",
    });

    expect(
      renderInstallWorkflowFailure(
        error,
        {
          global: false,
          requestedSkillNames: ["alpha"],
          source: "/catalog",
        },
        target,
      ),
    ).toBe(
      [
        "Error: failed to resolve dependency source",
        "Target: local",
        "Target root: /workspace",
        "Source: /catalog",
        "Cause:",
        "- Dependency: https://example.com/skills",
        "- Required by: alpha",
        "- Unsupported dependency source.",
        "No files or lock file were changed.",
      ].join("\n"),
    );
  });

  it("renders update success with the same ordered sections", () => {
    const result: UpdateWorkflowResult = {
      _tag: "UpdateWorkflowResult",
      dependencySkillsUpdated: ["beta"],
      lockfilePath: target.lockfilePath,
      target,
      updatedSkills: ["alpha"],
    };

    expect(renderUpdateWorkflowResult(result)).toBe(
      [
        "Updated skills",
        "Target: local",
        "Target root: /workspace",
        "Lock file: /workspace/dotai-lock.json",
        "Updated roots:",
        "- alpha",
        "Dependencies updated:",
        "- beta",
        "Lock file updated.",
      ].join("\n"),
    );
  });
});
