/**
 * Simplest and stupidest templating possible, supports lazily evaluated values
 */
export class Template {
  private static readonly REGEXP = /(\{\{\s*(?<name>[a-zA-Z0-9_-]+)\s*}})/g;

  constructor(private readonly templateString: string) {}

  render(data: Record<string, unknown>): string {
    return this.templateString.replaceAll(Template.REGEXP, (match, _fullMatch, name) => {
      const value = data[name] ?? match;
      if (typeof value === "function") {
        return value();
      }
      return value;
    });
  }
}
