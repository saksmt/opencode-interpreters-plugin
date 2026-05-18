import { describe, expect, it } from "bun:test";
import type { FileHandle } from "node:fs/promises";
import { open as fsOpen, mkdir } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { InterpreterToolExecutor } from "../src/InterpreterToolExecutor.ts";
import type { Logger } from "../src/Logger.ts";
import type { PromisifiedToolContext } from "../src/opencode-types.ts";
import { ProcessBuilder } from "../src/process";
import type { SessionFs } from "../src/SessionFs.ts";
import { voidPromise } from "../src/utils.ts";

const DEFAULT_MAX_LINES = 700;
const DEFAULT_MAX_CHARACTERS = 40_000;

class FakeSessionFs implements SessionFs {
  async createFile(
    sessionId: string,
    extension?: string,
    _writeOnly?: boolean,
  ): Promise<[string, FileHandle]> {
    const dir = join(tmpdir(), `opencode-shell-test-${sessionId}`);
    await mkdir(dir, { recursive: true });
    const filePath = join(
      dir,
      `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${extension ?? "output"}`,
    );
    const handle = (await fsOpen(filePath, "w")) as unknown as FileHandle;
    return [filePath, handle];
  }

  withRealm(_realm: string): SessionFs {
    return this;
  }
}

function noopContext(): PromisifiedToolContext {
  return {
    sessionID: "test-session",
    messageID: "test-msg",
    agent: "test",
    directory: "/tmp",
    worktree: "/tmp",
    abort: new AbortController().signal,
    // biome-ignore lint/suspicious/noEmptyBlockStatements: noop for tests
    metadata: async () => {},
    // biome-ignore lint/suspicious/noEmptyBlockStatements: noop for tests
    ask: async () => {},
  };
}

class BufferedLogger implements Logger {
  private readonly entries: { level: string; message: string; ctx: Record<string, unknown> }[] = [];

  debug(message: string, ctx: Record<string, unknown> = {}): Promise<void> {
    this.entries.push({ level: "debug", message, ctx });
    return voidPromise;
  }
  info(message: string, ctx: Record<string, unknown> = {}): Promise<void> {
    this.entries.push({ level: "info", message, ctx });
    return voidPromise;
  }
  warn(message: string, ctx: Record<string, unknown> = {}): Promise<void> {
    this.entries.push({ level: "warn", message, ctx });
    return voidPromise;
  }
  error(message: string, ctx: Record<string, unknown> = {}): Promise<void> {
    this.entries.push({ level: "error", message, ctx });
    return voidPromise;
  }
  childLogger(): Logger {
    return this;
  }

  flush(): void {
    for (const e of this.entries) {
      // biome-ignore lint/suspicious/noConsole: flushed only on test failure
      console.log(`[${e.level}] ${e.message}`, JSON.stringify(e.ctx));
    }
  }
}

function withLogs(name: string, fn: (logger: Logger) => Promise<void>): () => Promise<void> {
  return async () => {
    const logger = new BufferedLogger();
    try {
      await fn(logger);
    } catch (e) {
      // biome-ignore lint/suspicious/noConsole: flushed only on test failure
      console.log(`--- logs for "${name}" ---`);
      logger.flush();
      // biome-ignore lint/suspicious/noConsole: flushed only on test failure
      console.log(`--- end logs for "${name}" ---`);
      throw e;
    }
  };
}

describe("InterpreterToolExecutor", () => {
  if (platform() !== "linux") {
    return;
  }

  const sessionFs = new FakeSessionFs();

  it(
    "returns full output when content fits within limits",
    withLogs("fits within limits", async (logger) => {
      const executor = new InterpreterToolExecutor(
        logger,
        sessionFs,
        DEFAULT_MAX_LINES,
        DEFAULT_MAX_CHARACTERS,
        ProcessBuilder("cat").bindStdin(true),
      );

      const script = "hello world";
      const result = await executor.execute(script, "test-description", 10, "stdout", noopContext());

      expect(result.metadata.truncated).toBe(false);
      expect(result.metadata.exit).toBe(0);
      expect(result.output).toContain(script);
    }),
  );

  it(
    "creates output file when content exceeds limits",
    withLogs("exceeds limits", async (logger) => {
      const smallMaxLines = 5;
      const executor = new InterpreterToolExecutor(
        logger,
        sessionFs,
        smallMaxLines,
        1000,
        ProcessBuilder("cat").bindStdin(true),
      );

      const lines = Array.from({ length: 50 }, (_, i) => `line ${i}: some test content`).join("\n");

      const result = await executor.execute(lines, "test-overflow", 10, "stdout", noopContext());

      expect(result.metadata.truncated).toBe(true);
      expect(result.metadata.exit).toBe(0);
      expect(result.metadata.outputPath).toBeDefined();
    }),
  );
});
