import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, it, layer } from "@effect/vitest";

import {
  renderDiscoverWorkflowResult,
  renderListWorkflowResult,
  runDotaiCli,
  SkillWorkflows,
} from "../src/index";
import {
  initializeGitRepository,
  makeDotaiFixturePaths,
  makeDotaiTestLayer,
  writeInstalledSkillFixture,
  writeSkillFixture,
} from "./dotai-test-kit";
import * as BunServices from "@effect/platform-bun/BunServices";

describe("dotai skills list", () => {
  const listFixture = makeDotaiFixturePaths("dotai-skills-list-layer-");
  writeInstalledSkillFixture(listFixture.localSkillsRoot, "alpha");
  writeInstalledSkillFixture(listFixture.localSkillsRoot, "beta");

  layer(makeDotaiTestLayer(listFixture))("shared layer setup", (it) => {
    it.effect("lists locally installed skills with explicit target context", () =>
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.list({
          global: false,
        });
        const rendered = renderListWorkflowResult(result);

        expect(rendered).toContain("Target: local");
        expect(rendered).toContain(`Target root: ${listFixture.projectRoot}`);
        expect(rendered).toContain("- alpha");
        expect(rendered).toContain("- beta");
        expect(rendered).not.toContain(".dotai-lock.json");
      }),
    );
  });

  it("routes dotai skills list --global through the command tree", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-list-");
    writeInstalledSkillFixture(fixturePaths.globalSkillsRoot, "global-skill");
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
          yield* runDotaiCli(["skills", "list", "--global"]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Target: global");
        expect(rendered).toContain(`Target root: ${fixturePaths.homeRoot}`);
        expect(rendered).toContain("- global-skill");
      }),
    );
  });

  it("discovers local-path source skills while hiding internal helpers from operator output", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-list-");
    mkdirSync(fixturePaths.sourceRoot, { recursive: true });
    writeSkillFixture(fixturePaths.sourceRoot, "visible-directory", {
      description: "Visible source skill",
      name: "visible-skill",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "hidden-directory", {
      description: "Hidden helper skill",
      internal: true,
      name: "hidden-helper",
    });
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.discover({
          global: false,
          source: fixturePaths.sourceRoot,
        });
        const rendered = renderDiscoverWorkflowResult(result);

        expect(result.visibleSkills.map((skill) => skill.skillName)).toEqual(["visible-skill"]);
        expect(result.allSkills.map((skill) => skill.skillName)).toEqual([
          "hidden-helper",
          "visible-skill",
        ]);
        expect(rendered).toContain("Discovered skills");
        expect(rendered).toContain(`Source: ${fixturePaths.sourceRoot}`);
        expect(rendered).toContain("- visible-skill");
        expect(rendered).not.toContain("hidden-helper");
      }),
    );
  });

  it("discovers source skills from the supported repo search locations in precedence order", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-list-");
    mkdirSync(fixturePaths.sourceRoot, { recursive: true });

    writeSkillFixture(fixturePaths.sourceRoot, ".", {
      description: "Root skill",
      name: "root-skill",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "skills/visible-skill", {
      description: "Visible skill under skills",
      name: "visible-skill",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "skills/.curated/curated-skill", {
      description: "Curated skill",
      name: "curated-skill",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "skills/.experimental/experimental-skill", {
      description: "Experimental skill",
      name: "experimental-skill",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "skills/.system/system-helper", {
      description: "System helper skill",
      internal: true,
      name: "system-helper",
    });
    writeSkillFixture(fixturePaths.sourceRoot, ".agents/skills/agent-skill", {
      description: "Agent skill",
      name: "agent-skill",
    });
    writeSkillFixture(fixturePaths.sourceRoot, "skills/root-skill-shadow", {
      description: "Shadowed duplicate skill",
      name: "root-skill",
    });

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const workflows = yield* SkillWorkflows;
        const result = yield* workflows.discover({
          global: false,
          source: fixturePaths.sourceRoot,
        });

        expect(result.visibleSkills.map((skill) => skill.skillName)).toEqual([
          "agent-skill",
          "curated-skill",
          "experimental-skill",
          "root-skill",
          "visible-skill",
        ]);
        expect(result.allSkills.map((skill) => skill.skillName)).toEqual([
          "agent-skill",
          "curated-skill",
          "experimental-skill",
          "root-skill",
          "system-helper",
          "visible-skill",
        ]);
        expect(result.allSkills.find((skill) => skill.skillName === "root-skill")?.skillPath).toBe(
          fixturePaths.sourceRoot,
        );
      }),
    );
  });

  it("routes git-backed discovery through the command tree and keeps target inventory untouched", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-list-");
    mkdirSync(fixturePaths.sourceRoot, { recursive: true });
    writeSkillFixture(fixturePaths.sourceRoot, "git-visible", {
      description: "Git-backed visible skill",
      name: "git-visible",
    });
    initializeGitRepository(fixturePaths.sourceRoot);
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
          yield* runDotaiCli(["skills", "discover", pathToFileURL(fixturePaths.sourceRoot).href]);
        } finally {
          console.log = originalConsoleLog;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Discovered skills");
        expect(rendered).toContain("Source: file://");
        expect(rendered).toContain("- git-visible");
        expect(rendered).not.toContain("hidden-helper");
        expect(rendered).toContain(`Target root: ${fixturePaths.projectRoot}`);
      }),
    );
  });

  it("fails discovery for an unsupported source locator with a no-mutation footer", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-list-");
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleError = console.error;

        console.error = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "discover", "ftp://example.com/skills"]);
        } finally {
          console.error = originalConsoleError;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Error: invalid source locator");
        expect(rendered).toContain("Source: ftp://example.com/skills");
        expect(rendered).toContain("No files or lock file were changed.");
        expect(readdirSync(fixturePaths.localSkillsRoot)).toEqual([]);
        expect(existsSync(join(fixturePaths.projectRoot, "dotai-lock.json"))).toBe(false);
      }),
    );
  });

  it("fails discovery for a missing local source root with path context and no mutation", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-list-");
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleError = console.error;
        const missingPath = join(fixturePaths.projectRoot, "missing-source");

        console.error = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "discover", "./missing-source"]);
        } finally {
          console.error = originalConsoleError;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Error: missing discovery root");
        expect(rendered).toContain(`Path: ${missingPath}`);
        expect(rendered).toContain("No files or lock file were changed.");
        expect(readdirSync(fixturePaths.localSkillsRoot)).toEqual([]);
        expect(existsSync(join(fixturePaths.projectRoot, "dotai-lock.json"))).toBe(false);
      }),
    );
  });

  it("fails discovery for a malformed source manifest instead of silently skipping it", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-list-");
    const brokenSkillRoot = join(fixturePaths.sourceRoot, "broken-skill");
    mkdirSync(brokenSkillRoot, { recursive: true });
    writeFileSync(join(brokenSkillRoot, "SKILL.md"), "# broken\n");
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleError = console.error;

        console.error = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "discover", fixturePaths.sourceRoot]);
        } finally {
          console.error = originalConsoleError;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Error: invalid skill manifest");
        expect(rendered).toContain(`Manifest: ${join(brokenSkillRoot, "SKILL.md")}`);
        expect(rendered).toContain("No files or lock file were changed.");
        expect(readdirSync(fixturePaths.localSkillsRoot)).toEqual([]);
      }),
    );
  });

  it("fails list when an installed skill manifest is malformed", async () => {
    const fixturePaths = makeDotaiFixturePaths("dotai-skills-list-");
    const brokenSkillRoot = join(fixturePaths.localSkillsRoot, "broken-installed");
    mkdirSync(brokenSkillRoot, { recursive: true });
    writeFileSync(join(brokenSkillRoot, "SKILL.md"), "# broken\n");
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(BunServices.layer, makeDotaiTestLayer(fixturePaths)),
    );

    await runtime.runPromise(
      Effect.gen(function* () {
        const output: Array<string> = [];
        const originalConsoleError = console.error;

        console.error = (...args: ReadonlyArray<unknown>) => {
          output.push(args.map((value) => String(value)).join(" "));
        };

        try {
          yield* runDotaiCli(["skills", "list"]);
        } finally {
          console.error = originalConsoleError;
        }

        const rendered = output.join("\n");

        expect(rendered).toContain("Error: invalid skill manifest");
        expect(rendered).toContain(`Manifest: ${join(brokenSkillRoot, "SKILL.md")}`);
        expect(rendered).toContain("No files or lock file were changed.");
        expect(existsSync(join(fixturePaths.projectRoot, "dotai-lock.json"))).toBe(false);
      }),
    );
  });
});
