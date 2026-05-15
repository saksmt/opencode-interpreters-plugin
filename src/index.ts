import process from "node:process";
import {
  type Hooks,
  type Plugin,
  type PluginInput,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
  tool,
} from "@opencode-ai/plugin";
// biome-ignore lint/correctness/noUndeclaredDependencies: would not be needed when it is gone
import { Effect } from "effect";
import { ProcessBuilder } from "@/process";
import { todo } from "@/utils.ts";
import { Config } from "./Config";
import { DescriptionRenderer } from "./DescriptionRenderer";
import type { InterpreterDefinition } from "./InterpreterDefinition";
import { TruncatedView } from "./TruncatedView";

type TruncatedContent =
  | {
      truncated: true;
      head: string[];
      tail: string[];
      totalLines: number;
      totalCharacters: number;
      contentFile: string;
    }
  | {
      content: string;
      truncated: false;
    };

function formatPreview(data: TruncatedContent) {
  if (data.truncated) {
    return `
    ${data.head}
    
    ... omitted ${data.totalCharacters} across ${data.totalLines} lines ...
    
    ${data.tail}`;
  } else {
    return data.content;
  }
}

function msFromSeconds(seconds: number): number {
  // biome-ignore lint/style/noMagicNumbers: trivial
  return seconds * 1000;
}

type ExecutionResult =
  | {
      type: "exit";
      code: number | null;
    }
  | {
      type: "error";
      error: Error | null;
    }
  | {
      type: "abort";
    }
  | {
      type: "writeError";
      error: Error | null;
    }
  | {
      type: "timeout";
    };
type ResultPromise = Promise<ExecutionResult>;

class Interpreter {
  private readonly scriptLanguage: string;
  private readonly toolName: string;
  private readonly maxLines: number;
  private readonly maxCharacters: number;
  private readonly defaultTimeoutSeconds: number;
  private readonly descriptionRenderer: DescriptionRenderer;
  private readonly processBuilder: ProcessBuilder;

  constructor(
    private readonly ctx: PluginInput,
    props: InterpreterDefinition,
  ) {
    this.scriptLanguage = props.scriptLanguage;
    this.toolName = props.toolName ?? props.scriptLanguage;
    this.maxLines = props.outputLimit.lines;
    this.maxCharacters = props.outputLimit.characters;
    this.defaultTimeoutSeconds = props.defaultTimeoutSeconds;
    this.processBuilder = ProcessBuilder(props.interpreter, props.interpreterArgs)
      .withEnv(props.env)
      .shutdownTimeout(props.exitGracePeriodSeconds)
      .bindStdin(true);

    this.descriptionRenderer = new DescriptionRenderer(props.prompt, {
      sandboxed: props.sandboxed,
      scriptLanguage: props.scriptLanguage,
      os: "os" in props && props.os !== undefined ? props.os : process.platform,
      maxLines: this.maxLines,
      maxCharacters: this.maxCharacters,
      defaultTimeoutSeconds: this.defaultTimeoutSeconds,
      exitGracePeriodSeconds: props.exitGracePeriodSeconds,
    });
  }

  // biome-ignore lint/complexity/useMaxParams: does not make much sense to restructure tool args, nor passing raw args
  async execute(
    script: string,
    description: string,
    timeoutSeconds: number,
    capture: "stdout" | "stderr" | "both",
    context: ToolContext,
  ): Promise<
    ToolResult & {
      title?: string;
    }
  > {
    // all plugin tools outputs are truncated forcibly
    // can be avoided with a hack by hooking into tool.execute.after
    // output then should probably be provided as a separate field in metadata

    await Effect.runPromise(
      context.metadata({
        title: description,
        metadata: {
          output: "",
          description,
        },
      }) as unknown as Effect.Effect<void>,
    );

    const child = this.processBuilder
      .withPwd(this.ctx.directory)
      .capture(capture === "both" ? ["stdout", "stderr"] : [capture])
      .timeout(msFromSeconds(timeoutSeconds))
      .abortOn(context.abort)
      .buildAndStart();

    child.unref();
    child.write(script, true);

    const executionResult = await child.processFinished();
    // todo: separate config setting?
    // todo: get terminal size from opencode?
    const termSize = 80;
    const userPreview = new TruncatedView(this.maxLines, this.maxCharacters, termSize);
    const toolOutput = new TruncatedView(this.maxLines, this.maxCharacters);

    // biome-ignore lint/style/useDefaultSwitchClause: this should be covered by exhaustiveness check
    switch (executionResult.type) {
      case "exit":
        return todo();
      case "error":
        // just forwarding it, following same logic as in opencode's shell tool
        throw executionResult.error;
      case "timeout":
        return todo();
      case "aborted":
        // would be awesome to ask user why here, but it is impossible
        return todo();
      case "writeError":
        // just forwarding it, following same logic as in opencode's shell tool
        throw executionResult.error;
    }
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
          .describe("Script execution timeout in seconds, default is 300"),
        capture: tool.schema
          .enum(["stdout", "stderr", "both"])
          .default("stdout")
          .describe("Output capture mode, default is both"),
      },
      execute: async (args, context) =>
        this.execute(args.script, args.description, args.timeout, args.capture, context),
    });
  }

  get toolExecuteAfterHook(): Required<Hooks>["tool.execute.after"] {
    return async (
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
        return;
      }

      if (typeof output.metadata !== "object" || output.metadata === null) {
        return;
      }
      if (!("original" in output.metadata)) {
        return;
      }

      // restore unlawful truncation and all the other hacks brought by opencode...
      const originalMeta = output.metadata.original;
      // biome-ignore lint/performance/noDelete: more visually obvious modification
      delete output.metadata;
      output.metadata = originalMeta;

      if (typeof output.metadata !== "object" || output.metadata === null) {
        return;
      }
      if (!("title" in output.metadata) || typeof output.metadata.title !== "string") {
        return;
      }
      // restore title
      output.title = output.metadata.title;
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

export const OpencodeShellToolPlugin: Plugin = async (ctx: PluginInput, config?: Record<string, unknown>) => {
  let hooks: Hooks = {};

  const interpreters = await Config.load(ctx, config ?? {});
  for (const interpreter of interpreters) {
    // biome-ignore lint/performance/noAwaitInLoops: does not matter here and it requires sequential execution
    hooks = await new Interpreter(ctx, interpreter).register(hooks);
  }

  return hooks;
};
