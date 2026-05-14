import { type ChildProcessByStdio, spawn } from "node:child_process";
import process from "node:process";
import type { Readable, Writable } from "node:stream";
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
import { Config } from "./Config";
import { DescriptionRenderer } from "./DescriptionRenderer";
import type { InterpreterDefinition } from "./InterpreterDefinition";
import { TruncatedView } from "./TruncatedView";

const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_EXIT_GRACE_PERIOD_SECONDS = 30;
const DEFAULT_MAX_LINES = 700;
const DEFAULT_MAX_CHARACTERS = 40_000;
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

class DataReader {
  private readonly allChunks: string[] = [];
  private readonly head: string[] = [];
  private readonly tail: string[] = [];
  private readonly mainView: TruncatedView;

  constructor(
    private readonly iterable: AsyncIterable<string>,
    private readonly maxLines: number,
    private readonly maxCharacters: number,
  ) {
    this.mainView = new TruncatedView(maxLines, maxCharacters);
  }

  async consume(onUpdate: (data: TruncatedContent) => Promise<void>): Promise<TruncatedContent> {
    return todo();
  }

  get currentData(): TruncatedContent {
    return todo();
  }
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todo(): never {
  throw new Error("Not implemented");
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
  private readonly interpreter: string;
  private readonly scriptLanguage: string;
  private readonly toolName: string;
  private readonly maxLines: number;
  private readonly maxCharacters: number;
  private readonly env: Record<string, string>;
  private readonly defaultTimeoutSeconds: number;
  private readonly exitGracePeriodSeconds: number;
  private readonly descriptionRenderer: DescriptionRenderer;

  constructor(
    private readonly ctx: PluginInput,
    props: InterpreterDefinition,
  ) {
    this.interpreter = props.interpreter;
    this.scriptLanguage = props.scriptLanguage;
    this.toolName = props.toolName ?? props.scriptLanguage;
    this.maxLines = props.outputLimit?.lines ?? DEFAULT_MAX_LINES;
    this.maxCharacters = props.outputLimit?.characters ?? DEFAULT_MAX_CHARACTERS;
    this.defaultTimeoutSeconds = props.defaultTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    this.exitGracePeriodSeconds = props.exitGracePeriodSeconds ?? DEFAULT_EXIT_GRACE_PERIOD_SECONDS;
    this.env = props.env ?? {};

    this.descriptionRenderer = new DescriptionRenderer(props.prompt, {
      sandboxed: props.sandboxed ?? false,
      scriptLanguage: props.scriptLanguage,
      os: "os" in props && props.os !== undefined ? props.os : process.platform,
      maxLines: this.maxLines,
      maxCharacters: this.maxCharacters,
      defaultTimeoutSeconds: this.defaultTimeoutSeconds,
      exitGracePeriodSeconds: this.exitGracePeriodSeconds,
    });
  }

  async execute(
    script: string,
    description: string,
    timeoutSeconds: number,
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

    const child = spawn(this.interpreter, {
      env: this.env,
      cwd: this.ctx.directory,
      stdio: ["pipe", "pipe", "ignore"],
    });

    child.stdout.setEncoding("utf8");
    const reader = new DataReader(child.stdout, this.maxLines, this.maxCharacters);

    const dataPromise = reader.consume(async (data) => {
      await Effect.runPromise(
        context.metadata({
          metadata: {
            output: formatPreview(data),
            description,
          },
        }) as unknown as Effect.Effect<void>,
      );
    });

    const finishedPromise = new Promise((resolve) => {
      child.once("close", () => resolve(true));
    });
    const executionResult = await this.feedChild(child, context, script, timeoutSeconds);

    // biome-ignore lint/style/useDefaultSwitchClause: this should be covered by exhaustiveness check
    switch (executionResult.type) {
      case "exit":
        return todo();
      case "error":
        // just forwarding it, following same logic as in opencode's shell tool
        throw executionResult.error;
      case "timeout":
        child.kill();
        await Promise.race([
          sleep(msFromSeconds(this.exitGracePeriodSeconds)).then(() => child.kill("SIGKILL")),
          finishedPromise,
        ]);
        return todo();
      case "abort":
        // would be awesome to ask user why here, but it is impossible
        return todo();
      case "writeError":
        // just forwarding it, following same logic as in opencode's shell tool
        throw executionResult.error;
    }
  }

  private async feedChild(
    child: ChildProcessByStdio<Writable, Readable, null>,
    context: ToolContext,
    script: string,
    timeoutSeconds: number,
  ): ResultPromise {
    const exitPromise: ResultPromise = new Promise((resolve) => {
      child.on("exit", (code) =>
        resolve({
          type: "exit",
          code: code ?? null,
        }),
      );
      child.on("error", (e) =>
        resolve({
          type: "error",
          error: e ?? null,
        }),
      );
    });

    const abortedPromise: ResultPromise = new Promise((resolve, reject) => {
      context.abort.onabort = () =>
        resolve({
          type: "abort",
        });
    });

    const writeErrorPromisePromise: {
      promise: ResultPromise;
    } = await new Promise((resolve) =>
      child.stdin.write(script, "utf8", (err) => {
        resolve({
          promise: new Promise((resolveErr) => {
            if (err) {
              resolveErr({
                type: "writeError",
                error: err,
              });
            }
          }),
        });
      }),
    );
    const writeErrorPromise = writeErrorPromisePromise.promise;

    const timeoutPromise: ResultPromise = sleep(msFromSeconds(timeoutSeconds)).then(() => ({
      type: "timeout",
    }));

    return await Promise.race([exitPromise, abortedPromise, writeErrorPromise, timeoutPromise]);
  }

  get toolDefinition(): ToolDefinition {
    return tool({
      description: this.descriptionRenderer.description,
      args: {
        script: tool.schema.string().describe(`Non-interactive script in ${this.scriptLanguage}`),
        description: tool.schema.string().describe("Short 5-10 word description of what script does"),
        timeout: tool.schema
          .number()
          .optional()
          .describe("Script execution timeout in seconds, default is 300"),
        capture: tool.schema
          .enum(["stdout", "stderr", "both"])
          .optional()
          .describe("Output capture mode, default is both"),
      },
      execute: async (args, context) =>
        this.execute(args.script, args.description, args.timeout ?? this.defaultTimeoutSeconds, context),
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
