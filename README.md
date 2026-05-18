# opencode-interpreters-plugin

A plugin for [opencode](https://opencode.ai) that exposes any interpreter (anything that reads scripts from stdin) as a tool. Can be used to override the default shell tool, enabling users to hook in sandboxed ([bwrap](https://github.com/containers/bubblewrap), seatbelt) and/or enriched ([nix](https://nixos.org), [direnv](https://direnv.net), devcontainers) environments without relying on tree-sitter-based shell parsing for security.

## Quick Start

```json5
// opencode.jsonc
{
  "plugin": [
    ["opencode-interpreters-plugin", {
      "interpreters": {
        // stuff your LLM with a python... (that was too bad a joke to be left out)
        "python": {
          "interpreter": "python3"
        },
        // this will override default the shell tool
        "bash": {
          "interpreter": "my-sandboxed-bash",
          // enable injection of sandboxing hint
          "sandboxed": true,
          "prompt": {
            // mention some available packages so that LLM is not entirely blind
            // good candidates are: modern linux utilities (e.g. jq, rg, ...), direnv/nix, ...
            "afterSandbox": "The following packages are available: ...."
          }
        }
      }
    }]
  ]
}
```

## Installation & Configuration

Add the plugin name to your `opencode.jsonc` under the `plugin` key. To pin a version, append it with `@`:

```json
{
  "plugin": [
    ["opencode-interpreters-plugin@0.1.0", {
      // config
    }]
  ]
}
```

Pinning versions is useful for security — verify a version is safe, then stay on it until you need a new feature, with no unexpected surprises from auto-updates.

The plugin accepts an object from interpreter name to it's configuration:

### Configuration Properties

| Property                 | Default         | Description                                                                                                                                                                                                                                                                                     |
|--------------------------|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `interpreter`            | —               | Interpreter command (shebang without `#!`), e.g., `python3`, `node`, `bash`.                                                                                                                                                                                                                    |
| `interpreterArgs`        | `[]`            | Additional arguments passed to the interpreter.                                                                                                                                                                                                                                                 |
| `env`                    | `{}`            | Environment variables passed to the interpreter process.                                                                                                                                                                                                                                        |
| `scriptLanguage`         | interpreter key | Name of the script language (e.g., `bash`, `python`). Defaults to the interpreter key name.                                                                                                                                                                                                     |
| `sandboxed`              | `false`         | Whether the interpreter runs inside a sandbox. See Security section.                                                                                                                                                                                                                            |
| `prompt`                 | `{}`            | See "Prompt Template" section below. Sub-fields: `before`, `main`, `after`, `prelude`, `beforeRules`, `rules`, `afterRules`, `beforeSandbox`, `sandbox`, `afterSandbox`, `beforeOsHint`, `osHint`, `afterOsHint`, `beforeOutputFormat`, `outputFormat`, `afterOutputFormat`, `extraParameters`. |
| `toolName`               | script language | Tool name exposed to opencode.                                                                                                                                                                                                                                                                  |
| `os`                     | host OS         | OS name shown in the tool description. Set to `null` to omit.                                                                                                                                                                                                                                   |
| `outputLimit.lines`      | `700`           | Maximum output lines before truncation (head/tail with full output in a file).                                                                                                                                                                                                                  |
| `outputLimit.characters` | `40000`         | Maximum output characters before truncation (head/tail with full output in a file).                                                                                                                                                                                                             |
| `defaultTimeoutSeconds`  | `600`           | Default execution timeout in seconds.                                                                                                                                                                                                                                                           |
| `exitGracePeriodSeconds` | `30`            | Grace period in seconds between SIGTERM and SIGKILL on timeout.                                                                                                                                                                                                                                 |

### Prompt Templates

The `prompt` config controls the tool description shown to the LLM. Each sub-field is a template rendered with all other prompt fields and `extraParameters` as variables (e.g., `{{os}}`, `{{scriptLanguage}}`). Templates are recursive — a field can reference another field by name.

Template resolution starts at `main` — it is the entry point and the only field that is truly required. Overriding `main` replaces the entire description; all other fields only affect parts of it.

Template names: `main` (the full description body), `prelude` (inserted near the top), `rules` (injected into system rules), `sandbox` (shown when sandboxing is enabled), `osHint` (mentions the OS), `outputFormat` (describes output truncation behavior).

Template "hooks" (`beforeXxx`/`afterXxx`) inject text before/after each template — e.g., `beforeSandbox`, `afterSandbox`.

`extraParameters` adds extra template variables available to all templates.

Special behavior: when `sandboxed` is false, the sandbox part is removed; when `os` is null, the osHint part is removed.

Default templates live in [`./src/prompts/`](./src/prompts/).

### Output Truncation

When output exceeds either limit, the LLM never sees the full content at once. Instead it receives the head and tail of the output plus a path to a file with the complete output. This prevents token waste while still allowing the LLM to use Grep or Read tools on the full output if needed.

Take note to either pass `$XDG_DATA_HOME/opencode-interpreters` to the sandbox, or explicitly mention that reading full output file when output was truncated is only possible using native read/grep tools

## Example

```json
{
  "plugin": [
    ["opencode-interpreters-plugin", {
      "interpreters": {
        "python": {
          "interpreter": "/opt/sandboxes/python3/bin/python3",
          "sandboxed": true,
          "prompt": {
            "afterSandbox": "This environment has numpy and pandas pre-installed."
          },
          "outputLimit": {
            "lines": 1000,
            "characters": 60000
          },
          "defaultTimeoutSeconds": 300
        },
        "node": {
          "interpreter": "node",
          "env": {
            "NODE_ENV": "development"
          },
          "scriptLanguage": "javascript",
          "toolName": "nodejs"
        }
      }
    }]
  ]
}
```

## Security

This plugin does **not** provide sandboxing. It is a thin layer between opencode and an interpreter — it writes a script to stdin and reads stdout. Any sandboxing must be configured **outside** the plugin by wrapping the interpreter command (e.g., `bwrap python3`, `seatbelt exec python3`).

The `sandboxed` property only controls the description shown to the LLM. Setting it to `true` without actually running the interpreter in a sandbox gives the LLM a false sense of confinement. Conversely, leaving it `false` while using a sandboxed interpreter causes the LLM to assume it has unrestricted access.

**Symlink escapes are possible** if not handled by the sandboxed interpreter specifically. For example:

- Call this tool with `ln -s ~/.ssh/id_rsa ./key`
- Call the Read tool with `"./key"`
- Call the Write tool with the content of `"./key"` and a target `"./passing_through"`
- Now sandboxed env has access to your ssh key

This is possible when:
- The sandbox was not manually configured to clean up leaking symlinks.
- opencode was misconfigured or has a bug with symlink escape in its own Read/Write tools.

The planned mitigation for this plugin is to add an option that compares the output of `find -type l` before and after execution and either removes new symlinks or flags them explicitly, preventing this class of issue.

### Out of Scope

There are no plans to add actual sandboxing in this project and there never will be — it is out of scope and better handled at the interpreter level.

## License

[MIT](./LICENSE)
