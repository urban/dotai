import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

describe("test tooling", () => {
  it.effect("runs Effect-based tests with @effect/vitest", () =>
    Effect.gen(function* () {
      const value = yield* Effect.succeed("ok");

      expect(value).toBe("ok");
    }),
  );

  it.effect("provides the Effect test context", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Effect.sleep(1_000).pipe(Effect.as("done")));

      yield* TestClock.adjust(1_000);

      const value = yield* Fiber.join(fiber);

      expect(value).toBe("done");
    }),
  );
});
