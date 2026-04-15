import { Console, Effect, Option } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";

import type { InstallWorkflowInput } from "../dotai/domain";
import { LockfileStore } from "../dotai/LockfileStore";
import { SkillCatalog } from "../dotai/SkillCatalog";
import { SkillWorkflows } from "../dotai/SkillWorkflows";
import { SourceWorkspace } from "../dotai/SourceWorkspace";
import { TargetPaths } from "../dotai/TargetPaths";
import {
  renderDiscoverWorkflowFailure,
  renderDiscoverWorkflowResult,
  renderInstallWorkflowFailure,
  renderInstallWorkflowResult,
  renderListWorkflowFailure,
  renderListWorkflowResult,
  renderNoMutationNoop,
  renderReadOnlyFailure,
  renderUninstallWorkflowFailure,
  renderUninstallWorkflowResult,
  renderUpdateWorkflowFailure,
  renderUpdateWorkflowResult,
} from "../dotai/render";

type SkillSelectionAction = "install" | "uninstall" | "update";

type SkillSelectionChoice = {
  readonly description?: string;
  readonly skillName: string;
};

const toRequestedSkillNames = (
  skillNames: ReadonlyArray<string>,
): Option.Option<InstallWorkflowInput["requestedSkillNames"]> => {
  const [firstSkillName, ...remainingSkillNames] = skillNames;

  return firstSkillName === undefined
    ? Option.none()
    : Option.some([firstSkillName, ...remainingSkillNames]);
};

const promptForSingleSkillSelection = (
  action: Exclude<SkillSelectionAction, "install">,
  skillChoices: ReadonlyArray<SkillSelectionChoice>,
) =>
  skillChoices.length === 0
    ? Effect.succeed(Option.none<string>())
    : Prompt.select({
        choices: skillChoices.map((skillChoice) => ({
          ...(skillChoice.description === undefined
            ? {}
            : {
                description: skillChoice.description,
              }),
          title: skillChoice.skillName,
          value: skillChoice.skillName,
        })),
        message: `Select a skill to ${action}:`,
      }).pipe(Prompt.run, Effect.map(Option.some));

const promptForInstallSkills = (source: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const sourceWorkspace = yield* SourceWorkspace;
      const skillCatalog = yield* SkillCatalog;
      const stagedSource = yield* sourceWorkspace.stage(source);
      const inventory = yield* skillCatalog.discoverSourceSkills(
        stagedSource.selectionPath,
        stagedSource.normalizedSource,
      );

      const skillChoices = inventory.visibleSkills.map((skill) => ({
        description: skill.manifest.description,
        skillName: skill.skillName,
      }));

      if (skillChoices.length === 0) {
        return Option.none<InstallWorkflowInput["requestedSkillNames"]>();
      }

      const selectedSkillNames = yield* Prompt.multiSelect({
        choices: skillChoices.map((skillChoice) => ({
          ...(skillChoice.description === undefined
            ? {}
            : {
                description: skillChoice.description,
              }),
          title: skillChoice.skillName,
          value: skillChoice.skillName,
        })),
        message: "Select skills to install:",
        min: 1,
      }).pipe(Prompt.run);
      const requestedSkillNames = toRequestedSkillNames(selectedSkillNames);

      return Option.isSome(requestedSkillNames) ? requestedSkillNames : Option.none();
    }),
  );

const promptForInstalledSkill = (action: "uninstall" | "update", global: boolean) =>
  Effect.scoped(
    Effect.gen(function* () {
      const targetPaths = yield* TargetPaths;
      const skillCatalog = yield* SkillCatalog;
      const lockfileStore = yield* LockfileStore;
      const target = yield* targetPaths.resolve({ global });
      const installedSkills = yield* skillCatalog.discoverInstalledSkills(target.skillsPath);
      const currentLockfile = yield* lockfileStore.read(target.lockfilePath);
      const selectableSkills = installedSkills
        .filter((skill) => !skill.manifest.metadata.internal)
        .filter((skill) =>
          action === "uninstall"
            ? true
            : currentLockfile.skills[skill.skillName]?.implicit !== true,
        )
        .map((skill) => ({
          description: skill.manifest.description,
          skillName: skill.skillName,
        }));

      return yield* promptForSingleSkillSelection(action, selectableSkills);
    }),
  );

