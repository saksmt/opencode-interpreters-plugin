import {
  type Hooks,
  type PluginInput,
  type ToolDefinition,
  type ToolResult,
  tool,
} from "@opencode-ai/plugin";
import { InterpreterToolExecutor } from "@/InterpreterToolExecutor.ts";
import type { Logger } from "@/Logger.ts";
import { type ShellToolFinalMetadata, ToolContext, type TruncatedOutput } from "@/opencode-types.ts";
import type { SessionFs } from "@/SessionFs.ts";
import { voidPromise } from "@/utils.ts";
import { DescriptionRenderer } from "./DescriptionRenderer";
import type { InterpreterDefinition } from "./InterpreterDefinition";

export type InterpreterTruncatedOutput = TruncatedOutput<{ head: string; tail: string }>;
export interface InterpreterFinalMetadata extends ShellToolFinalMetadata {
  totalLines: number;
  totalCharacters: number;
}
export type InterpreterMetadata = InterpreterFinalMetadata & InterpreterTruncatedOutput;
export type InterpreterResult = ToolResult & {
  title?: string;
  metadata: InterpreterMetadata & { original: InterpreterMetadata };
};

export class InterpreterTool {
  constructor(
    private readonly toolExecutor: InterpreterToolExecutor,
    private readonly descriptionRenderer: DescriptionRenderer,
    private readonly scriptLanguage: string,
    private readonly toolName: string,
    private readonly defaultTimeoutSeconds: number,
  ) {}

  static create(
    logger: Logger,
    ctx: PluginInput,
    sessionFs: SessionFs,
    props: InterpreterDefinition,
  ): InterpreterTool {
    const toolName = props.toolName ?? props.scriptLanguage;

    const renderer = DescriptionRenderer.default(props);
    const executor = InterpreterToolExecutor.create(logger, ctx, sessionFs.withRealm(toolName), props);

    return new InterpreterTool(
      executor,
      renderer,
      props.scriptLanguage,
      toolName,
      props.defaultTimeoutSeconds,
    );
  }

  get toolDefinition(): ToolDefinition {
    return tool({
      description: this.descriptionRenderer.description,
      args: {
        script: tool.schema.string().describe(`Non-interactive script in ${this.scriptLanguage}`),
        description: tool.schema.string().describe("Short 5-10 word description of what script does"),
        timeout: tool.schema
          .number()
          .default(this.defaultTimeoutSeconds)
          .optional()
          .describe("Script execution timeout in seconds, default is 300"),
        capture: tool.schema
          .enum(["stdout", "stderr", "both"])
          .default("stdout")
          .optional()
          .describe("Output capture mode, default is both"),
      },
      execute: async (args, context) =>
        this.toolExecutor.execute(
          args.script,
          args.description,
          // zod is not applied properly for some reason, so we get undefined here if using only "default"
          args.timeout ?? this.defaultTimeoutSeconds,
          args.capture ?? "stdout",
          ToolContext.promisify(context),
        ),
    });
  }

  get toolExecuteAfterHook(): Required<Hooks>["tool.execute.after"] {
    return (
      input: {
        tool: string;
        sessionID: string;
        callID: string;
        args: unknown;
      },
      output: {
        title: string;
        output: string;
        metadata: unknown;
      },
    ) => {
      if (input.tool !== this.toolName) {
        return voidPromise;
      }

      if (typeof output.metadata !== "object" || output.metadata === null) {
        return voidPromise;
      }
      if (!("original" in output.metadata)) {
        return voidPromise;
      }

      // restore unlawful truncation and all the other hacks brought by opencode...
      const originalMeta = output.metadata.original;
      // biome-ignore lint/performance/noDelete: more visually obvious modification
      delete output.metadata;
      output.metadata = originalMeta;

      if (typeof output.metadata !== "object" || output.metadata === null) {
        return voidPromise;
      }
      if (!("title" in output.metadata) || typeof output.metadata.title !== "string") {
        return voidPromise;
      }
      // restore title
      output.title = output.metadata.title;

      return voidPromise;
    };
  }

  register(pluginHooks: Hooks): Hooks {
    if (!("tool" in pluginHooks) || pluginHooks.tool === undefined) {
      pluginHooks.tool = { [this.toolName]: this.toolDefinition };
    } else {
      pluginHooks.tool[this.toolName] = this.toolDefinition;
    }

    if ("tool.execute.after" in pluginHooks && pluginHooks["tool.execute.after"] !== undefined) {
      const previous = pluginHooks["tool.execute.after"];
      pluginHooks["tool.execute.after"] = async (input, output) => {
        await previous(input, output);
        await this.toolExecuteAfterHook(input, output);
      };
    } else {
      pluginHooks["tool.execute.after"] = this.toolExecuteAfterHook;
    }
    return pluginHooks;
  }
}
