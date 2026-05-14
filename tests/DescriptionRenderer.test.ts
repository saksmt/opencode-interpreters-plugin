import { describe, expect, it } from "bun:test";
import { DescriptionRenderer, type RendererParameters } from "../src/DescriptionRenderer";

describe("DescriptionRenderer", () => {
  const stubParameters: RendererParameters = {
    sandboxed: false,
    scriptLanguage: "bash",
    os: null,
    maxLines: 1,
    maxCharacters: 2,
    defaultTimeoutSeconds: 3,
    exitGracePeriodSeconds: 4,
  };

  it("should resolve templates recursively", () => {
    const renderer = new DescriptionRenderer(undefined, stubParameters, {
      sandbox: "",
      prelude: "P:{{ rules }}",
      main: "{{ prelude }}",
      rules: "R:{{ outputFormat }}",
      osHint: "",
      outputFormat: "OUTPUT_FORMAT",
    });

    expect(renderer.description).toBe("P:R:OUTPUT_FORMAT");
  });

  it("should only substitute osHint if os is defined", () => {
    const templates = {
      sandbox: "",
      prelude: "",
      main: "{{ osHint }}",
      rules: "",
      osHint: "OS_HINT:{{ os }}",
      outputFormat: "",
    };
    const rendererWithOs = new DescriptionRenderer(undefined, { ...stubParameters, os: "linux" }, templates);
    const rendererWithoutOs = new DescriptionRenderer(undefined, { ...stubParameters, os: null }, templates);

    expect(rendererWithOs.description).toBe("OS_HINT:linux");
    expect(rendererWithoutOs.description).toBe("");
  });

  it("should only substitute sandbox if in sandbox env", () => {
    const templates = {
      sandbox: "SANDBOX:{{ sandboxed }}",
      prelude: "",
      main: "sandboxed={{ sandboxed }}: {{ sandbox }}",
      rules: "",
      osHint: "",
      outputFormat: "",
    };
    const rendererInSandbox = new DescriptionRenderer(
      undefined,
      { ...stubParameters, sandboxed: true },
      templates,
    );
    const rendererNotInSandbox = new DescriptionRenderer(
      undefined,
      { ...stubParameters, sandboxed: false },
      templates,
    );

    expect(rendererInSandbox.description).toBe("sandboxed=true: SANDBOX:true");
    expect(rendererNotInSandbox.description).toBe("sandboxed=false: ");
  });

  it("should override default templates from configured", () => {
    const renderer = new DescriptionRenderer(
      {
        rules: "OVERRIDDEN",
      },
      stubParameters,
      {
        sandbox: "",
        prelude: "PRELUDE",
        main: "{{ prelude }}-{{ rules }}",
        rules: "DEFAULT RULES",
        osHint: "",
        outputFormat: "",
      },
    );

    expect(renderer.description).toBe("PRELUDE-OVERRIDDEN");
  });

  it("should pass extra arguments and template them", () => {
    const renderer = new DescriptionRenderer(
      {
        rules: "{{ myExtra }}",
        extraParameters: {
          myExtra: "{{ hello }}",
          hello: "world",
        },
      },
      stubParameters,
      {
        sandbox: "",
        prelude: "PRELUDE",
        main: "{{ prelude }}-{{ rules }}",
        rules: "DEFAULT RULES",
        osHint: "",
        outputFormat: "",
      },
    );

    expect(renderer.description).toBe("PRELUDE-world");
  });
});
