import type { WriteStream } from "node:fs";
import { promisify } from "node:util";
import type { PluginInput } from "@opencode-ai/plugin";
import type { InterpreterDefinition } from "@/InterpreterDefinition.ts";
import type {
  InterpreterMetadata,
  InterpreterResult,
  InterpreterTruncatedOutput,
} from "@/InterpreterTool.ts";
import type { Logger } from "@/Logger.ts";
import type { PromisifiedToolContext, ShellToolInProgressMetadata } from "@/opencode-types.ts";
import { type Process, ProcessBuilder } from "@/process";
import type { AbsolutePath, SessionFs } from "@/SessionFs.ts";
import { TruncatedView } from "@/TruncatedView.ts";
import { exhaustive, Millis } from "@/utils.ts";

interface FileOutput {
  stream: WriteStream;
  path: AbsolutePath;
  write: (data: string) => Promise<void>;
}

interface Output {
  readonly view: TruncatedView;
  file: FileOutput | null;
}

export class InterpreterToolExecutor {
  constructor(
    private readonly logger: Logger,
    private readonly sessionFs: SessionFs,
    private readonly maxLines: number,
    private readonly maxCharacters: number,
    private readonly processBuilder: ProcessBuilder,
  ) {}

  static create(
    logger: Logger,
    ctx: PluginInput,
    sessionFs: SessionFs,
    props: InterpreterDefinition,
  ): InterpreterToolExecutor {
    const processBuilder = ProcessBuilder(props.interpreter, props.interpreterArgs)
      .withEnv(props.env)
      .withPwd(ctx.directory)
      .shutdownTimeout(props.exitGracePeriodSeconds)
      .bindStdin(true);
    return new InterpreterToolExecutor(
      logger,
      sessionFs,
      props.outputLimit.lines,
      props.outputLimit.characters,
      processBuilder,
    );
  }

  async execute(
    script: string,
    description: string,
    timeoutSeconds: number,
    capture: "stdout" | "stderr" | "both",
    context: PromisifiedToolContext,
  ): Promise<InterpreterResult> {
    await this.logger.info("Called interpreter with:", {
      script,
      description,
      timeoutSeconds,
      capture,
    });
    try {
      return await this.doExecute(script, description, timeoutSeconds, capture, context);
    } catch (error) {
      await this.logger.error("Interpreter execution failed", {
        script,
        description,
        timeoutSeconds,
        capture,
        error,
      });
      throw error;
    }
  }

  private async doExecute(
    script: string,
    description: string,
    timeoutSeconds: number,
    capture: "stdout" | "stderr" | "both",
    context: PromisifiedToolContext,
  ): Promise<InterpreterResult> {
    // all plugin tools outputs are truncated forcibly
    // can be avoided with a hack by hooking into tool.execute.after

    await context.metadata({
      title: description,
      metadata: {
        output: "",
        description,
      },
    });

    const child = this.processBuilder
      .capture(capture === "both" ? ["stdout", "stderr"] : [capture])
      .timeout(Millis.fromSeconds(timeoutSeconds))
      .abortOn(context.abort)
      .buildAndStart();

    child.unref();

    const [output, outputFinished] = this.handleOutput(child, context, description, capture);

    // intentionally writing in background so that we can get output as it comes
    const _ = child.write(script, true);

    const executionResult = await child.processFinished();

    await this.logger.info("Interpreter execution completed", {
      script,
      description,
      timeoutSeconds,
      capture,
      executionResult,
    });

    switch (executionResult.type) {
      case "exit":
        await outputFinished;
        return await this.asResult(executionResult.code, output, description);
      case "error":
        // just forwarding it, following same logic as in opencode's shell tool
        throw executionResult.error;
      case "timeout":
        return await this.asResult("TIMEOUT", output, description);
      case "aborted":
        // would be awesome to ask user why here, but it is impossible
        return await this.asResult("ABORTED", output, description);
      case "writeError":
        // just forwarding it, following same logic as in opencode's shell tool
        throw executionResult.error;
      default:
        exhaustive(executionResult);
    }
  }

  private handleOutput(
    child: Process,
    context: PromisifiedToolContext,
    description: string,
    capture: "stdout" | "stderr" | "both",
  ): [output: Output, finished: Promise<void>] {
    // todo: separate view for user preview?
    // todo: separate config setting?
    // todo: get terminal size from opencode?
    const output: Output = {
      view: new TruncatedView(this.maxLines, this.maxCharacters),
      file: null,
    };
    let firstOverflow: null | string[] = null;
    output.view.beforeOverflow = (contentSoFar) => {
      firstOverflow = contentSoFar;
    };

    const outputFinished = child.onOutput(async (data) => {
      output.view.feed(data);

      await this.logger.info("Got output chunk", { data });

      await context.metadata({
        metadata: {
          output: output.view.render(() =>
            [
              `... omitted ${output.view.truncatedCharacters} characters`,
              `across ${output.view.truncatedLines} lines ...`,
            ].join("\n"),
          ),
          description,
        } satisfies ShellToolInProgressMetadata,
      });

      if (firstOverflow !== null) {
        output.file = await this.createOutputFile(context, capture);
        for (const chunk of firstOverflow) {
          // biome-ignore lint/performance/noAwaitInLoops: we need sequential semantics here
          await output.file.write(chunk);
        }
        firstOverflow = null;
      }

      if (output.file !== null) {
        await output.file.write(data);
      }
    });
    return [output, outputFinished];
  }

  private async createOutputFile(context: PromisifiedToolContext, capture: "stdout" | "stderr" | "both") {
    const [path, handle] = await this.sessionFs.createFile(
      context.sessionID,
      capture === "both" ? "output" : capture,
      true,
    );
    const stream = handle.createWriteStream({});
    const write = (data: string) =>
      new Promise<void>((resolve, reject) => {
        stream.write(data, "utf8", (error) => {
          if (error) {
            reject(error);
          } else {
            resolve(undefined);
          }
        });
      });
    return { stream, path, write };
  }

  private async asResult(
    exitResult: number | string | null,
    output: Output,
    description: string,
  ): Promise<InterpreterResult> {
    const outputMeta: InterpreterTruncatedOutput & { output: string[] } = output.view.truncated
      ? await this.metadataForTruncated(output)
      : {
          truncated: false,
          output: ["<output>", ...(output.view.content ?? []), "</output>"],
        };
    const meta: InterpreterMetadata = {
      ...outputMeta,
      exit: typeof exitResult === "number" ? exitResult : null,
      output: [
        `<exit>${exitResult ?? "unknown"}</exit>`,
        `<total lines=${output.view.totalLines} characters=${output.view.totalCharacters} />`,
        ...outputMeta.output,
      ].join("\n"),
      totalLines: output.view.totalLines,
      totalCharacters: output.view.totalCharacters,
      description,
    };

    return {
      title: description,
      output: meta.output,
      metadata: {
        ...meta,
        original: meta,
      },
    };
  }

  private async metadataForTruncated(output: Output): Promise<
    InterpreterTruncatedOutput & {
      output: string[];
    }
  > {
    const file = output.file;
    if (file === null) {
      throw new Error("Output was truncated but no output file was created");
    }

    const head = output.view.renderedHead;
    const tail = output.view.renderedTail;
    await promisify(file.stream.close)();
    return {
      truncated: true,
      outputPath: file.path,
      output: [
        "<head>",
        head,
        "</head>",
        "<tail>",
        tail,
        "</tail>",
        `<output.file>${file.path}</output.file>`,
      ],
      head,
      tail,
    };
  }
}
