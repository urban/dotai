import { Console, Effect, Option, Terminal } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { Argument, Command, Flag } from "effect/unstable/cli";

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

const renderSkillPrompt = (
  action: "install" | "uninstall" | "update",
  skillNames: ReadonlyArray<string>,
): string =>
  [
    `Select a skill to ${action}:`,
    ...skillNames.map((skillName, index) => `${index + 1}. ${skillName}`),
    "Enter a number or skill name: ",
  ].join("\n");

const promptForSkillSelection = (
  action: "install" | "uninstall" | "update",
  skillNames: ReadonlyArray<string>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;

      if (skillNames.length === 0) {
        return Option.none<string>();
      }

      const prompt = (): Effect.Effect<string, PlatformError | Terminal.QuitError> =>
        Effect.gen(function* () {
          yield* terminal.display(renderSkillPrompt(action, skillNames));
          const response = yield* terminal.readLine;
          const selection = resolvePromptSelection(skillNames, response);

          if (Option.isSome(selection)) {
            return selection.value;
          }

          yield* terminal.display(`Invalid selection '${response.trim()}'.\n\n`);

          return yield* prompt();
        });

      return Option.some(yield* prompt());
    }),
  );

const promptForInstallSkill = (source: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const sourceWorkspace = yield* SourceWorkspace;
      const skillCatalog = yield* SkillCatalog;
      const stagedSource = yield* sourceWorkspace.stage(source);
      const inventory = yield* skillCatalog.discoverSourceSkills(
        stagedSource.selectionPath,
        stagedSource.normalizedSource,
      );

      return yield* promptForSkillSelection(
        "install",
        inventory.visibleSkills.map((skill) => skill.skillName),
      );
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
      const selectableSkillNames = installedSkills
        .filter((skill) => !skill.manifest.metadata.internal)
        .filter((skill) =>
          action === "uninstall"
            ? true
            : currentLockfile.skills[skill.skillName]?.implicit !== true,
        )
        .map((skill) => skill.skillName);

      return yield* promptForSkillSelection(action, selectableSkillNames);
    }),
  );

const renderSelectionCancelled = (
  action: "install" | "uninstall" | "update",
  target: {
    readonly lockfilePath: string;
    readonly rootPath: string;
    readonly targetKind: "local" | "global";
  },
  source?: string,
): string =>
  renderNoMutationNoop(`${action[0].toUpperCase()}${action.slice(1)} selection was cancelled.`, {
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

const resolvePromptSelection = (
  visibleSkillNames: ReadonlyArray<string>,
  response: string,
): Option.Option<string> => {
  const trimmedResponse = response.trim();

  if (trimmedResponse.length === 0) {
    return Option.none();
  }

  const selectedIndex = Number(trimmedResponse);

  if (Number.isInteger(selectedIndex)) {
    const selectedSkill = visibleSkillNames[selectedIndex - 1];

    return selectedSkill === undefined ? Option.none() : Option.some(selectedSkill);
  }

  return visibleSkillNames.includes(trimmedResponse) ? Option.some(trimmedResponse) : Option.none();
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
  requestedSkillName: Argument.string("skill-name").pipe(Argument.optional),
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
              requestedSkillName: "unknown",
            }),
          ),
        onSuccess: (target) =>
          Effect.gen(function* () {
            const maybeRequestedSkillName = Option.isSome(input.requestedSkillName)
              ? Effect.succeed(Option.some(input.requestedSkillName.value))
              : promptForInstallSkill(input.source);

            yield* Effect.matchEffect(maybeRequestedSkillName, {
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
                            requestedSkillName: "unknown",
                          },
                          target,
                        ),
                ),
              onSuccess: (requestedSkillNameOption) =>
                Option.isNone(requestedSkillNameOption)
                  ? Console.log(renderNoEligibleSelection("install", target, input.source))
                  : Effect.gen(function* () {
                      const workflowInput = {
                        ...targetInput,
                        requestedSkillName: requestedSkillNameOption.value,
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
