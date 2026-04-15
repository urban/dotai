#!/usr/bin/env bun

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

import { MainLayer } from "../dotai/SkillWorkflows";
import { cliVersion, dotaiCommand } from "./app";

const platformLayer = BunServices.layer;
const appLayer = Layer.mergeAll(platformLayer, MainLayer.pipe(Layer.provide(platformLayer)));

Command.run(dotaiCommand, {
  version: cliVersion,
}).pipe(Effect.provide(appLayer), BunRuntime.runMain);
