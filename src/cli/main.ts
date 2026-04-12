import { Effect, Fiber, Layer, ManagedRuntime, Runtime } from "effect";
import { Command } from "effect/unstable/cli";

import { cliVersion, dotaiCommand } from "./app";
import { MainLayer } from "../dotai/SkillWorkflows";
import * as BunServices from "../platform/BunServices";

const mainLayer = MainLayer.pipe(Layer.provide(BunServices.layer));
const runtime = ManagedRuntime.make(Layer.mergeAll(BunServices.layer, mainLayer));

const program = Effect.promise(() =>
  runtime.runPromise(
    Command.run(dotaiCommand, {
      version: cliVersion,
    }),
  ),
);

const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
  const interrupt = () => {
    Effect.runFork(Fiber.interrupt(fiber));
  };

  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  fiber.addObserver((exit) => {
    teardown(exit, (code) => process.exit(code));
  });
});

runMain(program);
