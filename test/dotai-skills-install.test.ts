import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "@effect/vitest";

import {
  LockfileStore,
  renderInstallWorkflowFailure,
  renderInstallWorkflowResult,
  runDotaiCli,
  SkillWorkflows,
} from "../src/index";
import type { DotaiLockfile } from "../src/dotai/domain";
import { LockfileWriteError } from "../src/dotai/domain";
import * as BunServices from "@effect/platform-bun/BunServices";

import {
  bunCliTestLayer,
  createBareGitSkillSource,
  makeDotaiFixturePaths,
  makeDotaiTestLayer,
  makePromptTerminalLayer,
  promptInput,
  writeSkillFixture,
} from "./dotai-test-kit";

const renderUnexpectedInstallFailure = (error: { readonly reason: { readonly message: string } }) =>
  error.reason.message;

describe("dotai skills install", () => {
  it("installs one direct skill from an explicit source and persists the first lock entry", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "skill-directory", {
      description: "Alpha skill description",
      name: "alpha",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
        const rendered = renderInstallWorkflowResult(result);

        expect(rendered).toContain("Installed skills");
        expect(rendered).toContain(`Source: ${fixturePaths.sourceRoot}`);
        expect(rendered).toContain("Directly installed:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain(`Lock file: ${fixturePaths.lockfilePath}`);
        expect(rendered).toContain("Lock file updated.");
      }),
    );

    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha", "SKILL.md")),
    ).toBe(true);

    const lockfile = JSON.parse(readFileSync(fixturePaths.lockfilePath, "utf8"));

    expect(lockfile).toEqual({
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
    });
    expect(lockfile).not.toHaveProperty("skills.alpha.implicit");
  });

  it("rolls back the copied skill when lock persistence fails", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "skill-directory", {
      description: "Alpha skill description",
      name: "alpha",
    });

    const emptyLockfile: DotaiLockfile = {
      skills: {},
      version: 1,
    };

    const failingLockfileStoreLayer = Layer.succeed(
      LockfileStore,
      LockfileStore.of({
        read: () => Effect.succeed(emptyLockfile),
        write: (lockfilePath) =>
          Effect.fail(
            new LockfileWriteError({
              lockfilePath,
              reason: "Injected lock write failure.",
            }),
          ),
      }),
    );

    const runtime = ManagedRuntime.make(
      makeDotaiTestLayer(fixturePaths, {
        lockfileStoreLayer: failingLockfileStoreLayer,
      }),
    );

    await expect(
      runtime.runPromise(
        Effect.gen(function* () {
          const workflows = yield* SkillWorkflows;

          yield* workflows.install({
            global: false,
            requestedSkillNames: ["alpha"],
            source: fixturePaths.sourceRoot,
          });
        }),
      ),
    ).rejects.toMatchObject({
      _tag: "LockfileWriteError",
    });

    expect(existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha"))).toBe(false);
    expect(existsSync(fixturePaths.lockfilePath)).toBe(false);
  });

  it("installs same-source dependencies including hidden helper skills", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "helper-skill", {
      description: "Helper skill description",
      internal: true,
      name: "helper",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["helper"],
      description: "Alpha skill description",
      name: "alpha",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
        const rendered = renderInstallWorkflowResult(result);

        expect(rendered).toContain("Directly installed:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("Dependencies installed:");
        expect(rendered).toContain("- helper");
      }),
    );

    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "helper", "SKILL.md")),
    ).toBe(true);

    const lockfile = JSON.parse(readFileSync(fixturePaths.lockfilePath, "utf8"));

    expect(lockfile).toEqual({
      skills: {
        alpha: {
          requiredBy: [],
          source: {
            _tag: "LocalSource",
            filepath: fixturePaths.sourceRoot,
          },
        },
        helper: {
          implicit: true,
          requiredBy: ["alpha"],
          source: {
            _tag: "LocalSource",
            filepath: fixturePaths.sourceRoot,
          },
        },
      },
      version: 1,
    });
  });

  it("installs multiple selected roots and deduplicates shared dependencies", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "helper-skill", {
      description: "Helper skill description",
      internal: true,
      name: "helper",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["helper"],
      description: "Alpha skill description",
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      dependencies: ["helper"],
      description: "Beta skill description",
      name: "beta",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha", "beta"],
          source: fixturePaths.sourceRoot,
        });
        const rendered = renderInstallWorkflowResult(result);

        expect(rendered).toContain("Directly installed:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("- beta");
        expect(rendered).toContain("Dependencies installed:");
        expect(rendered).toContain("- helper");
      }),
    );

    const lockfile = JSON.parse(readFileSync(fixturePaths.lockfilePath, "utf8"));

    expect(lockfile).toEqual({
      skills: {
        alpha: {
          requiredBy: [],
          source: {
            _tag: "LocalSource",
            filepath: fixturePaths.sourceRoot,
          },
        },
        beta: {
          requiredBy: [],
          source: {
            _tag: "LocalSource",
            filepath: fixturePaths.sourceRoot,
          },
        },
        helper: {
          implicit: true,
          requiredBy: ["alpha", "beta"],
          source: {
            _tag: "LocalSource",
            filepath: fixturePaths.sourceRoot,
          },
        },
      },
      version: 1,
    });
  });

  it("promotes an implicit dependency to a direct install without reinstalling files", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["beta"],
      description: "Alpha skill description",
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

    const installedHelperPath = join(
      fixturePaths.projectRoot,
      ".agents",
      "skills",
      "beta",
      "local-note.txt",
    );

    writeFileSync(installedHelperPath, "preserve me\n");

    const rendered = await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.install({
          global: false,
          requestedSkillNames: ["beta"],
          source: fixturePaths.sourceRoot,
        });

        return renderInstallWorkflowResult(result);
      }),
    );

    expect(rendered).toContain("Directly installed:");
    expect(rendered).toContain("- beta");
    expect(readFileSync(installedHelperPath, "utf8")).toBe("preserve me\n");

    const lockfile = JSON.parse(readFileSync(fixturePaths.lockfilePath, "utf8"));

    expect(lockfile.skills.beta).toEqual({
      requiredBy: ["alpha"],
      source: {
        _tag: "LocalSource",
        filepath: fixturePaths.sourceRoot,
      },
    });
  });

  it("reports already-direct roots separately when a mixed selection installs new skills", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      description: "Alpha skill description",
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
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

    const rendered = await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha", "beta"],
          source: fixturePaths.sourceRoot,
        });

        return renderInstallWorkflowResult(result);
      }),
    );

    expect(rendered).toContain("Directly installed:");
    expect(rendered).toContain("- beta");
    expect(rendered).toContain("Already direct:");
    expect(rendered).toContain("- alpha");
  });

  it("installs URL-based dependencies from a git source before mutating the target", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");
    const betaSourceUrl = createBareGitSkillSource(
      fixturePaths.fixtureRoot,
      "beta-source",
      (workingTreePath) => {
        writeSkillFixture(workingTreePath, "beta-skill", {
          description: "Beta skill description",
          name: "beta",
        });
      },
    );

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: [betaSourceUrl],
      description: "Alpha skill description",
      name: "alpha",
    });

    const runtime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
        const rendered = renderInstallWorkflowResult(result);

        expect(rendered).toContain("Directly installed:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("Dependencies installed:");
        expect(rendered).toContain("- beta");
      }),
    );

    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "beta", "SKILL.md")),
    ).toBe(true);

    const lockfile = JSON.parse(readFileSync(fixturePaths.lockfilePath, "utf8"));

    expect(lockfile.skills.beta).toEqual({
      implicit: true,
      requiredBy: ["alpha"],
      source: {
        URL: betaSourceUrl,
        _tag: "GitSource",
      },
    });
  });

  it("fails before mutation when a dependency source locator is unsupported", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: ["https://example.com/skills"],
      description: "Alpha skill description",
      name: "alpha",
    });

    const runtime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    const rendered = await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        return yield* workflows
          .install({
            global: false,
            requestedSkillNames: ["alpha"],
            source: fixturePaths.sourceRoot,
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                error._tag === "PlatformError"
                  ? renderUnexpectedInstallFailure(error)
                  : renderInstallWorkflowFailure(error, {
                      global: false,
                      requestedSkillNames: ["alpha"],
                      source: fixturePaths.sourceRoot,
                    }),
              onSuccess: () => "unexpected success",
            }),
          );
      }),
    );

    expect(rendered).toContain("Error: failed to resolve dependency source");
    expect(rendered).toContain("Dependency: https://example.com/skills");
    expect(rendered).toContain("Required by: alpha");
    expect(rendered).toContain("No files or lock file were changed.");
    expect(existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha"))).toBe(false);
    expect(existsSync(fixturePaths.lockfilePath)).toBe(false);
  });

  it("fails before mutation when dependency planning detects a cycle across sources", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");
    const betaSourceRoot = join(fixturePaths.fixtureRoot, "beta-source");

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      dependencies: [betaSourceRoot],
      description: "Alpha skill description",
      name: "alpha",
    });
    writeSkillFixture(betaSourceRoot, "beta-skill", {
      dependencies: [fixturePaths.sourceRoot],
      description: "Beta skill description",
      name: "beta",
    });

    const runtime = ManagedRuntime.make(makeDotaiTestLayer(fixturePaths));

    const rendered = await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;

        return yield* workflows
          .install({
            global: false,
            requestedSkillNames: ["alpha"],
            source: fixturePaths.sourceRoot,
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                error._tag === "PlatformError"
                  ? renderUnexpectedInstallFailure(error)
                  : renderInstallWorkflowFailure(error, {
                      global: false,
                      requestedSkillNames: ["alpha"],
                      source: fixturePaths.sourceRoot,
                    }),
              onSuccess: () => "unexpected success",
            }),
          );
      }),
    );

    expect(rendered).toContain("Error: dependency cycle detected");
    expect(rendered).toContain("alpha [");
    expect(rendered).toContain("beta [");
    expect(rendered).toContain("No files or lock file were changed.");
    expect(existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha"))).toBe(false);
    expect(existsSync(fixturePaths.lockfilePath)).toBe(false);
  });

  it("prompts from operator-visible skills when install is invoked without a skill name", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");
    const terminalOutput: Array<string> = [];

    writeSkillFixture(fixturePaths.sourceRoot, "visible-alpha", {
      description: "Visible alpha skill",
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "visible-beta", {
      description: "Visible beta skill",
      name: "beta",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "hidden-skill", {
      description: "Hidden helper skill",
      internal: true,
      name: "hidden-helper",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        bunCliTestLayer,
        makeDotaiTestLayer(fixturePaths),
        makePromptTerminalLayer([promptInput.space(), promptInput.enter()], terminalOutput),
      ),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleLog = console.log;

        console.log = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "install", fixturePaths.sourceRoot]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");
        const prompted = terminalOutput.join("");

        expect(prompted).toContain("Select skills to install:");
        expect(prompted).toContain("alpha");
        expect(prompted).toContain("beta");
        expect(prompted).not.toContain("hidden-helper");
        expect(rendered).toContain("Installed skills");
        expect(rendered).toContain("Directly installed:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("- beta");
      }),
    );

    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "beta", "SKILL.md")),
    ).toBe(true);
    expect(existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "hidden-helper"))).toBe(
      false,
    );
  });

  it("prompts for installable skills discovered from a git repo skills directory", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");
    const terminalOutput: Array<string> = [];
    const sourceUrl = createBareGitSkillSource(
      fixturePaths.fixtureRoot,
      "skill-catalog",
      (workingTreePath) => {
        writeSkillFixture(workingTreePath, "skills/alpha-skill", {
          description: "Alpha skill description",
          name: "alpha",
        });
        writeSkillFixture(workingTreePath, "skills/.system/hidden-helper", {
          description: "Hidden helper skill",
          internal: true,
          name: "hidden-helper",
        });
      },
    );

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        bunCliTestLayer,
        makeDotaiTestLayer(fixturePaths),
        makePromptTerminalLayer([promptInput.space(), promptInput.enter()], terminalOutput),
      ),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleLog = console.log;

        console.log = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "add", sourceUrl]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");
        const prompted = terminalOutput.join("");

        expect(prompted).toContain("Select skills to install:");
        expect(prompted).toContain("alpha");
        expect(prompted).not.toContain("hidden-helper");
        expect(rendered).toContain("Installed skills");
        expect(rendered).toContain("- alpha");
      }),
    );

    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha", "SKILL.md")),
    ).toBe(true);
  });

  it("renders an explicit no-op when the selected skill is already installed directly", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
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
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });

        const result = yield* workflows.install({
          global: false,
          requestedSkillNames: ["alpha"],
          source: fixturePaths.sourceRoot,
        });
        const rendered = renderInstallWorkflowResult(result);

        expect(rendered).toContain("No changes");
        expect(rendered).toContain(`Lock file: ${fixturePaths.lockfilePath}`);
        expect(rendered).toContain("already installed directly");
        expect(rendered).toContain("No files or lock file were changed.");
      }),
    );
  });

  it("routes the add alias through the multi-root install workflow", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-install-");

    writeSkillFixture(fixturePaths.sourceRoot, "alpha-skill", {
      description: "Alpha skill description",
      name: "alpha",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "beta-skill", {
      description: "Beta skill description",
      name: "beta",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleLog = console.log;

        console.log = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "add", fixturePaths.sourceRoot, "alpha", "beta"]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Installed skills");
        expect(rendered).toContain("Directly installed:");
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("- beta");
      }),
    );

    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "alpha", "SKILL.md")),
    ).toBe(true);
    expect(
      existsSync(join(fixturePaths.projectRoot, ".agents", "skills", "beta", "SKILL.md")),
    ).toBe(true);
  });
});
