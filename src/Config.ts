import type { PluginInput } from "@opencode-ai/plugin";
import * as zod from "zod";
import { InterpreterDefinition } from "./InterpreterDefinition";

export const Config = Object.assign(
  zod.object({
    interpreters: zod
      .record(zod.string(), InterpreterDefinition.partial({ scriptLanguage: true }))
      .default({}),
  }),
  {
    async load(
      ctx: PluginInput,
      config: unknown,
    ): Promise<(InterpreterDefinition & { configKey: string })[]> {
      const configValidationResult = Config.safeParse(config);
      if (!configValidationResult.success) {
        await ctx.client.tui.showToast({
          body: {
            title: "opencode-interpreters-plugin failed to load",
            // biome-ignore lint/style/useTemplate: this is more readable here
            message: "Invalid configuration:\n" + zod.prettifyError(configValidationResult.error),
            variant: "error",
          },
        });
        await ctx.client.app.log({
          body: {
            service: "opencode-interpreters-plugin",
            message: "Failed to load configuration",
            level: "error",
            extra: zod.treeifyError(configValidationResult.error),
          },
        });
        return [];
      }
      const validatedConfig = configValidationResult.data;
      return Object.entries(validatedConfig.interpreters).map(([name, interpreterConf]) =>
        Object.assign(interpreterConf, {
          configKey: name,
          scriptLanguage: interpreterConf.scriptLanguage ?? name,
        }),
      );
    },
  },
);

export type Config = zod.infer<typeof Config>;