const formatActionLabel = (action: "install" | "uninstall" | "update"): string =>
  `${action.slice(0, 1).toUpperCase()}${action.slice(1)}`;

const renderSelectionCancelled = (
  action: "install" | "uninstall" | "update",
  target: {
    readonly lockfilePath: string;
    readonly rootPath: string;
    readonly targetKind: "local" | "global";
  },
  source?: string,
): string =>
  renderNoMutationNoop(`${formatActionLabel(action)} selection was cancelled.`, {
    lockfilePath: target.lockfilePath,
    source,
    target,
  });

const renderNoEligibleSelection = (
  action: "install" | "uninstall" | "update",
  target: {
    readonly lockfilePath: string;
    readonly rootPath: string;
    readonly targetKind: "local" | "global";
  },
  source?: string,
): string =>
  renderNoMutationNoop(`No operator-visible skills are available to ${action}.`, {
    lockfilePath: target.lockfilePath,
    source,
    target,
  });

const renderPlatformFailureReason = (error: PlatformError): string => {
  const parts = [error.reason.message];

  if ("pathOrDescriptor" in error.reason && typeof error.reason.pathOrDescriptor === "string") {
    parts.push(`Path: ${error.reason.pathOrDescriptor}`);
  }

  return parts.join(" ");
};

const skillsCommandBase = Command.make("skills").pipe(
  Command.withSharedFlags({
    global: Flag.boolean("global").pipe(Flag.withDefault(false)),
  }),
);

const listCommand = Command.make("list").pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const skillsCommand = yield* skillsCommandBase;
      const targetPaths = yield* TargetPaths;
      const workflows = yield* SkillWorkflows;
      const input = {
        global: skillsCommand.global,
      };
      yield* Effect.matchEffect(targetPaths.resolve(input), {
        onFailure: (error) => Console.error(renderListWorkflowFailure(error)),
        onSuccess: (target) =>
          Effect.matchEffect(workflows.list(input), {
            onFailure: (error) =>
              Console.error(
                error._tag === "PlatformError"
                  ? renderReadOnlyFailure("Error: failed to read installed skills", { target }, [
                      renderPlatformFailureReason(error),
                    ])
                  : renderListWorkflowFailure(error, target),
              ),
            onSuccess: (result) => Console.log(renderListWorkflowResult(result)),
          }),
      });
    }),
  ),
);

const discoverCommand = Command.make("discover", {
  source: Argument.string("source"),
}).pipe(
  Command.withHandler((input) =>
    Effect.gen(function* () {
      const skillsCommand = yield* skillsCommandBase;
      const targetPaths = yield* TargetPaths;
      const workflows = yield* SkillWorkflows;
      const workflowInput = {
        global: skillsCommand.global,
        source: input.source,
      };
      yield* Effect.matchEffect(targetPaths.resolve(workflowInput), {
        onFailure: (error) => Console.error(renderDiscoverWorkflowFailure(error, workflowInput)),
        onSuccess: (target) =>
          Effect.matchEffect(workflows.discover(workflowInput), {
            onFailure: (error) =>
              Console.error(
                error._tag === "PlatformError"
                  ? renderReadOnlyFailure(
                      "Error: failed to discover skills",
                      { source: workflowInput.source, target },
                      [renderPlatformFailureReason(error)],
                    )
                  : renderDiscoverWorkflowFailure(error, workflowInput, target),
              ),
            onSuccess: (result) => Console.log(renderDiscoverWorkflowResult(result)),
          }),
      });
    }),
  ),
);

