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

export class DescriptionRenderer {
  private readonly extraParameters: Record<string, string>;
  private readonly prompts: Prompts;

  private rendered: string | null = null;

  constructor(
    configuredPrompts: InterpreterDefinition["prompt"],
    private readonly parameters: RendererParameters,
    defaultPrompts = defaultPluginPrompts,
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
