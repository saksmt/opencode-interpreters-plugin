import { describe, expect, it } from "bun:test";
import type { FileHandle } from "node:fs/promises";
import { open as fsOpen, mkdir } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { InterpreterToolExecutor } from "../src/InterpreterToolExecutor.ts";
import { ConsoleLogger } from "../src/Logger.ts";
import type { PromisifiedToolContext } from "../src/opencode-types.ts";
import { ProcessBuilder } from "../src/process";
import type { SessionFs } from "../src/SessionFs.ts";

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

const logger = new ConsoleLogger("test");

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

describe("InterpreterToolExecutor", () => {
  if (platform() !== "linux") {
    return;
  }

  const sessionFs = new FakeSessionFs();

  it("returns full output when content fits within limits", async () => {
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
  });

  it("creates output file when content exceeds limits", async () => {
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
  });
});
