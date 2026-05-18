import process from "node:process";
import type { InterpreterDefinition } from "./InterpreterDefinition";
import * as defaultPluginPrompts from "./prompts";
import { Template } from "./Template";

type PromptConfig = InterpreterDefinition["prompt"];
type Prompts = Omit<PromptConfig, "extraParameters">;

export interface RendererParameters {
  sandboxed: boolean;
  os: string | null;
  maxLines: number;
  maxCharacters: number;
  defaultTimeoutSeconds: number;
  exitGracePeriodSeconds: number;
  scriptLanguage: string;
}

function titleCase(str: string): string {
  return str.slice(0, 1).toUpperCase() + str.slice(1);
}

export const DEFAULT_PROMPTS = {
  ...defaultPluginPrompts,
  ...Object.fromEntries([
    ...Object.keys(defaultPluginPrompts)
      .map(titleCase)
      .flatMap((it) => [`before${it}`, `after${it}`])
      .map((it) => [it, ""]),
    ["before", ""],
    ["after", ""],
  ]),
};

export class DescriptionRenderer {
  private readonly extraParameters: Record<string, string>;
  private readonly prompts: Prompts;

  private rendered: string | null = null;

  constructor(
    configuredPrompts: InterpreterDefinition["prompt"],
    private readonly parameters: RendererParameters,
    defaultPrompts = DEFAULT_PROMPTS,
  ) {
    this.extraParameters = configuredPrompts?.extraParameters ?? {};
    const configuredWithoutExtra: Prompts & { extraParameters?: Record<string, string> } = {
      ...(configuredPrompts ?? {}),
    };
    // biome-ignore lint/performance/noDelete: necessary
    delete configuredWithoutExtra?.extraParameters;
    this.prompts = {
      ...defaultPrompts,
      ...(configuredWithoutExtra as Prompts),
      ...(configuredPrompts?.extraParameters ?? {}),
    };
  }

  static default(interpreter: InterpreterDefinition): DescriptionRenderer {
    return new DescriptionRenderer(interpreter.prompt, {
      sandboxed: interpreter.sandboxed,
      scriptLanguage: interpreter.scriptLanguage,
      os: "os" in interpreter && interpreter.os !== undefined ? interpreter.os : process.platform,
      maxLines: interpreter.outputLimit.lines,
      maxCharacters: interpreter.outputLimit.characters,
      defaultTimeoutSeconds: interpreter.defaultTimeoutSeconds,
      exitGracePeriodSeconds: interpreter.exitGracePeriodSeconds,
    });
  }

  get description(): string {
    return this.rendered ?? this.renderDescription();
  }

  private renderDescription(): string {
    // using mutable fields to achieve automatic recursive template rendering
    const templates: Record<string, string | (() => string)> = { ...this.prompts, ...this.extraParameters };

    for (const [key, template] of Object.entries(templates)) {
      if (typeof template !== "string") {
        // can't actually happen, but keeps typecheck happy
        continue;
      }
      templates[key] = () => new Template(template).render(templates);
    }

    // remove os hint when disabled
    if (this.parameters.os === null) {
      templates.osHint = "";
    } else {
      templates.os = this.parameters.os;
    }

    // remove sandbox hint when disabled
    if (this.parameters.sandboxed) {
      templates.sandboxed = "true";
    } else {
      templates.sandbox = "";
      templates.sandboxed = "false";
    }

    templates.scriptLanguage = this.parameters.scriptLanguage;
    templates.maxCharacters = this.parameters.maxCharacters.toString();
    templates.maxLines = this.parameters.maxLines.toString();
    templates.defaultTimeoutSeconds = this.parameters.defaultTimeoutSeconds.toString();
    templates.exitGracePeriodSeconds = this.parameters.exitGracePeriodSeconds.toString();

    const rendered = (templates.main as () => string)();
    this.rendered = rendered;
    return rendered;
  }
}
