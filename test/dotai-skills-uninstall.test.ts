import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "@effect/vitest";

import {
  LockfileStore,
  MutationExecutor,
  renderUninstallWorkflowFailure,
  renderUninstallWorkflowResult,
  runDotaiCli,
  SkillWorkflows,
} from "../src/index";
import type { DotaiLockfile, ResolvedTarget } from "../src/dotai/domain";
import { LockfileWriteError, MutationExecutionError } from "../src/dotai/domain";
import {
  makeDotaiFixturePaths,
  makeDotaiTestLayer,
  makePromptTerminalLayer,
  writeSkillFixture,
} from "./dotai-test-kit";
import * as BunServices from "../src/platform/BunServices";

describe("dotai skills uninstall", () => {
  it("blocks uninstall when installed dependents still require the skill and preserves bytes on disk", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-uninstall-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description",
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "gamma-skill", {
      dependencies: ["beta"],
      description: "Gamma skill description",
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
          requestedSkillName: "alpha",
          source: fixturePaths.sourceRoot,
        });
        yield* workflows.install({
          global: false,
          requestedSkillName: "gamma",
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    const alphaManifestPath = join(
      fixturePaths.projectRoot,
      ".agents",
      "skills",
      "alpha",
      "SKILL.md",
    );
    const betaManifestPath = join(
      fixturePaths.projectRoot,
      ".agents",
      "skills",
      "beta",
      "SKILL.md",
    );
    const alphaManifestBefore = readFileSync(alphaManifestPath, "utf8");
    const betaManifestBefore = readFileSync(betaManifestPath, "utf8");
    const lockfileBefore = readFileSync(fixturePaths.lockfilePath, "utf8");

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.uninstall({
          global: false,
          requestedSkillName: "beta",
        });
        const rendered = renderUninstallWorkflowResult(result);

        expect(rendered).toContain("Uninstall blocked");
        expect(rendered).toContain("Requested skill:");
        expect(rendered).toContain("- beta");
        expect(rendered).toContain("Blocking skills:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("- gamma");
        expect(rendered).toContain("No files or lock file were changed.");
      }),
    );

    expect(existsSync(alphaManifestPath)).toBe(true);
    expect(existsSync(betaManifestPath)).toBe(true);
    expect(readFileSync(alphaManifestPath, "utf8")).toBe(alphaManifestBefore);
    expect(readFileSync(betaManifestPath, "utf8")).toBe(betaManifestBefore);
    expect(readFileSync(fixturePaths.lockfilePath, "utf8")).toBe(lockfileBefore);
  });

  it("routes the remove alias through uninstall and reports the exact blocker set", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-uninstall-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description",
      name: "alpha",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillName: "alpha",
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    const lockfileBefore = readFileSync(fixturePaths.lockfilePath, "utf8");

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleLog = console.log;

        console.log = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "remove", "beta"]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Uninstall blocked");
        expect(rendered).toContain("- beta");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("No files or lock file were changed.");
      }),
    );

    expect(readFileSync(fixturePaths.lockfilePath, "utf8")).toBe(lockfileBefore);
    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "beta", "SKILL.md")),
    ).toBe(true);
  });

  it("prompts from operator-visible installed skills when uninstall is invoked without a skill name", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-uninstall-");
    const terminalOutput: Array<string> = [];

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta", "hidden-helper"],
      description: "Alpha skill description",
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "hidden-skill", {
      description: "Hidden helper skill",
      internal: true,
      name: "hidden-helper",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        BunServices.layer,
        makeDotaiTestLayer(fixturePaths),
        makePromptTerminalLayer(["1"], terminalOutput),
      ),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillName: "alpha",
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleLog = console.log;

        console.log = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "uninstall"]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");
        const prompted = terminalOutput.join("");

        expect(prompted).toContain("Select a skill to uninstall:");
        expect(prompted).toContain("1. alpha");
        expect(prompted).toContain("2. beta");
        expect(prompted).not.toContain("hidden-helper");
        expect(rendered).toContain("Removed skills");
        expect(rendered).toContain("Removed:");
        expect(rendered).toContain("- alpha");
      }),
    );

    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha", "SKILL.md")),
    ).toBe(false);
    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "beta", "SKILL.md")),
    ).toBe(true);
  });

  it("removes an unblocked skill, refreshes lock relationships, and reports prune candidates", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-uninstall-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description",
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "gamma-skill", {
      dependencies: ["beta"],
      description: "Gamma skill description",
      name: "gamma",
    });

    const runtime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillName: "alpha",
          source: fixturePaths.sourceRoot,
        });
        yield* workflows.install({
          global: false,
          requestedSkillName: "gamma",
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.uninstall({
          global: false,
          requestedSkillName: "alpha",
        });
      }),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.uninstall({
          global: false,
          requestedSkillName: "gamma",
        });
        const rendered = renderUninstallWorkflowResult(result);

        expect(rendered).toContain("Removed skills");
        expect(rendered).toContain("Removed:");
        expect(rendered).toContain("- gamma");
        expect(rendered).toContain("Prune candidates:");
        expect(rendered).toContain("- beta");
        expect(rendered).toContain("Lock file updated.");
      }),
    );

    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha", "SKILL.md")),
    ).toBe(false);
    expect(existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "gamma"))).toBe(false);
    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "beta", "SKILL.md")),
    ).toBe(true);

    const lockfile = JSON.parse(readFileSync(fixturePaths.lockfilePath, "utf8"));

    expect(lockfile).toEqual({
      skills: {
        beta: {
          implicit: true,
          requiredBy: [],
          source: {
            _tag: "LocalSource",
            filepath: fixturePaths.sourceRoot,
          },
        },
      },
      version: 1,
    });
  });

  it("restores the removed skill when lock persistence fails during uninstall", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-uninstall-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
    });

    const baseRuntime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    await baseRuntime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillName: "beta",
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    const lockfileBeforeText = readFileSync(fixturePaths.lockfilePath, "utf8");
    const betaManifestPath = join(
      fixturePaths.projectRoot,
      ".agents",
      "skills",
      "beta",
      "SKILL.md",
    );
    const installedSkillBefore = readFileSync(betaManifestPath, "utf8");
    const target: ResolvedTarget = {
      lockfilePath: fixturePaths.lockfilePath,
      rootPath: fixturePaths.projectRoot,
      skillsPath: join(fixturePaths.projectRoot, ".agents", "skills"),
      stagingPath: join(fixturePaths.projectRoot, ".agents", ".dotai-stage"),
      targetKind: "local",
    };
    const lockfileBefore: DotaiLockfile = {
      skills: {
        beta: {
          requiredBy: [],
          source: {
            _tag: "LocalSource",
            filepath: fixturePaths.sourceRoot,
          },
        },
      },
      version: 1,
    };

    const failingLockfileStoreLayer = Layer.succeed(
      LockfileStore,
      LockfileStore.of({
        read: () => Effect.succeed(lockfileBefore),
        write: (lockfilePath) =>
          Effect.fail(
            new LockfileWriteError({
              lockfilePath,
              reason: "Injected lock write failure.",
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
          .uninstall({
            global: false,
            requestedSkillName: "beta",
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                error._tag === "PlatformError"
                  ? error.reason.message
                  : renderUninstallWorkflowFailure(error, target),
              onSuccess: () => "unexpected success",
            }),
          );
      }),
    );

    expect(rendered).toContain("Error: failed to write lock file");
    expect(rendered).toContain("Injected lock write failure.");
    expect(rendered).toContain(
      "Staged filesystem changes were rolled back. The previously committed state was restored.",
    );
    expect(readFileSync(fixturePaths.lockfilePath, "utf8")).toBe(lockfileBeforeText);
    expect(readFileSync(betaManifestPath, "utf8")).toBe(installedSkillBefore);
  });

  it("reports a no-mutation failure when uninstall staging fails before the commit boundary", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-uninstall-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
    });

    const baseRuntime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    await baseRuntime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        yield* workflows.install({
          global: false,
          requestedSkillName: "beta",
          source: fixturePaths.sourceRoot,
        });
      }),
    );

    const lockfileBeforeText = readFileSync(fixturePaths.lockfilePath, "utf8");
    const betaManifestPath = join(
      fixturePaths.projectRoot,
      ".agents",
      "skills",
      "beta",
      "SKILL.md",
    );
    const installedSkillBefore = readFileSync(betaManifestPath, "utf8");
    const target: ResolvedTarget = {
      lockfilePath: fixturePaths.lockfilePath,
      rootPath: fixturePaths.projectRoot,
      skillsPath: join(fixturePaths.projectRoot, ".agents", "skills"),
      stagingPath: join(fixturePaths.projectRoot, ".agents", ".dotai-stage"),
      targetKind: "local",
    };

    const failingMutationExecutorLayer = Layer.succeed(
      MutationExecutor,
      MutationExecutor.of({
        commitStagedSkillRemoval: () => Effect.void,
        installSkill: () => Effect.void,
        removeSkill: () => Effect.void,
        rollbackStagedSkillRemoval: () => Effect.void,
        stageSkillRemoval: (_target, _skillName) =>
          Effect.fail(
            new MutationExecutionError({
              path: betaManifestPath,
              reason: "Injected rename failure.",
            }),
          ),
      }),
    );

    const failingRuntime = ManagedRuntime.make(
      makeDotaiTestLayer(fixturePaths, {
        mutationExecutorLayer: failingMutationExecutorLayer,
      }),
    );

    const rendered = await failingRuntime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        return yield* workflows
          .uninstall({
            global: false,
            requestedSkillName: "beta",
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                error._tag === "PlatformError"
                  ? error.reason.message
                  : renderUninstallWorkflowFailure(error, target),
              onSuccess: () => "unexpected success",
            }),
          );
      }),
    );

    expect(rendered).toContain("Error: failed to uninstall skill");
    expect(rendered).toContain("Injected rename failure.");
    expect(rendered).toContain("No files or lock file were changed.");
    expect(readFileSync(fixturePaths.lockfilePath, "utf8")).toBe(lockfileBeforeText);
    expect(readFileSync(betaManifestPath, "utf8")).toBe(installedSkillBefore);
  });
});
