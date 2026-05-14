# opencode-interpreters-plugin

A plugin for [opencode](https://opencode.ai) that exposes any interpreter (anything that reads scripts from stdin) as a tool. Ships with an optional override for the default shell tool, enabling users to hook in sandboxed ([bwrap](https://github.com/containers/bubblewrap), seatbelt) and/or enriched ([nix](https://nixos.org), [direnv](https://direnv.net), devcontainers) environments without relying on tree-sitter-based shell parsing for security.

## Quick Start

```jsonc
// opencode.jsonc
{
  "plugin": [
    ["opencode-interpreters-plugin", {
      "interpreters": {
        "Python": {
          "interpreter": "python3"
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
    ["opencode-interpreters-plugin@1.0.0", {
      // config
    }]
  ]
}
```

Pinning versions is useful for security — verify a version is safe, then stay on it until you need a new feature, with no unexpected surprises from auto-updates.

The plugin accepts two configuration keys:

| Key                        | Description                                                                                                                                                    |
|----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `interpreters`             | A record of language names to interpreter configurations. Each key becomes the script language name.                                                           |
| `overrideDefaultShellTool` | Optional configuration to replace opencode's built-in shell tool with a custom interpreter-backed one. Omits language name and tool name since they are fixed. |

### Configuration Properties

| Property                 | Default         | Description                                                                                                                     |
|--------------------------|-----------------|---------------------------------------------------------------------------------------------------------------------------------|
| `interpreter`            | —               | Interpreter command (shebang without `#!`), e.g., `python3`, `node`, `bash`.                                                    |
| `sandboxed`              | `false`         | Whether the interpreter runs inside a sandbox. See Security section.                                                            |
| `extraDescriptions`      | `{}`            | Additional text injected into the tool description (`before`, `after`, `beforeSandbox`, `afterSandbox`, `beforeOS`, `afterOS`). |
| `toolName`               | script language | Tool name exposed to opencode.                                                                                                  |
| `os`                     | host OS         | OS name shown in the tool description. Set to `null` to omit.                                                                   |
| `outputLimit.lines`      | `700`           | Maximum output lines before truncation (head/tail with full output in a file).                                                  |
| `outputLimit.characters` | `40000`         | Maximum output characters before truncation (head/tail with full output in a file).                                             |
| `env`                    | `{}`            | Environment variables passed to the interpreter process.                                                                        |
| `defaultTimeoutSeconds`  | `600`           | Default execution timeout in seconds.                                                                                           |
| `exitGracePeriodSeconds` | `30`            | Grace period in seconds between SIGTERM and SIGKILL on timeout.                                                                 |

When output exceeds either limit, the LLM never sees the full content at once. Instead it receives the head and tail of the output plus a path to a file with the complete output. This prevents token waste while still allowing the LLM to use Grep or Read tools on the full output if needed.

## Example

```json
{
  "plugin": [
    ["opencode-interpreters-plugin", {
      "interpreters": {
        "Python": {
          "interpreter": "/opt/sandboxes/python3/bin/python3",
          "sandboxed": true,
          "extraDescriptions": {
            "before": "This environment has numpy and pandas pre-installed."
          },
          "outputLimit": {
            "lines": 1000,
            "characters": 60000
          },
          "defaultTimeoutSeconds": 300
        },
        "Node": {
          "interpreter": "node",
          "env": {
            "NODE_ENV": "development"
          }
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

This is possible when:
- The sandbox was not manually configured to clean up leaking symlinks.
- opencode was misconfigured or has a bug with symlink escape in its own Read/Write tools.

The planned mitigation for this plugin is to add an option that compares the output of `find -type l` before and after execution and either removes new symlinks or flags them explicitly, preventing this class of issue.

### Out of Scope

There are no plans to add actual sandboxing in this project and there never will be — it is out of scope and better handled at the interpreter level.

## License

[MIT](./LICENSE)
