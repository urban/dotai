import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { type ChildProcess as NodeChildProcess, spawn as spawnProcess } from "node:child_process";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import readline from "node:readline";

import {
  Cause,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  Sink,
  Stdio,
  Stream,
  Terminal,
} from "effect";
import * as PlatformError from "effect/PlatformError";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import type { Command as ChildProcessCommand } from "effect/unstable/process/ChildProcess";

const unsupported = (method: string) =>
  Effect.die(new Error(`BunServices does not implement ${method} in DOTAI-001.`));

const resolveSystemErrorTag = (cause: unknown): PlatformError.SystemErrorTag => {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return "Unknown";
  }

  switch (cause.code) {
    case "ENOENT":
      return "NotFound";
    case "EEXIST":
      return "AlreadyExists";
    case "EACCES":
    case "EPERM":
      return "PermissionDenied";
    case "ENOTEMPTY":
    case "EBUSY":
      return "Busy";
    case "EISDIR":
    case "ENOTDIR":
      return "BadResource";
    case "EINVAL":
      return "InvalidData";
    case "ETIMEDOUT":
      return "TimedOut";
    default:
      return "Unknown";
  }
};

const fromError = (method: string, pathOrDescriptor?: string | number) => (cause: unknown) =>
  PlatformError.systemError({
    _tag: resolveSystemErrorTag(cause),
    cause,
    method,
    module: "FileSystem",
    pathOrDescriptor,
  });

const waitForExit = (
  childProcess: NodeChildProcess,
  commandDescription: string,
): Effect.Effect<ChildProcessSpawner.ExitCode, PlatformError.PlatformError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<ChildProcessSpawner.ExitCode>((resolve, reject) => {
        childProcess.once("error", (cause) => {
          reject(fromError("spawn", commandDescription)(cause));
        });
        childProcess.once("close", (code) => {
          resolve(ChildProcessSpawner.ExitCode(code ?? 1));
        });
      }),
    catch: (cause) =>
      cause instanceof Error
        ? fromError("spawn", commandDescription)(cause)
        : fromError("spawn", commandDescription)(cause),
  });

const resolveEnvironment = (
  command: ChildProcessCommand,
): Record<string, string | undefined> | undefined => {
  if (command._tag !== "StandardCommand") {
    return undefined;
  }

  if (command.options.env === undefined) {
    return command.options.extendEnv === false ? {} : process.env;
  }

  return command.options.extendEnv === false
    ? command.options.env
    : {
        ...process.env,
        ...command.options.env,
      };
};

const collectStringOutput = (
  command: ChildProcessCommand,
  includeStderr: boolean,
): Effect.Effect<string, PlatformError.PlatformError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        if (command._tag !== "StandardCommand") {
          reject(
            PlatformError.badArgument({
              description: "Piped commands are not supported.",
              method: "spawn",
              module: "ChildProcessSpawner",
            }),
          );
          return;
        }

        const childProcess = spawnProcess(command.command, [...command.args], {
          cwd: command.options.cwd,
          detached: command.options.detached,
          env: resolveEnvironment(command),
          shell: command.options.shell,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";

        childProcess.stdout?.setEncoding("utf8");
        childProcess.stderr?.setEncoding("utf8");
        childProcess.stdout?.on("data", (chunk: string) => {
          output += chunk;
        });

        if (includeStderr) {
          childProcess.stderr?.on("data", (chunk: string) => {
            output += chunk;
          });
        }

        childProcess.once("error", (cause) => {
          reject(fromError("spawn", command.command)(cause));
        });
        childProcess.once("close", () => {
          resolve(output);
        });
      }),
    catch: (cause) =>
      cause instanceof PlatformError.PlatformError
        ? cause
        : fromError("spawn", "collectStringOutput")(cause),
  });

