import type { Handle, ProcessStartupSettings } from "@/process";
import { Process } from "@/process/Process";
import { ProcessBuilderBase } from "@/process/ProcessBuilderBase";
import type { Millis } from "@/utils.ts";

export interface ProcessBuilder {
  withCommand(command: string): ProcessBuilder;

  withArgs(args: string[]): ProcessBuilder;

  withEnv(env: Record<string, string>): ProcessBuilder;

  withPwd(path: string): ProcessBuilder;

  bindStdin(propagateFailures?: boolean): ProcessBuilder;

  capture(handles: Handle[]): ProcessBuilder;

  timeout(ms: Millis): ProcessBuilder;

  abortOn(signal: Promise<void> | AbortSignal, killWith?: NodeJS.Signals): ProcessBuilder;

  shutdownTimeout(ms: number): ProcessBuilder;

  buildAndStart(): Process;
}

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
