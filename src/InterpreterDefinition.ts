import * as zod from "zod";

export const DEFAULT_TIMEOUT_SECONDS = 600;
export const DEFAULT_EXIT_GRACE_PERIOD_SECONDS = 30;
export const DEFAULT_MAX_LINES = 700;
export const DEFAULT_MAX_CHARACTERS = 40_000;

export const InterpreterDefinition = zod.object({
  interpreter: zod
    .string()
    .describe('Interpreter command to use for running scripts, essentially shebang without the "#!" part'),
  scriptLanguage: zod.string().describe("Name of the script language"),
  sandboxed: zod
    .boolean()
    .default(false)
    .describe(
      [
        "Whether the interpreter starts the script in a sandboxed environment",
        "IMPORTANT: THIS DOES NOT MAGICALLY ENABLE SANDBOXING FOR INTERPRETER, IT ONLY SIGNIFIES WHETHER INTERPRETER IS RUNNING IN SANDBOX OR NOT",
      ].join("\n"),
    ),
  toolName: zod
    .string()
    .optional()
    .describe("Tool name to expose to opencode, {@link scriptLanguage} by default"),
  os: zod
    .string()
    .optional()
    .nullable()
    .describe(
      [
        "Operating system to mention in description, by default, used OS where opencode is running,",
        "set to null to disable mentioning OS in the description",
        "",
        "This is useful to override if you are running opencode on mac and use docker or VM based sandboxing",
      ].join("\n"),
    ),
  outputLimit: zod
    .object({
      lines: zod
        .number()
        .check(zod.positive())
        .default(DEFAULT_MAX_LINES)
        .describe(`Maximum number of lines in output, default is ${DEFAULT_MAX_LINES}`),
      characters: zod
        .number()
        .check(zod.positive())
        .default(DEFAULT_MAX_CHARACTERS)
        .describe(`Maximum number of characters in output, default is ${DEFAULT_MAX_CHARACTERS}`),
    })
    .prefault({})
    .describe([""].join("\n")),
  env: zod
    .record(zod.string(), zod.string())
    .default({})
    .describe(
      [
        "Environment variables to pass to the interpreter",
        "NOTE: This is specifically for interpreter, hence on the plugin level, not on the tool level (i.e not controlled by LLM)",
      ].join("\n"),
    ),
  defaultTimeoutSeconds: zod
    .number()
    .check(zod.positive())
    .default(DEFAULT_TIMEOUT_SECONDS)
    .describe(
      `Default timeout for tool execution in seconds, in not specified, defaults to ${DEFAULT_TIMEOUT_SECONDS} seconds`,
    ),
  exitGracePeriodSeconds: zod
    .number()
    .check(zod.positive())
    .default(DEFAULT_EXIT_GRACE_PERIOD_SECONDS)
    .describe(
      `Grace period after sending SIGTERM to the process before sending SIGKILL, default is ${DEFAULT_EXIT_GRACE_PERIOD_SECONDS} seconds`,
    ),

  prompt: zod
    .object({
      before: zod.string().optional(),
      main: zod.string().optional().describe("Override the main template, see ./prompts/main.md"),
      after: zod.string().optional(),
      //
      prelude: zod.string().optional().describe("Override the prelude template, see ./prompts/_prelude.md"),
      //
      beforeRules: zod.string().optional(),
      rules: zod.string().optional().describe("Override the rules template, see ./prompts/_rules.md"),
      afterRules: zod.string().optional(),
      //
      beforeSandbox: zod.string().optional(),
      sandbox: zod.string().optional().describe("Override the sandbox template, see ./prompts/_sandbox.md"),
      afterSandbox: zod.string().optional(),
      //
      beforeOsHint: zod.string().optional(),
      osHint: zod.string().optional().describe("Override the osHint template, see ./prompts/_os-hint.md"),
      afterOsHint: zod.string().optional(),
      //
      beforeOutputFormat: zod.string().optional(),
      outputFormat: zod
        .string()
        .optional()
        .describe("Override the outputFormat template, see ./prompts/_output-format.md"),
      afterOutputFormat: zod.string().optional(),
      //
      extraParameters: zod
        .record(zod.string(), zod.string())
        .default({})
        .describe("Extra template parameters"),
    })
    .prefault({})
    .describe("Tool description configuration"),
});
export type InterpreterDefinition = zod.infer<typeof InterpreterDefinition>;
