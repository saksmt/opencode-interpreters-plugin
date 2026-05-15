import type { Millis } from "@/utils.ts";

export type Handle = "stdout" | "stderr";

export interface ProcessStartupSettings {
  command: string;
  args: string[];
  env: Record<string, string>;
  pwd: string | null;

  stdinMode: "bind" | "bind-propagate" | "ignore";
  handles: Handle[];

  timeout: Millis | null;
  abortSignal: { signal: AbortSignal; killWith: NodeJS.Signals } | null;

  shutdownGracePeriod: Millis;
}
