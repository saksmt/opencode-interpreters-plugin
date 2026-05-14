import { describe, expect, it } from "bun:test";
import { Template } from "../src/Template";

describe("Template", () => {
  it("renders template with provided data", () => {
    const template = new Template("Hello, {{ name }}!");
    const result = template.render({ name: "World" });
    expect(result).toBe("Hello, World!");
  });

  it("handles missing data gracefully", () => {
    const template = new Template("Hello, {{name}}!");
    const result = template.render({});
    expect(result).toBe("Hello, {{name}}!");
  });

  it("supports lazy evaluation of values", () => {
    const template = new Template("Hello, {{ name }}!");
    const result = template.render({ name: () => "World" });
    expect(result).toBe("Hello, World!");
  });

  it("does not evaluate lazy values when not needed", () => {
    const template = new Template("Hello, {{ name }}!");
    const result = template.render({
      notCalled: () => {
        throw new Error("Should not be called");
      },
    });
    expect(result).toBe("Hello, {{ name }}!");
  });

  it("substitutes all template values", () => {
    const template = new Template("Hello, {{ name }}! Your age is {{ age }}.");
    const year = new Date().getUTCFullYear();
    const result = template.render({ name: "Jesus", age: year });
    expect(result).toBe(`Hello, Jesus! Your age is ${year}.`);
  });
});
