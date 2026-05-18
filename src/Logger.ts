import type { PluginInput } from "@opencode-ai/plugin";
import { voidPromise } from "@/utils.ts";

export interface Logger {
  debug(message: string, ctx?: Record<string, unknown>): Promise<void>;
  info(message: string, ctx?: Record<string, unknown>): Promise<void>;
  warn(message: string, ctx?: Record<string, unknown>): Promise<void>;
  error(message: string, ctx?: Record<string, unknown>): Promise<void>;
  childLogger(name: string): Logger;
}
export const Logger = {
  forPluginContext(ctx: PluginInput, service: string): Logger {
    return new PluginLogger(ctx, service);
  },
};

class PluginLogger implements Logger {
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

  childLogger(name: string): Logger {
    return new PluginLogger(this.ctx, `${this.service}.${name}`);
  }
}
