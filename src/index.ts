import { type ChildProcessByStdio, spawn } from "node:child_process";
import process from "node:process";
import type { Readable, Writable } from "node:stream";
import {
  type Hooks,
  type Plugin,
  type PluginInput,
  type ToolContext,
  type ToolResult,
  tool,
} from "@opencode-ai/plugin";
// biome-ignore lint/correctness/noUndeclaredDependencies: would not be needed when it is gone
import { Effect } from "effect";
import { TruncatedView } from "./TruncatedView.ts";

interface InterpreterProps {
  /** Interpreter command to use for running scripts, essentially shebang without the "#!" part */
  interpreter: string;
  /** Name of the script language */
  scriptLanguage: string;
  /**
   * Whether the interpreter starts the script in a sandboxed environment
   * IMPORTANT: THIS DOES NOT MAGICALLY ENABLE SANDBOXING FOR INTERPRETER, IT ONLY SIGNIFIES WHETHER INTERPRETER IS RUNNING IN SANDBOX OR NOT
   */
  sandboxed?: boolean;
  /** Descriptions appended to specified locations */
  extraDescriptions?: {
    before?: string;
    after?: string;
    beforeSandbox?: string;
    afterSandbox?: string;
    beforeOS?: string;
    afterOS?: string;
  };
  /** Tool name to expose to opencode, {@link scriptLanguage} by default */
  toolName?: string;
  /**
   * Operating system to mention in description, by default, used OS where opencode is running,
   * set to null to disable mentioning OS in the description
   *
   * This is useful to override if you are running opencode on mac and use docker or VM based sandboxing
   */
  os?: null | string;
  outputLimit?: {
    lines?: number;
    characters?: number;
  };
  /**
   * Environment variables to pass to the interpreter
   * NOTE: This is specifically for interpreter, hence on the plugin level, not on the tool level
   */
  env?: Record<string, string>;
  /**
   * Default timeout for tool execution in seconds, in not specified, defaults to 10 minutes
   */
  defaultTimeoutSeconds?: number;
  /**
   * Grace period after sending SIGTERM to the process before sending SIGKILL, default 30 seconds
   */
  exitGracePeriodSeconds?: number;
}

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

  async consume(
    onUpdate: (data: TruncatedContent) => Promise<void>,
  ): Promise<TruncatedContent> {
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
  private readonly sandboxed: boolean;
  private readonly toolName: string;
  private readonly os: null | string;
  private readonly extraDescriptions: InterpreterProps["extraDescriptions"];
  private readonly maxLines: number;
  private readonly maxCharacters: number;
  private readonly env: Record<string, string>;
  private readonly defaultTimeoutSeconds: number;
  private readonly exitGracePeriodSeconds: number;

  constructor(
    private readonly ctx: PluginInput,
    props: InterpreterProps,
  ) {
    this.interpreter = props.interpreter;
    this.scriptLanguage = props.scriptLanguage;
    this.sandboxed = props.sandboxed ?? false;
    this.toolName = props.toolName ?? props.scriptLanguage;
    this.os =
      "os" in props && props.os !== undefined ? props.os : process.platform;
    this.extraDescriptions = props.extraDescriptions ?? {};
    this.maxLines = props.outputLimit?.lines ?? DEFAULT_MAX_LINES;
    this.maxCharacters =
      props.outputLimit?.characters ?? DEFAULT_MAX_CHARACTERS;
    this.defaultTimeoutSeconds =
      props.defaultTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    this.exitGracePeriodSeconds =
      props.exitGracePeriodSeconds ?? DEFAULT_EXIT_GRACE_PERIOD_SECONDS;
    this.env = props.env ?? {};
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
    const reader = new DataReader(
      child.stdout,
      this.maxLines,
      this.maxCharacters,
    );

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
    const executionResult = await this.feedChild(
      child,
      context,
      script,
      timeoutSeconds,
    );

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
          sleep(msFromSeconds(this.exitGracePeriodSeconds)).then(() =>
            child.kill("SIGKILL"),
          ),
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

    const timeoutPromise: ResultPromise = sleep(
      msFromSeconds(timeoutSeconds),
    ).then(() => ({
      type: "timeout",
    }));

    return await Promise.race([
      exitPromise,
      abortedPromise,
      writeErrorPromise,
      timeoutPromise,
    ]);
  }

  get pluginHooks(): Hooks {
    return {
      tool: {
        [this.toolName]: tool({
          description: this.toolDescription,
          args: this.toolArgs,
          execute: async (args, context) =>
            this.execute(
              args.script,
              args.description,
              args.timeout ?? this.defaultTimeoutSeconds,
              context,
            ),
        }),
      },
      "tool.execute.after": async (
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
        if (
          !("title" in output.metadata) ||
          typeof output.metadata.title !== "string"
        ) {
          return;
        }
        // restore title
        output.title = output.metadata.title;
      },
    };
  }

  get toolDescription(): string {
    return [
      ...(this.extraDescriptions?.before
        ? [[this.extraDescriptions.before]]
        : []),
      [
        `Use this tool to run a non-interactive ${this.scriptLanguage} script.`,
        "Provide script text in the `script` argument",
      ],
      [],
      [
        "You MUST provide short 5-10 word description of what script does in the `description` argument",
      ],
      [],
      [
        "If you need the script to be executed in directory other than the current project ",
        "(i.e. `cd <dir>` before execution) ",
        `use native ${this.scriptLanguage} mechanisms instead.`,
      ],
      [
        `If you need to pass environment variables to the script - use native ${this.scriptLanguage} mechanisms instead.`,
      ],
      [],
      ["DO NOT use this tool for:"],
      [
        " - Basic editing & reading commands (reading/writing/patching files, searching for files, grep-ping) - use specialized tools instead.",
      ],
      ["   Example of basic editing: read file A, change 3rd line, write back"],
      [
        "   It is okay to use this tool for advanced use cases like: find all typescript files ",
        "with length greater than 1000 lines and with a line matching regex X, extract file names and thirty third lines of those.",
      ],
      [
        " - Interactive scripts - those requiring input in stdin; They WILL timeout.",
      ],
      ...[
        [],
        ...(this.extraDescriptions?.beforeSandbox
          ? [[this.extraDescriptions.beforeSandbox]]
          : []),
        [
          "IMPORTANT: script will be executed in transparent sandboxed environment. ",
          "Only current project directory would be visible inside the script at the same path as outside.",
        ],
        [
          "Any files modified outside of the current project directory will be discarded. ",
          "DO NOT create temporary files to pass data from script, pass everything you need to get from script to stdout. ",
          "Alternatively write to file inside current project directory tree, but avoid writing to files tracked in git for temporary pass-through files.",
        ],
        ...(this.extraDescriptions?.afterSandbox
          ? [[this.extraDescriptions.afterSandbox]]
          : []),
      ].filter(() => this.sandboxed),
      ...[
        [],
        ...(this.extraDescriptions?.beforeOS
          ? [[this.extraDescriptions.beforeOS]]
          : []),
        [`Script will run on ${this.os} operating system`],
        ...(this.extraDescriptions?.afterOS
          ? [[this.extraDescriptions.afterOS]]
          : []),
      ].filter(() => this.os !== null),
      [
        ["Output format:"],
        [" - execution result:"],
        [
          "   - exit code (0-255) wrapped in `<exit>` tag when the script finished execution normally",
        ],
        [
          "   - `<exit>TIMEOUT</exit>` when execution timed out - read the results first and ",
          "then decide if you need to call this tool again with greater timeout value",
        ],
        ["   - `<exit>ABORTED</exit>` when user aborted execution"],
        [
          " - number of lines and characters in output as attributes to `<total />` tag, for example: <total lines=100 characters=1000 />",
        ],
        [" - either:"],
        ["   - output (stdout, stderr or both) wrapped in `<output>` tag"],
        [
          "   - start of the output wrapped in `<head>`, end of the output wrapped in `<tail>` and path to file with full output wrapped in `<output.file>`. ",
          `This format is used when output either exceeds ${this.maxLines} lines or ${this.maxCharacters} characters. `,
          "Output in <head> and <tail> combined will have the same limit. ",
          "Use Grep and Read tools to read the full output from file in `<output.file>` if needed",
        ],
      ],
      ...(this.extraDescriptions?.after
        ? [[], [this.extraDescriptions.after]]
        : []),
    ]
      .map((line) => line.join(""))
      .join("\n");
  }

  get toolArgs() {
    return {
      script: tool.schema
        .string()
        .describe(`Non-interactive script in ${this.scriptLanguage}`),
      description: tool.schema
        .string()
        .describe("Short 5-10 word description of what script does"),
      timeout: tool.schema
        .number()
        .optional()
        .describe("Script execution timeout in seconds, default is 300"),
      capture: tool.schema
        .enum(["stdout", "stderr", "both"])
        .optional()
        .describe("Output capture mode, default is both"),
    };
  }
}

export const OpencodeShellToolPlugin: Plugin = async (
  cxt: PluginInput,
  config?: Record<string, unknown>,
) => ({});