const installCommand = Command.make("install", {
  source: Argument.string("source"),
  requestedSkillNames: Argument.string("skill-name").pipe(Argument.variadic()),
}).pipe(
  Command.withAlias("add"),
  Command.withHandler((input) =>
    Effect.gen(function* () {
      const skillsCommand = yield* skillsCommandBase;
      const targetPaths = yield* TargetPaths;
      const workflows = yield* SkillWorkflows;
      const targetInput = {
        global: skillsCommand.global,
        source: input.source,
      };
      yield* Effect.matchEffect(targetPaths.resolve(targetInput), {
        onFailure: (error) =>
          Console.error(
            renderInstallWorkflowFailure(error, {
              ...targetInput,
              requestedSkillNames: ["unknown"],
            }),
          ),
        onSuccess: (target) =>
          Effect.gen(function* () {
            const requestedSkillNamesFromArgs = toRequestedSkillNames(input.requestedSkillNames);
            const maybeRequestedSkillNames = Option.isSome(requestedSkillNamesFromArgs)
              ? Effect.succeed(requestedSkillNamesFromArgs)
              : promptForInstallSkills(input.source);

            yield* Effect.matchEffect(maybeRequestedSkillNames, {
              onFailure: (error) =>
                Console.error(
                  error._tag === "PlatformError"
                    ? renderReadOnlyFailure(
                        "Error: failed to install skill",
                        { source: input.source, target },
                        [renderPlatformFailureReason(error)],
                      )
                    : error._tag === "QuitError"
                      ? renderSelectionCancelled("install", target, input.source)
                      : renderInstallWorkflowFailure(
                          error,
                          {
                            ...targetInput,
                            requestedSkillNames: ["unknown"],
                          },
                          target,
                        ),
                ),
              onSuccess: (requestedSkillNamesOption) =>
                Option.isNone(requestedSkillNamesOption)
                  ? Console.log(renderNoEligibleSelection("install", target, input.source))
                  : Effect.gen(function* () {
                      const workflowInput = {
                        ...targetInput,
                        requestedSkillNames: requestedSkillNamesOption.value,
                      };

                      yield* Effect.matchEffect(workflows.install(workflowInput), {
                        onFailure: (error) =>
                          Console.error(
                            error._tag === "PlatformError"
                              ? renderReadOnlyFailure(
                                  "Error: failed to install skill",
                                  { source: workflowInput.source, target },
                                  [renderPlatformFailureReason(error)],
                                )
                              : renderInstallWorkflowFailure(error, workflowInput, target),
                          ),
                        onSuccess: (result) => Console.log(renderInstallWorkflowResult(result)),
                      });
                    }),
            });
          }),
      });
    }),
  ),
);

const uninstallCommand = Command.make("uninstall", {
  requestedSkillName: Argument.string("skill-name").pipe(Argument.optional),
}).pipe(
  Command.withAlias("remove"),
  Command.withHandler((input) =>
    Effect.gen(function* () {
      const skillsCommand = yield* skillsCommandBase;
      const targetPaths = yield* TargetPaths;
      const workflows = yield* SkillWorkflows;
      const workflowInput = {
        global: skillsCommand.global,
      };

      yield* Effect.matchEffect(targetPaths.resolve(workflowInput), {
        onFailure: (error) => Console.error(renderUninstallWorkflowFailure(error)),
        onSuccess: (target) =>
          Effect.gen(function* () {
            const maybeRequestedSkillName = Option.isSome(input.requestedSkillName)
              ? Effect.succeed(Option.some(input.requestedSkillName.value))
              : promptForInstalledSkill("uninstall", skillsCommand.global);

            yield* Effect.matchEffect(maybeRequestedSkillName, {
              onFailure: (error) =>
                Console.error(
                  error._tag === "PlatformError"
                    ? renderReadOnlyFailure("Error: failed to plan uninstall", { target }, [
                        renderPlatformFailureReason(error),
                      ])
                    : error._tag === "QuitError"
                      ? renderSelectionCancelled("uninstall", target)
                      : renderUninstallWorkflowFailure(error, target),
                ),
              onSuccess: (requestedSkillNameOption) =>
                Option.isNone(requestedSkillNameOption)
                  ? Console.log(renderNoEligibleSelection("uninstall", target))
                  : Effect.matchEffect(
                      workflows.uninstall({
                        global: skillsCommand.global,
                        requestedSkillName: requestedSkillNameOption.value,
                      }),
                      {
                        onFailure: (error) =>
                          Console.error(
                            error._tag === "PlatformError"
                              ? renderReadOnlyFailure(
                                  "Error: failed to plan uninstall",
                                  { target },
                                  [renderPlatformFailureReason(error)],
                                )
                              : renderUninstallWorkflowFailure(error, target),
                          ),
                        onSuccess: (result) => Console.log(renderUninstallWorkflowResult(result)),
                      },
                    ),
            });
          }),
      });
    }),
  ),
);

