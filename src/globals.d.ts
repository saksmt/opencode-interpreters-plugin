declare module "*.md" {
  const content: string;
  // biome-ignore lint/style/noDefaultExport: bun interface
  export default content;
}
