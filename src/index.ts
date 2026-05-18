import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import { InterpreterTool } from "@/InterpreterTool.ts";
import { Logger } from "@/Logger.ts";
import { SessionFs } from "@/SessionFs.ts";
import { fireAndForget } from "@/utils.ts";
import { Config } from "./Config";

const OpencodeShellToolPlugin: Plugin = async (ctx: PluginInput, config?: Record<string, unknown>) => {
  let hooks: Hooks = {};
  const logger = Logger.forPluginContext(ctx, "opencode-interpreters-plugin");

  await logger.info("Initializing");

  const sessionFs = await SessionFs.create(ctx.client);

  fireAndForget(() => sessionFs.startBookkeeping());
  hooks.event = ({ event }) => sessionFs.opencodeEventListener(event);

  const interpreters = await Config.load(ctx, config ?? {});
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

  return hooks;
};

// biome-ignore lint/style/noDefaultExport: opencode plugin API
export default OpencodeShellToolPlugin;
