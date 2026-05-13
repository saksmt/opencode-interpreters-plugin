# opencode-shell-tool

## Tech Stack
- Runtime: Bun
- Language: TypeScript (strict)
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
src/              # Source code
tests/            # Test files (mirrors src/ structure)
script/           # Utility scripts
dist/             # Build output
package.json      # Dependencies and scripts
tsconfig.json     # TypeScript config
biome-all.jsonc   # Enables ALL rules at "error" (except nursery)
biome.jsonc       # Extends biome-all.jsonc, disables/tunes rules per project
CODE_STYLE.md     # Code style guide (read before writing code)
flake.nix         # Nix dev shell
```

## Agent Rules

- **Do not modify `biome.jsonc` or `biome-all.jsonc`** without explicit user instruction. These files define the project's linting and formatting configuration and should only change when the user explicitly requests it.
- **Read `CODE_STYLE.md` before writing code** and follow its rules. Read it when you need it, not at session start, to conserve context.
