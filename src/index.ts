import { setTimeout } from "node:timers/promises";
import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import { InterpreterTool } from "@/InterpreterTool.ts";
import { Logger } from "@/Logger.ts";
import type { ToastOptions } from "@/opencode-types.ts";
import { SessionFs } from "@/SessionFs.ts";
import { fireAndForget, Millis } from "@/utils.ts";
import { Config } from "./Config";

const OpencodeShellToolPlugin: Plugin = async (ctx: PluginInput, config?: Record<string, unknown>) => {
  let hooks: Hooks = {};
  const logger = Logger.forPluginContext(ctx, "opencode-interpreters-plugin");

  const sendToast = (opts: ToastOptions) => {
    fireAndForget(() =>
      // let it load
      // biome-ignore lint/style/noMagicNumbers: ...
      setTimeout(Millis.fromSeconds(3)).then(() => {
        const _ = ctx.client.tui.showToast(opts);
      }),
    );
  };

  await logger.info("Initializing opencode-interpreters-plugin");

  const sessionFs = await SessionFs.create(ctx.client);

  fireAndForget(() => sessionFs.startBookkeeping());
  hooks.event = ({ event }) => sessionFs.opencodeEventListener(event);

  await logger.debug("Initialized opencode-interpreters-plugin session fs");
  await logger.debug(`Loading opencode-interpreters-plugin configuration from ${JSON.stringify(config)}`);

  const interpreters = await Config.load(config ?? {}, logger, sendToast);

  if (!interpreters) {
    // validation failed
    return hooks;
  }

  await logger.debug(`Loaded opencode-interpreters-plugin configuration: ${JSON.stringify(interpreters)}`);

  await logger.info("Loading interpreters");
  for (const interpreter of interpreters) {
    // biome-ignore lint/performance/noAwaitInLoops: this is logging...
    await logger.info(`Loading ${interpreter.configKey} interpreter`);
    const tool = InterpreterTool.create(
      logger.childLogger(interpreter.configKey),
      ctx,
      sessionFs,
      interpreter,
    );
    hooks = tool.register(hooks);
  }

  if (interpreters.length === 0) {
    sendToast({
      body: {
        title: "opencode-interpreters-plugin",
        message: "No configuration provided!",
        variant: "error",
      },
    });
    await logger.warn(
      `No interpreters loaded, configure them by passing an object to plugin: ["opencode-interpreters-plugin", { /* your config */ }]; Config provided: ${JSON.stringify(config)}`,
    );
  }

  return hooks;
};

// biome-ignore lint/style/noDefaultExport: opencode plugin API
export default OpencodeShellToolPlugin;
