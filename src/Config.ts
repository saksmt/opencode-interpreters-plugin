import * as zod from "zod";
import type { Logger } from "@/Logger.ts";
import type { ToastOptions } from "@/opencode-types.ts";
import { InterpreterDefinition } from "./InterpreterDefinition";

export const Config = Object.assign(
  zod.object({
    interpreters: zod
      .record(zod.string(), InterpreterDefinition.partial({ scriptLanguage: true }))
      .default({}),
  }),
  {
    async load(
      config: unknown,
      logger: Logger,
      showToast: (opts: ToastOptions) => void,
    ): Promise<false | (InterpreterDefinition & { configKey: string })[]> {
      const configValidationResult = Config.strict().safeParse(config);
      await logger.debug(`Config validation result: ${JSON.stringify(configValidationResult)}`);
      if (!configValidationResult.success) {
        await logger.error(
          "Failed to load configuration for opencode-interpreters-plugin",
          zod.treeifyError(configValidationResult.error),
        );
        showToast({
          body: {
            title: "opencode-interpreters-plugin failed to load",
            // biome-ignore lint/style/useTemplate: this is more readable here
            message: "Invalid configuration:\n" + zod.prettifyError(configValidationResult.error),
            variant: "error",
          },
        });
        return false;
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