const updateCommand = Command.make("update", {
  requestedSkillName: Argument.string("skill-name").pipe(Argument.optional),
}).pipe(
  Command.withHandler((input) =>
    Effect.gen(function* () {
      const skillsCommand = yield* skillsCommandBase;
      const targetPaths = yield* TargetPaths;
      const workflows = yield* SkillWorkflows;
      const workflowInput = {
        global: skillsCommand.global,
        requestedSkillName: Option.isSome(input.requestedSkillName)
          ? input.requestedSkillName.value
          : undefined,
      };

      yield* Effect.matchEffect(targetPaths.resolve(workflowInput), {
        onFailure: (error) => Console.error(renderUpdateWorkflowFailure(error, workflowInput)),
        onSuccess: (target) =>
          Effect.gen(function* () {
            const maybeRequestedSkillName = Option.isSome(input.requestedSkillName)
              ? Effect.succeed(Option.some(input.requestedSkillName.value))
              : promptForInstalledSkill("update", skillsCommand.global);

            yield* Effect.matchEffect(maybeRequestedSkillName, {
              onFailure: (error) =>
                Console.error(
                  error._tag === "PlatformError"
                    ? renderReadOnlyFailure(
                        "Error: failed to refresh installed skills",
                        { target },
                        [renderPlatformFailureReason(error)],
                      )
                    : error._tag === "QuitError"
                      ? renderSelectionCancelled("update", target)
                      : renderUpdateWorkflowFailure(error, workflowInput, target),
                ),
              onSuccess: (requestedSkillNameOption) =>
                Option.isNone(requestedSkillNameOption)
                  ? Console.log(renderNoEligibleSelection("update", target))
                  : Effect.matchEffect(
                      workflows.update({
                        global: skillsCommand.global,
                        requestedSkillName: requestedSkillNameOption.value,
                      }),
                      {
                        onFailure: (error) =>
                          Console.error(
                            error._tag === "PlatformError"
                              ? renderReadOnlyFailure(
                                  "Error: failed to refresh installed skills",
                                  { target },
                                  [renderPlatformFailureReason(error)],
                                )
                              : renderUpdateWorkflowFailure(
                                  error,
                                  {
                                    global: skillsCommand.global,
                                    requestedSkillName: requestedSkillNameOption.value,
                                  },
                                  target,
                                ),
                          ),
                        onSuccess: (result) => Console.log(renderUpdateWorkflowResult(result)),
                      },
                    ),
            });
          }),
      });
    }),
  ),
);

export const skillsRootCommand = skillsCommandBase.pipe(
  Command.withSubcommands([
    listCommand,
    discoverCommand,
    installCommand,
    uninstallCommand,
    updateCommand,
  ]),
);

export const dotaiCommand = Command.make("dotai").pipe(
  Command.withSubcommands([skillsRootCommand]),
);

export const cliVersion = "0.0.0";

export const runDotaiCli = (args: ReadonlyArray<string>) =>
  Command.runWith(dotaiCommand, {
    version: cliVersion,
  })(args);
