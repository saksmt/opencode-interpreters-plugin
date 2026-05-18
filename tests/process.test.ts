import { describe, expect, it } from "bun:test";
import { platform } from "node:os";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import { type Process, ProcessBuilder } from "../src/process";
import { voidPromise } from "../src/utils";

describe("process", () => {
  if (platform() !== "linux") {
    return;
  }

  it("should handle stdout & stdin capture", async () => {
    const cat: Process = ProcessBuilder("cat").bindStdin(true).capture(["stdout"]).buildAndStart();

    let out = "";
    const outFinished = cat.onOutput((chunk) => {
      out += chunk;
      return voidPromise;
    });

    await cat.write("hello", true);
    await outFinished;
    expect(out).toBe("hello");
  });

  it("should capture stdout only", async () => {
    const p = ProcessBuilder("sh", ["-c", "echo stdout_only"]).capture(["stdout"]).buildAndStart();
    let out = "";
    await p.onOutput((chunk) => {
      out += chunk;
      return voidPromise;
    });
    expect(out).toBe("stdout_only\n");
  });

  it("should capture stderr only", async () => {
    const p = ProcessBuilder("sh", ["-c", "echo stderr_only >&2"]).capture(["stderr"]).buildAndStart();
    let out = "";
    await p.onOutput((chunk) => {
      out += chunk;
      return voidPromise;
    });
    expect(out).toBe("stderr_only\n");
  });

  it("should capture both stdout and stderr: stdout", async () => {
    const p: Process = ProcessBuilder("echo", ["hello"]).capture(["stdout", "stderr"]).buildAndStart();
    let out = "";
    await p.onOutput((chunk) => {
      out += chunk;
      return voidPromise;
    });
    expect(out).toBe("hello\n");
  });

  it("should capture both stdout and stderr: stderr", async () => {
    const p: Process = ProcessBuilder("sh").bindStdin(true).capture(["stdout", "stderr"]).buildAndStart();
    let out = "";
    const outFinished = p.onOutput((chunk) => {
      out += chunk;
      return voidPromise;
    });
    await p.write("echo hello >&2", true);
    await outFinished;
    expect(out).toBe("hello\n");
  });

  it("should pass env vars (direct spawn)", async () => {
    const p = ProcessBuilder("sh")
      .withEnv({ myVar: "value" })
      .bindStdin()
      .capture(["stdout"])
      .buildAndStart();
    let out = "";
    const outFinished = p.onOutput((chunk) => {
      out += chunk;
      return voidPromise;
    });
    await p.write("echo $myVar", true);
    await outFinished;
    expect(out).toBe("value\n");
  });

  it("should pass env vars (shell spawn, when capturing both)", async () => {
    const p = ProcessBuilder("sh")
      .withEnv({ myVar: "value" })
      .bindStdin(true)
      .capture(["stdout", "stderr"])
      .buildAndStart();
    let out = "";
    const outFinished = p.onOutput((chunk) => {
      out += chunk;
      return voidPromise;
    });
    await p.write("echo $myVar", true);
    await outFinished;
    expect(out).toBe("value\n");
  });

  it("should use custom working directory", async () => {
    const p = ProcessBuilder("pwd").withPwd("/tmp").capture(["stdout"]).buildAndStart();
    let out = "";
    await p.onOutput((chunk) => {
      out += chunk;
      return voidPromise;
    });
    expect(out.trim()).toBe("/tmp");
  });

  it("should timeout after specified duration", async () => {
    const p = ProcessBuilder("sleep", ["10"]).timeout(100).buildAndStart();
    const result = await p.processFinished();
    expect(result.type).toBe("timeout");
  });

  it("should not timeout after specified duration if process finishes earlier", async () => {
    const p = ProcessBuilder("sleep", ["0.1"]).timeout(1000).buildAndStart();
    const result = await p.processFinished();
    expect(result.type).toBe("exit");
  });

  it("should abort via AbortSignal", async () => {
    const ac = new AbortController();
    const p = ProcessBuilder("sleep", ["10"]).abortOn(ac.signal).buildAndStart();
    // letting it have time to start
    setTimeout(() => ac.abort(), 50);
    const result = await p.processFinished();
    expect(result.type).toBe("aborted");
  });

  it("should abort via promise", async () => {
    // letting it have time to start
    const abortPromise = setTimeoutPromise(50);
    const p = ProcessBuilder("sleep", ["10"]).abortOn(abortPromise).buildAndStart();
    const result = await p.processFinished();
    expect(result.type).toBe("aborted");
  });
});
