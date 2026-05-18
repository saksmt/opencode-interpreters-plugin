import { describe, expect, it } from "bun:test";
import { platform } from "node:os";
import { type Process, ProcessBuilder } from "../src/process";
import { voidPromise } from "../src/utils";

describe("process", () => {
  if (platform() === "linux") {
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
  }
});
