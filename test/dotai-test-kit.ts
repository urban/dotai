import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import * as BunChildProcessSpawner from "@effect/platform-bun/BunChildProcessSpawner";
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import * as BunPath from "@effect/platform-bun/BunPath";
import { Cause, Effect, Layer, Option, Queue, Stdio, Terminal } from "effect";

import { makeMainLayer, RuntimeDirectories } from "../src/index";

export type DotaiFixturePaths = ReturnType<typeof makeDotaiFixturePaths>;

export const makeDotaiFixturePaths = (prefix: string) => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), prefix));
  const projectRoot = join(fixtureRoot, "project");
  const homeRoot = join(fixtureRoot, "home");
  const sourceRoot = join(fixtureRoot, "source");
  const localSkillsRoot = join(projectRoot, ".agents", "skills");
  const globalSkillsRoot = join(homeRoot, ".agents", "skills");

  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(homeRoot, { recursive: true });
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(localSkillsRoot, { recursive: true });
  mkdirSync(globalSkillsRoot, { recursive: true });

  return {
    alphaManifestPath: join(projectRoot, ".agents", "skills", "alpha", "SKILL.md"),
    alphaVersionPath: join(projectRoot, ".agents", "skills", "alpha", "version.txt"),
    betaManifestPath: join(projectRoot, ".agents", "skills", "beta", "SKILL.md"),
    betaVersionPath: join(projectRoot, ".agents", "skills", "beta", "version.txt"),
    fixtureRoot,
    gammaVersionPath: join(projectRoot, ".agents", "skills", "gamma", "version.txt"),
    globalSkillsRoot,
    homeRoot,
    installedSkillRoot: join(projectRoot, ".agents", "skills", "alpha"),
    localSkillsRoot,
    lockfilePath: join(projectRoot, "dotai-lock.json"),
    projectRoot,
    sourceRoot,
  };
};

export const bunCoreLayer = BunChildProcessSpawner.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(BunFileSystem.layer, BunPath.layer)),
);

export const bunCliTestLayer = Layer.mergeAll(bunCoreLayer, Stdio.layerTest({}));

export const makeDotaiTestLayer = (
  paths: {
    readonly homeRoot: string;
    readonly projectRoot: string;
  },
  options?: Parameters<typeof makeMainLayer>[1],
) =>
  makeMainLayer(
    RuntimeDirectories.layerForPaths({
      currentWorkingDirectory: paths.projectRoot,
      homeDirectory: paths.homeRoot,
    }),
    options,
  ).pipe(Layer.provide(bunCoreLayer));

const makeUserInput = (options: {
  readonly keyName: string;
  readonly ctrl?: boolean;
  readonly input?: string;
  readonly meta?: boolean;
  readonly shift?: boolean;
}): Terminal.UserInput => ({
  input: Option.fromNullishOr(options.input),
  key: {
    ctrl: options.ctrl ?? false,
    meta: options.meta ?? false,
    name: options.keyName,
    shift: options.shift ?? false,
  },
});

export const promptInput = {
  down: (): Terminal.UserInput => makeUserInput({ keyName: "down" }),
  enter: (): Terminal.UserInput => makeUserInput({ keyName: "enter" }),
  space: (): Terminal.UserInput => makeUserInput({ input: " ", keyName: "space" }),
};

export const makePromptTerminalLayer = (
  inputs: ReadonlyArray<Terminal.UserInput>,
  output: Array<string>,
) =>
  Layer.effect(
    Terminal.Terminal,
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<Terminal.UserInput, Cause.Done>();

      yield* Queue.offerAll(queue, inputs);
      yield* Queue.end(queue);

      return Terminal.make({
        columns: Effect.succeed(80),
        display: (text) =>
          Effect.sync(() => {
            output.push(text);
          }),
        readInput: Effect.succeed(queue),
        readLine: Effect.die(new Error("Test terminal does not implement readLine.")),
      });
    }),
  );

export const writeSkillFixture = (
  skillsRoot: string,
  directoryName: string,
  options: {
    readonly dependencies?: ReadonlyArray<string>;
    readonly description: string;
    readonly extraFiles?: Readonly<Record<string, string>>;
    readonly internal?: boolean;
    readonly name: string;
  },
) => {
  const skillDirectory = join(skillsRoot, directoryName);
  const metadataLines = [
    "metadata:",
    ...(options.internal === true ? ["  internal: true"] : []),
    ...(options.dependencies === undefined || options.dependencies.length === 0
      ? []
      : ["  dependencies:", ...options.dependencies.map((dependency) => `    - ${dependency}`)]),
  ];

  mkdirSync(skillDirectory, { recursive: true });
  writeFileSync(
    join(skillDirectory, "SKILL.md"),
    [
      "---",
      `name: ${options.name}`,
      `description: ${options.description}`,
      ...metadataLines,
      "---",
      "",
      `# ${options.name}`,
      "",
      options.description,
      "",
    ].join("\n"),
  );

  for (const [filename, contents] of Object.entries(options.extraFiles ?? {})) {
    writeFileSync(join(skillDirectory, filename), contents);
  }
};

export const writeInstalledSkillFixture = (skillsRoot: string, skillName: string) => {
  writeSkillFixture(skillsRoot, skillName, {
    description: `${skillName} description`,
    name: skillName,
  });
};

export const initializeGitRepository = (repositoryRoot: string) => {
  execFileSync("git", ["init", "--initial-branch=main"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.name", "DOTAI Test"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.email", "dotai@example.com"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  execFileSync("git", ["add", "."], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
  execFileSync("git", ["commit", "-m", "fixture"], {
    cwd: repositoryRoot,
    stdio: "ignore",
  });
};

export const createBareGitSkillSource = (
  fixtureRoot: string,
  repositoryName: string,
  writeSkills: (workingTreePath: string) => void,
) => {
  const bareRepositoryPath = join(fixtureRoot, `${repositoryName}.git`);
  const workingTreePath = join(fixtureRoot, `${repositoryName}-worktree`);

  execFileSync("git", ["init", "--bare", bareRepositoryPath]);
  execFileSync("git", ["clone", bareRepositoryPath, workingTreePath]);
  execFileSync("git", ["-C", workingTreePath, "config", "user.email", "dotai@example.com"]);
  execFileSync("git", ["-C", workingTreePath, "config", "user.name", "dotai"]);
  writeSkills(workingTreePath);
  execFileSync("git", ["-C", workingTreePath, "add", "."]);
  execFileSync("git", ["-C", workingTreePath, "commit", "-m", "fixture"]);
  execFileSync("git", ["-C", workingTreePath, "push", "origin", "HEAD"]);

  return pathToFileURL(bareRepositoryPath).href;
};
