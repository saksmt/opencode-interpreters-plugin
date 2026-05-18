# opencode-interpreters-plugin

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
- **Never stage or commit LLM-session artifacts** (plans, implementation instructions, context files, half-baked notes) to this repository. These are ephemeral; they are for the LLM session's consumption only and pollute the project history for human maintainers.
  - Tip: Add `.ignoreme/` to your global gitignore (`~/.config/git/ignore`) to keep such artifacts out of all repos automatically.
