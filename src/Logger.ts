import type { PluginInput } from "@opencode-ai/plugin";
import { voidPromise } from "@/utils.ts";

export class Logger {
  constructor(
    private readonly ctx: PluginInput,
    private readonly service: string,
  ) {}

  debug(message: string, ctx: Record<string, unknown> = {}): Promise<void> {
    return this.ctx.client.app
      .log({
        body: {
          message,
          level: "debug",
          extra: ctx,
          service: this.service,
        },
      })
      .then(() => voidPromise);
  }

  info(message: string, ctx: Record<string, unknown> = {}): Promise<void> {
    return this.ctx.client.app
      .log({
        body: {
          message,
          level: "info",
          extra: ctx,
          service: this.service,
        },
      })
      .then(() => voidPromise);
  }

  warn(message: string, ctx: Record<string, unknown> = {}): Promise<void> {
    return this.ctx.client.app
      .log({
        body: {
          message,
          level: "warn",
          extra: ctx,
          service: this.service,
        },
      })
      .then(() => voidPromise);
  }

  error(message: string, ctx: Record<string, unknown> = {}): Promise<void> {
    return this.ctx.client.app
      .log({
        body: {
          message,
          level: "error",
          extra: ctx,
          service: this.service,
        },
      })
      .then(() => voidPromise);
  }

  childLogger(name: string) {
    return new Logger(this.ctx, `${this.service}.${name}`);
  }
}