const fileSystemLayer = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.make({
    access: (path, _options) =>
      Effect.tryPromise({
        try: () => stat(path).then(() => undefined),
        catch: fromError("access", path),
      }),
    chmod: () => unsupported("chmod"),
    chown: () => unsupported("chown"),
    copy: () => unsupported("copy"),
    copyFile: () => unsupported("copyFile"),
    link: () => unsupported("link"),
    makeDirectory: (path, options) =>
      Effect.tryPromise({
        try: () =>
          mkdir(path, {
            mode: options?.mode,
            recursive: options?.recursive ?? false,
          }).then(() => undefined),
        catch: fromError("makeDirectory", path),
      }),
    makeTempDirectory: (options) =>
      Effect.tryPromise({
        try: () =>
          mkdtemp(nodePath.join(options?.directory ?? tmpdir(), options?.prefix ?? "dotai-")),
        catch: fromError("makeTempDirectory"),
      }),
    makeTempDirectoryScoped: () => unsupported("makeTempDirectoryScoped"),
    makeTempFile: () => unsupported("makeTempFile"),
    makeTempFileScoped: () => unsupported("makeTempFileScoped"),
    open: () => unsupported("FileSystem.open"),
    readDirectory: (path) =>
      Effect.tryPromise({
        try: () => readdir(path),
        catch: fromError("readDirectory", path),
      }),
    readFile: (path) =>
      Effect.tryPromise({
        try: async () => new Uint8Array(await readFile(path)),
        catch: fromError("readFile", path),
      }),
    readLink: () => unsupported("readLink"),
    realPath: (path) =>
      Effect.tryPromise({
        try: () => realpath(path),
        catch: fromError("realPath", path),
      }),
    remove: (path, options) =>
      Effect.tryPromise({
        try: () =>
          rm(path, {
            force: options?.force ?? false,
            recursive: options?.recursive ?? false,
          }),
        catch: fromError("remove", path),
      }),
    rename: (oldPath, newPath) =>
      Effect.tryPromise({
        try: () => rename(oldPath, newPath),
        catch: fromError("rename", `${oldPath} -> ${newPath}`),
      }),
    stat: (path) =>
      Effect.tryPromise({
        try: async () => {
          const info = await stat(path);

          return {
            atime: Option.some(info.atime),
            birthtime: Option.some(info.birthtime),
            blksize: Option.none(),
            blocks: Option.none(),
            dev: info.dev,
            gid: Option.some(info.gid),
            ino: Option.some(info.ino),
            mode: info.mode,
            mtime: Option.some(info.mtime),
            nlink: Option.some(info.nlink),
            rdev: Option.some(info.rdev),
            size: FileSystem.Size(info.size),
            type: info.isDirectory() ? "Directory" : info.isFile() ? "File" : "Unknown",
            uid: Option.some(info.uid),
          };
        },
        catch: fromError("stat", path),
      }),
    symlink: () => unsupported("symlink"),
    truncate: () => unsupported("truncate"),
    utimes: () => unsupported("utimes"),
    watch: () =>
      Stream.die(new Error("BunServices does not implement FileSystem.watch in DOTAI-001.")),
    writeFile: (path, data) =>
      Effect.tryPromise({
        try: () => writeFile(path, data),
        catch: fromError("writeFile", path),
      }),
  }),
);

const childProcessSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  (() => {
    const spawnCommand = (command: ChildProcessCommand) =>
      Effect.sync(() => {
        if (command._tag !== "StandardCommand") {
          throw PlatformError.badArgument({
            description: "Piped commands are not supported.",
            method: "spawn",
            module: "ChildProcessSpawner",
          });
        }

        const childProcess = spawnProcess(command.command, [...command.args], {
          cwd: command.options.cwd,
          detached: command.options.detached,
          env: resolveEnvironment(command),
          shell: command.options.shell,
          stdio: ["ignore", "ignore", "ignore"],
        });

        return ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: waitForExit(
            childProcess,
            `${command.command} ${command.args.join(" ")}`.trim(),
          ),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.sync(() => childProcess.exitCode === null && !childProcess.killed),
          kill: (options) =>
            Effect.try({
              try: () => {
                childProcess.kill(options?.killSignal);
              },
              catch: fromError("kill", command.command),
            }),
          pid: ChildProcessSpawner.ProcessId(childProcess.pid ?? 0),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.empty,
          unref: Effect.try({
            try: () => {
              childProcess.unref();

              return Effect.try({
                try: () => {
                  childProcess.ref();
                },
                catch: fromError("ref", command.command),
              });
            },
            catch: fromError("unref", command.command),
          }),
        });
      });

    return ChildProcessSpawner.ChildProcessSpawner.of({
      exitCode: (command) =>
        Effect.scoped(Effect.flatMap(spawnCommand(command), (handle) => handle.exitCode)),
      lines: (command, options) =>
        Effect.map(collectStringOutput(command, options?.includeStderr === true), (output) =>
          output.split(/\r?\n/u).filter((line) => line.length > 0),
        ),
      spawn: spawnCommand,
      streamLines: (command, options) =>
        Stream.splitLines(
          Stream.fromEffect(collectStringOutput(command, options?.includeStderr === true)),
        ),
      streamString: (command, options) =>
        Stream.fromEffect(collectStringOutput(command, options?.includeStderr === true)),
      string: (command, options) => collectStringOutput(command, options?.includeStderr === true),
    });
  })(),
);

export const coreLayer = Layer.mergeAll(fileSystemLayer, Path.layer, childProcessSpawnerLayer);

const defaultShouldQuit = (input: Terminal.UserInput) =>
  input.key.ctrl && (input.key.name === "c" || input.key.name === "d");

export const terminalLayer = Layer.effect(
  Terminal.Terminal,
  Effect.gen(function* () {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const interfaceInstance = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const terminalReadline = readline.createInterface({
          escapeCodeTimeout: 50,
          input: stdin,
        });

        readline.emitKeypressEvents(stdin, terminalReadline);

        if (stdin.isTTY) {
          stdin.setRawMode(true);
        }

        return terminalReadline;
      }),
      (terminalReadline) =>
        Effect.sync(() => {
          if (stdin.isTTY) {
            stdin.setRawMode(false);
          }

          terminalReadline.close();
        }),
    );

    return Terminal.make({
      columns: Effect.sync(() => stdout.columns ?? 0),
      display: (text) =>
        Effect.sync(() => {
          stdout.write(text);
        }),
      readInput: Effect.gen(function* () {
        const queue = yield* Queue.unbounded<Terminal.UserInput, Cause.Done>();
        const handleKeypress = (input: string | undefined, key: readline.Key) => {
          const userInput: Terminal.UserInput = {
            input: Option.fromNullishOr(input),
            key: {
              ctrl: key.ctrl ?? false,
              meta: key.meta ?? false,
              name: key.name ?? "",
              shift: key.shift ?? false,
            },
          };

          Queue.offerUnsafe(queue, userInput);

          if (defaultShouldQuit(userInput)) {
            Queue.endUnsafe(queue);
          }
        };

        yield* Effect.addFinalizer(() => Effect.sync(() => stdin.off("keypress", handleKeypress)));
        stdin.on("keypress", handleKeypress);

        return queue;
      }),
      readLine: Effect.callback<string, Terminal.QuitError>((resume) => {
        const onLine = (line: string) => {
          resume(Effect.succeed(line));
        };
        const onClose = () => {
          resume(Effect.fail(new Terminal.QuitError({})));
        };

        interfaceInstance.once("line", onLine);
        interfaceInstance.once("close", onClose);

        return Effect.sync(() => {
          interfaceInstance.off("line", onLine);
          interfaceInstance.off("close", onClose);
        });
      }),
    });
  }),
);

export const stdioLayer = Stdio.layerTest({
  args: Effect.sync(() => process.argv.slice(2)),
  stderr: () => Sink.drain,
  stdin: Stream.empty,
  stdout: () => Sink.drain,
});

export const cliLayer = Layer.mergeAll(terminalLayer, stdioLayer);

export const layer = Layer.mergeAll(coreLayer, cliLayer);
