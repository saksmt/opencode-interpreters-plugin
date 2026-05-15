import type { ProcessStartupSettings } from "@/process";
import { NodeJsSpawnProcess } from "@/process/NodeJsSpawnProcess";

export type ProcessResult =
  | { type: "exit"; code: number | null }
  | { type: "timeout" }
  | { type: "aborted"; code: number | null }
  | { type: "writeError"; error: Error | null }
  | { type: "error"; error: Error | null };

export interface Process {
  onOutput(readChunk: (chunk: string) => Promise<void>): Promise<void>;

  write(data: string, entireInput?: boolean): Promise<void>;

  unref(): void;

  stop(killWith?: NodeJS.Signals): Promise<void>;

  processFinished(): Promise<ProcessResult>;
}
export function Process(opts: ProcessStartupSettings): Process {
  return NodeJsSpawnProcess.createAndStart(opts);
}
