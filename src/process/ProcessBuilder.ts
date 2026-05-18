import type { Handle, ProcessStartupSettings } from "@/process";
import { Process } from "@/process/Process";
import { ProcessBuilderBase } from "@/process/ProcessBuilderBase";
import type { Millis } from "@/utils.ts";

export interface ProcessBuilder {
  withCommand(command: string): ProcessBuilder;

  withArgs(args: string[]): ProcessBuilder;

  withEnv(env: Record<string, string>): ProcessBuilder;

  withPwd(path: string): ProcessBuilder;

  /**
   * Pipes stdin to the child process, enabling `write()`.
   *
   * When `propagateFailures` is true, a failed `write()` causes the process to
   * be killed and `processFinished()` returns `{ type: "writeError" }`.
   */
  bindStdin(propagateFailures?: boolean): ProcessBuilder;

  /**
   * Selects output streams to pipe back. `onOutput()` reads from all
   * the captured outputs.
   * Nothing is captured by default.
   */
  capture(handles: Handle[]): ProcessBuilder;

  /**
   * If the process does not finish within `ms`, it is killed and
   * `processFinished()` resolves with `{ type: "timeout" }`.
   */
  timeout(ms: Millis): ProcessBuilder;

  /**
   * When the signal fires, the process is killed and `processFinished()`
   * resolves with `{ type: "aborted" }`.
   *
   * Accepts an `AbortSignal` or a Promise — a resolved promise triggers abort.
   * The optional `killWith` overrides the default SIGTERM.
   */
  abortOn(signal: Promise<void> | AbortSignal, killWith?: NodeJS.Signals): ProcessBuilder;

  /**
   * How long `stop()` waits for the process to exit before escalating to
   * SIGKILL. Default: 5000ms.
   */
  shutdownTimeout(ms: number): ProcessBuilder;

  /** Creates and starts the process. The process begins immediately. */
  buildAndStart(): Process;
}

/**
 * Creates a `ProcessBuilder` with defaults:
 * - no stdin binding
 * - no output capture
 * - no timeout
 * - no abort signal
 * - 5000ms shutdown grace period
 */
export function ProcessBuilder(command: string, args: string[] = []): ProcessBuilder {
  return new Default({
    command,
    args,
    env: {},
    pwd: null,
    stdinMode: "ignore",
    handles: [],
    timeout: null,
    abortSignal: null,
    shutdownGracePeriod: 5000,
  });
}

class Default extends ProcessBuilderBase<Default> {
  // biome-ignore lint/complexity/noUselessConstructor: false positive
  constructor(opts: ProcessStartupSettings) {
    super(opts);
  }

  buildAndStart(): Process {
    return Process(this.settings);
  }

  protected copy(newSettings: ProcessStartupSettings): Default {
    return new Default(newSettings);
  }
}
