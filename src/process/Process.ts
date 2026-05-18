import type { ProcessStartupSettings } from "@/process";
import { NodeJsSpawnProcess } from "@/process/NodeJsSpawnProcess";

/**
 * Terminal state of a finished process. Exactly one result wins:
 * - `exit` — process exited on its own
 * - `timeout` — process was killed by a configured timeout
 * - `aborted` — process was killed via abortOn signal
 * - `writeError` — write to stdin failed and bindStdin(true) was used
 * - `error` — a spawn error or unexpected process error
 */
export type ProcessResult =
  | { type: "exit"; code: number | null }
  | { type: "timeout" }
  | { type: "aborted"; code: number | null }
  | { type: "writeError"; error: Error | null }
  | { type: "error"; error: Error | null };

export interface Process {
  /**
   * Reads captured output. The returned promise resolves when the stream ends
   * (the process has closed its output). Throws if nothing is captured.
   */
  onOutput(readChunk: (chunk: string) => Promise<void>): Promise<void>;

  /**
   * Writes data to stdin. Resolves once the data is flushed.
   *
   * When `entireInput` is true, stdin is closed after this write, signaling
   * EOF to the child process. Useful for programs like `cat` that read
   * until EOF before producing output.
   *
   * Rejects with the error if the write fails. If `bindStdin(true)` was used
   * the failure also propagates through `processFinished()`.
   */
  write(data: string, entireInput?: boolean): Promise<void>;

  /** Prevents the process from keeping the event loop alive. */
  unref(): void;

  /**
   * Kills the process. First sends `killWith` (default: SIGTERM) to the
   * process and its children. If the process does not exit within the
   * shutdown grace period, escalates to SIGKILL. Resolves when the process
   * has fully exited.
   */
  stop(killWith?: NodeJS.Signals): Promise<void>;

  /**
   * Resolves when the process terminates for any reason. Returns the first
   * terminal event: exit, timeout, abort, writeError, or spawn error.
   */
  processFinished(): Promise<ProcessResult>;
}
export function Process(opts: ProcessStartupSettings): Process {
  return NodeJsSpawnProcess.createAndStart(opts);
}
