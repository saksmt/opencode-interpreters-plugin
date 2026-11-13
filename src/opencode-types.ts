import type { PluginInput, ToolContext as PluginToolContext } from "@opencode-ai/plugin";
// biome-ignore lint/correctness/noUndeclaredDependencies: would not be needed if it's gone from opencode
import { Effect } from "effect";
import type { AbsolutePath } from "@/SessionFs.ts";

export type ToastOptions = Parameters<PluginInput["client"]["tui"]["showToast"]>[0];

export type ToolContext = Omit<PluginToolContext, "metadata"> & {
  metadata: (...input: Parameters<PluginToolContext["metadata"]>) => Effect.Effect<void>;
};
export type PromisifiedToolContext = Omit<ToolContext, "metadata"> & {
  metadata: (...input: Parameters<PluginToolContext["metadata"]>) => Promise<void>;
};
export const ToolContext = Object.assign((ctx: PluginToolContext) => ctx as ToolContext, {
  promisify(ctx: PluginToolContext) {
    return {
      ...ctx,
      metadata: async (input) => Effect.runPromise(ToolContext(ctx).metadata(input)),
    } as PromisifiedToolContext;
  },
});

export interface ShellToolInProgressMetadata {
  output?: string;
  description?: string;
  title?: string;
}

export interface ShellToolTruncatedOutput {
  truncated: true;
  outputPath: AbsolutePath;
}

export type TruncatedOutput<ExtraOnTruncated> =
  | { truncated: false }
  | ({ truncated: true; outputPath: AbsolutePath } & ExtraOnTruncated);

export interface ShellToolFinalMetadata {
  output: string;
  description?: string;
  title?: string;
  exit: number | null;
}
