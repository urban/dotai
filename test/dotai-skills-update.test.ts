import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "@effect/vitest";

import {
  LockfileStore,
  MutationExecutor,
  renderUpdateWorkflowFailure,
  renderUpdateWorkflowResult,
  runDotaiCli,
  SkillWorkflows,
} from "../src/index";
import { LockfileWriteError, MutationExecutionError } from "../src/dotai/domain";
import {
  makeDotaiFixturePaths,
  makeDotaiTestLayer,
  makePromptTerminalLayer,
  promptInput,
  writeSkillFixture,
} from "./dotai-test-kit";
import * as BunServices from "../src/platform/BunServices";

describe("dotai skills update", () => {
  it("refreshes all direct installs from recorded provenance and updates affected dependencies", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-update-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      extraFiles: {
        "version.txt": "beta-v1\n",
      },
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description",
      extraFiles: {
        "version.txt": "alpha-v1\n",
      },
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "gamma-skill", {
      description: "Gamma skill description",
      extraFiles: {
        "version.txt": "gamma-v1\n",
      },
      name: "gamma",
    });

    const runtime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
        yield* workflows.install({
          global: false,
          requestedSkillNames: ["gamma"],
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description updated",
      extraFiles: {
        "version.txt": "beta-v2\n",
      },
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description updated",
      extraFiles: {
        "version.txt": "alpha-v2\n",
      },
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "gamma-skill", {
      description: "Gamma skill description updated",
      extraFiles: {
        "version.txt": "gamma-v2\n",
      },
      name: "gamma",
    });

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.update({
          global: false,
        });
        const rendered = renderUpdateWorkflowResult(result);

        expect(rendered).toContain("Updated skills");
        expect(rendered).toContain("Updated roots:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("- gamma");
        expect(rendered).toContain("Dependencies updated:");
        expect(rendered).toContain("- beta");
        expect(rendered).toContain(`Lock file: ${fixturePaths.lockfilePath}`);
      }),
    );

    expect(readFileSync(fixturePaths.alphaVersionPath, "utf8")).toBe("alpha-v2\n");
    expect(readFileSync(fixturePaths.betaVersionPath, "utf8")).toBe("beta-v2\n");
    expect(readFileSync(fixturePaths.gammaVersionPath, "utf8")).toBe("gamma-v2\n");
  });

  it("refreshes only the requested root plus affected dependencies when invoked selectively", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-update-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      extraFiles: {
        "version.txt": "beta-v1\n",
      },
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description",
      extraFiles: {
        "version.txt": "alpha-v1\n",
      },
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "gamma-skill", {
      description: "Gamma skill description",
      extraFiles: {
        "version.txt": "gamma-v1\n",
      },
      name: "gamma",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
        yield* workflows.install({
          global: false,
          requestedSkillNames: ["gamma"],
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description updated",
      extraFiles: {
        "version.txt": "beta-v2\n",
      },
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description updated",
      extraFiles: {
        "version.txt": "alpha-v2\n",
      },
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "gamma-skill", {
      description: "Gamma skill description updated",
      extraFiles: {
        "version.txt": "gamma-v2\n",
      },
      name: "gamma",
    });

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleLog = console.log;

        console.log = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "update", "alpha"]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Updated skills");
        expect(rendered).toContain("Updated roots:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("Dependencies updated:");
        expect(rendered).toContain("- beta");
        expect(rendered).not.toContain("- gamma");
      }),
    );

    expect(readFileSync(fixturePaths.alphaVersionPath, "utf8")).toBe("alpha-v2\n");
    expect(readFileSync(fixturePaths.betaVersionPath, "utf8")).toBe("beta-v2\n");
    expect(readFileSync(fixturePaths.gammaVersionPath, "utf8")).toBe("gamma-v1\n");
  });

  it("prompts only direct operator-visible installed skills when update is invoked without a skill name", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-update-");
    const terminalOutput: Array<string> = [];

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      extraFiles: {
        "version.txt": "beta-v1\n",
      },
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description",
      extraFiles: {
        "version.txt": "alpha-v1\n",
      },
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "gamma-skill", {
      description: "Gamma skill description",
      extraFiles: {
        "version.txt": "gamma-v1\n",
      },
      name: "gamma",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "hidden-skill", {
      description: "Hidden helper skill",
      extraFiles: {
        "version.txt": "hidden-v1\n",
      },
      internal: true,
      name: "hidden-helper",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        BunServices.coreLayer,
        BunServices.stdioLayer,
        makeDotaiTestLayer(fixturePaths),
        makePromptTerminalLayer([promptInput.down(), promptInput.enter()], terminalOutput),
      ),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
        yield* workflows.install({
          global: false,
          requestedSkillNames: ["gamma"],
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description updated",
      extraFiles: {
        "version.txt": "beta-v2\n",
      },
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta", "hidden-helper"],
      description: "Alpha skill description updated",
      extraFiles: {
        "version.txt": "alpha-v2\n",
      },
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "gamma-skill", {
      description: "Gamma skill description updated",
      extraFiles: {
        "version.txt": "gamma-v2\n",
      },
      name: "gamma",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "hidden-skill", {
      description: "Hidden helper skill updated",
      extraFiles: {
        "version.txt": "hidden-v2\n",
      },
      internal: true,
      name: "hidden-helper",
    });

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleLog = console.log;

        console.log = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "update"]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");
        const prompted = terminalOutput.join("");

        expect(prompted).toContain("Select a skill to update:");
        expect(prompted).toContain("alpha");
        expect(prompted).toContain("gamma");
        expect(prompted).not.toContain("beta");
        expect(prompted).not.toContain("hidden-helper");
        expect(rendered).toContain("Updated skills");
        expect(rendered).toContain("Updated roots:");
        expect(rendered).toContain("- gamma");
        expect(rendered).not.toContain("- alpha");
      }),
    );

    expect(readFileSync(fixturePaths.alphaVersionPath, "utf8")).toBe("alpha-v1\n");
    expect(readFileSync(fixturePaths.betaVersionPath, "utf8")).toBe("beta-v1\n");
    expect(readFileSync(fixturePaths.gammaVersionPath, "utf8")).toBe("gamma-v2\n");
  });

  it("fails with explicit skill and source context when a recorded source can no longer be refreshed", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-update-");

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      description: "Alpha skill description",
      extraFiles: {
        "version.txt": "alpha-v1\n",
      },
      name: "alpha",
    });

    const runtime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    const installedSkillBefore = readFileSync(fixturePaths.alphaVersionPath, "utf8");
    const lockfileBefore = readFileSync(fixturePaths.lockfilePath, "utf8");

    rmSync(fixturePaths.sourceRoot, {
      force: true,
      recursive: true,
    });

    const rendered = await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        return yield* workflows
          .update({
            global: false,
            requestedSkillName: "alpha",
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                error._tag === "PlatformError"
                  ? error.reason.message
                  : renderUpdateWorkflowFailure(error, {
                      global: false,
                      requestedSkillName: "alpha",
                    }),
              onSuccess: () => "unexpected success",
            }),
          );
      }),
    );

    expect(rendered).toContain("Error: failed to refresh recorded source");
    expect(rendered).toContain(`Source: ${fixturePaths.sourceRoot}`);
    expect(rendered).toContain("Skill: alpha");
    expect(rendered).toContain("No files or lock file were changed.");
    expect(existsSync(fixturePaths.alphaVersionPath)).toBe(true);
    expect(readFileSync(fixturePaths.alphaVersionPath, "utf8")).toBe(installedSkillBefore);
    expect(readFileSync(fixturePaths.lockfilePath, "utf8")).toBe(lockfileBefore);
  });

  it("rolls back staged updates when a refreshed skill copy fails after prior removals", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-update-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      extraFiles: {
        "version.txt": "beta-v1\n",
      },
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description",
      extraFiles: {
        "version.txt": "alpha-v1\n",
      },
      name: "alpha",
    });

    const baseRuntime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    await baseRuntime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description updated",
      extraFiles: {
        "version.txt": "beta-v2\n",
      },
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description updated",
      extraFiles: {
        "version.txt": "alpha-v2\n",
      },
      name: "alpha",
    });

    const lockfileBefore = readFileSync(fixturePaths.lockfilePath, "utf8");
    const alphaBefore = readFileSync(fixturePaths.alphaVersionPath, "utf8");
    const betaBefore = readFileSync(fixturePaths.betaVersionPath, "utf8");

    const failingMutationExecutorLayer = Layer.effect(
      MutationExecutor,
      Effect.gen(function* () {
        const mutationExecutor = yield* MutationExecutor;

        return MutationExecutor.of({
          ...mutationExecutor,
          installSkill: (target, skill) =>
            skill.skillName === "alpha"
              ? Effect.fail(
                  new MutationExecutionError({
                    path: join(target.skillsPath, skill.skillName),
                    reason: "Injected copy failure.",
                  }),
                )
              : mutationExecutor.installSkill(target, skill),
        });
      }),
    ).pipe(Layer.provide(MutationExecutor.layer), Layer.provide(BunServices.layer));

    const failingRuntime = ManagedRuntime.make(
      makeDotaiTestLayer(fixturePaths, {
        mutationExecutorLayer: failingMutationExecutorLayer,
      }),
    );

    const rendered = await failingRuntime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        return yield* workflows
          .update({
            global: false,
            requestedSkillName: "alpha",
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                error._tag === "PlatformError"
                  ? error.reason.message
                  : renderUpdateWorkflowFailure(error, {
                      global: false,
                      requestedSkillName: "alpha",
                    }),
              onSuccess: () => "unexpected success",
            }),
          );
      }),
    );

    expect(rendered).toContain("Error: failed to refresh installed skill");
    expect(rendered).toContain("Injected copy failure.");
    expect(rendered).toContain(
      "Staged filesystem changes were rolled back. The previously committed state was restored.",
    );
    expect(readFileSync(fixturePaths.alphaVersionPath, "utf8")).toBe(alphaBefore);
    expect(readFileSync(fixturePaths.betaVersionPath, "utf8")).toBe(betaBefore);
    expect(readFileSync(fixturePaths.lockfilePath, "utf8")).toBe(lockfileBefore);
  });

  it("rolls back staged updates when lock persistence fails after refreshed files were installed", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-update-");

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      description: "Alpha skill description",
      extraFiles: {
        "version.txt": "alpha-v1\n",
      },
      name: "alpha",
    });

    const baseRuntime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    await baseRuntime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      description: "Alpha skill description updated",
      extraFiles: {
        "version.txt": "alpha-v2\n",
      },
      name: "alpha",
    });

    const lockfileBefore = readFileSync(fixturePaths.lockfilePath, "utf8");
    const alphaBefore = readFileSync(fixturePaths.alphaVersionPath, "utf8");

    const failingLockfileStoreLayer = Layer.succeed(
      LockfileStore,
      LockfileStore.of({
        read: () =>
          Effect.succeed({
            skills: {
              alpha: {
                requiredBy: [],
                source: {
                  _tag: "LocalSource",
                  filepath: fixturePaths.sourceRoot,
                },
              },
            },
            version: 1,
          }),
        write: (lockfilePath) =>
          Effect.fail(
            new LockfileWriteError({
              lockfilePath,
              reason: "Injected update lock write failure.",
            }),
          ),
      }),
    );

    const failingRuntime = ManagedRuntime.make(
      makeDotaiTestLayer(fixturePaths, {
        lockfileStoreLayer: failingLockfileStoreLayer,
      }),
    );

    const rendered = await failingRuntime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        return yield* workflows
          .update({
            global: false,
            requestedSkillName: "alpha",
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                error._tag === "PlatformError"
                  ? error.reason.message
                  : renderUpdateWorkflowFailure(error, {
                      global: false,
                      requestedSkillName: "alpha",
                    }),
              onSuccess: () => "unexpected success",
            }),
          );
      }),
    );

    expect(rendered).toContain("Error: failed to write lock file");
    expect(rendered).toContain("Injected update lock write failure.");
    expect(rendered).toContain(
      "Staged filesystem changes were rolled back. The previously committed state was restored.",
    );
    expect(readFileSync(fixturePaths.alphaVersionPath, "utf8")).toBe(alphaBefore);
    expect(readFileSync(fixturePaths.lockfilePath, "utf8")).toBe(lockfileBefore);
  });
});
