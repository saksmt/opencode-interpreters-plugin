# opencode-shell-tool

## Tech Stack
- Runtime: Bun
- Language: TypeScript (strict)
- Dev Shell: Nix flakes (prefix commands with `nix develop`)
- Linting/Formatting: Biome

## Build Commands
```bash
# Install dependencies
bun install

# Build plugin
bun run build

# Typecheck
bun run typecheck

# Run linting
bun run lint

# Run formatting
bun run format

# Run tests
bun test
```

## Project Structure
```
src/index.ts      # Plugin entry point with tool registration
dist/             # Build output
package.json      # Dependencies and scripts
tsconfig.json     # TypeScript config
biome.json        # Biome linting/formatting config
flake.nix         # Nix dev shell
```

## Agent Rules

- **Do not modify `biome.jsonc` or `biome-all.jsonc`** without explicit user instruction. These files define the project's linting and formatting configuration and should only change when the user explicitly requests it.
