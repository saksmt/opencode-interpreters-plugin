import {
  type ChildProcess,
  type SpawnOptionsWithStdioTuple,
  type StdioNull,
  type StdioPipe,
  spawn,
} from "node:child_process";
import { platform } from "node:os";
import process from "node:process";
import type { Process, ProcessResult, ProcessStartupSettings } from "@/process";
import { forever, sleep, voidPromise } from "@/utils";

export class NodeJsSpawnProcess implements Process {
  private readonly finished: Promise<void>;
  private readonly results: Promise<ProcessResult>[];
  private finalizing: boolean;

  private constructor(
    private readonly child: ChildProcess,
    private readonly settings: ProcessStartupSettings,
  ) {
    this.finished = new Promise((resolve) => {
      child.once("close", () => {
        resolve(voidPromise);
      });
    });
    this.finalizing = false;
    this.results = [
      this.exclusiveFinalizer((resolve) => {
        child.once("exit", (code) => {
          resolve({ type: "exit", code });
        });
      }, null),
      this.exclusiveFinalizer((resolve) => {
        child.once("error", (error) => {
          if (error.name === "AbortError") {
            resolve({ type: "aborted", code: this.child.exitCode });
          } else {
            resolve({ type: "error", error });
          }
        });
      }),
      ...(this.settings.timeout === null
        ? []
        : [
            this.exclusiveFinalizer(
              sleep(this.settings.timeout, {
                type: "timeout",
              }),
            ),
          ]),
      this.exclusiveFinalizer((resolve) => {
        if (this.settings.abortSignal !== null) {
          this.settings.abortSignal.signal.onabort = () =>
            resolve({
              type: "aborted",
              code: this.child.exitCode,
            });
        }
      }, this.settings.abortSignal?.killWith ?? "SIGTERM"),
    ];
  }

  static createAndStart(settings: ProcessStartupSettings): Process {
    const onlyIfNoStdout = "stdout" in settings.handles ? "ignore" : "pipe";
    const stdioTuple: ["ignore" | "pipe", "ignore" | "pipe", "ignore" | "pipe"] = [
      settings.stdinMode === "ignore" ? "ignore" : "pipe",
      "stdout" in settings.handles ? "pipe" : "ignore",
      "stderr" in settings.handles ? onlyIfNoStdout : "ignore",
    ];

    const capturesBoth = "stdout" in settings.handles && "stderr" in settings.handles;

    const child = spawn(settings.command, capturesBoth ? [...settings.args, "2>&1"] : settings.args, {
      stdio: stdioTuple,
      cwd: settings.pwd ?? undefined,
      shell: capturesBoth,
    } satisfies SpawnOptionsWithStdioTuple<
      StdioPipe | StdioNull,
      StdioPipe | StdioNull,
      StdioPipe | StdioNull
    >);

    return new NodeJsSpawnProcess(child, settings);
  }

  async onOutput(readChunk: (chunk: string) => Promise<void>): Promise<void> {
    // stderr would be set only if stdout is disabled
    const streamToRead = this.child.stderr ?? this.child.stdout;

    if (streamToRead) {
      return await this.readAll(streamToRead, readChunk);
    }
  }

  private async readAll(
    stream: NodeJS.ReadableStream,
    reader: (chunk: string) => Promise<void>,
  ): Promise<void> {
    stream.setEncoding("utf8");
    for await (const chunk of stream) {
      await reader(chunk as string);
    }
  }

  processFinished(): Promise<ProcessResult> {
    return Promise.race(this.results);
  }

  stop(killWith?: NodeJS.Signals): Promise<void> {
    if (platform() in ["linux", "android"]) {
      if (this.child.pid) {
        // kill child ~entire family~ process group since killing parent does not kill its children
        this.killGrandChildren(killWith);
      }
      this.child.kill(killWith);
      return Promise.race([
        this.finished,
        sleep(this.settings.shutdownGracePeriod)
          .then(() => this.killGrandChildren("SIGKILL"))
          .then(() => this.child.kill("SIGKILL"))
          .then(() => this.finished),
      ]);
    } else {
      this.child.kill(killWith);
      return Promise.race([
        this.finished,
        sleep(this.settings.shutdownGracePeriod)
          .then(() => this.child.kill("SIGKILL"))
          .then(() => this.finished),
      ]);
    }
  }

  private killGrandChildren(signal?: NodeJS.Signals) {
    if (platform() in ["linux", "android"] && this.child.pid) {
      process.kill(-this.child.pid, signal);
    }
  }

  unref(): void {
    this.child.unref();
  }

  write(data: string, entireInput?: boolean): Promise<void> {
    const stdin = this.child.stdin;
    if (stdin === null) {
      return voidPromise;
    }

    const writeResult = new Promise<Error | null | "ok">((resolve) => {
      stdin.write(data, "utf8", (error) => {
        if (error) {
          resolve(error ?? null);
        } else {
          resolve("ok");
        }
      });
    });

    if (this.settings.stdinMode === "bind-propagate") {
      // propagate write errors
      this.results.push(
        this.exclusiveFinalizer((resolve) => {
          writeResult.then((result) => {
            if (result !== "ok") {
              resolve({
                type: "writeError",
                error: result,
              });
            }
          });
        }, "SIGTERM"),
      );
    }

    const endPromise =
      entireInput === true
        ? new Promise<void>((resolve) => stdin.end(() => resolve(voidPromise)))
        : voidPromise;

    return writeResult
      .then((result) => {
        if (result !== "ok") {
          throw result;
        }
      })
      .then(() => endPromise);
  }

  private async exclusiveFinalizer(
    result: Promise<ProcessResult> | ((resolve: (result: ProcessResult) => void) => void),
    kill: NodeJS.Signals | null = "SIGTERM",
  ): Promise<ProcessResult> {
    const resultValue = "then" in result ? await result : await new Promise(result);
    if (this.finalizing) {
      await forever();
    }
    this.finalizing = true;
    if (kill) {
      await this.stop();
    }
    await this.finished;
    return resultValue;
  }
}
