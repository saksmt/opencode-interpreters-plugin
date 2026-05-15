import type { Handle, Process, ProcessBuilder, ProcessStartupSettings } from "@/process";
import type { Millis } from "@/utils.ts";

export abstract class ProcessBuilderBase<T extends ProcessBuilderBase<T>> implements ProcessBuilder {
  protected constructor(protected settings: ProcessStartupSettings) {}

  protected abstract copy(newSettings: ProcessStartupSettings): T;

  abortOn(signal: Promise<void> | AbortSignal, killWith?: NodeJS.Signals): T {
    const abortSignal: AbortSignal =
      signal instanceof AbortSignal
        ? signal
        : (() => {
            const controller = new AbortController();

            signal.then(() => controller.abort());

            return controller.signal;
          })();
    return this.copy({
      ...this.settings,
      abortSignal: { signal: abortSignal, killWith: killWith ?? "SIGTERM" },
    });
  }

  bindStdin(propagateFailures?: boolean): T {
    return this.copy({ ...this.settings, stdinMode: propagateFailures ? "bind-propagate" : "bind" });
  }

  capture(handles: Handle[]): T {
    return this.copy({ ...this.settings, handles });
  }

  shutdownTimeout(ms: number): T {
    return this.copy({ ...this.settings, shutdownGracePeriod: ms });
  }

  timeout(ms: Millis): T {
    return this.copy({ ...this.settings, timeout: ms });
  }

  withArgs(args: string[]): T {
    return this.copy({ ...this.settings, args });
  }

  withCommand(command: string): T {
    return this.copy({ ...this.settings, command });
  }

  withEnv(env: Record<string, string>): T {
    return this.copy({ ...this.settings, env });
  }

  withPwd(path: string): T {
    return this.copy({ ...this.settings, pwd: path });
  }

  abstract buildAndStart(): Process;
}
