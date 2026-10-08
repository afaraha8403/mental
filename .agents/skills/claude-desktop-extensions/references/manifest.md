# MCPB `manifest.json` reference

Source: `https://github.com/modelcontextprotocol/mcpb` (`MANIFEST.md`). Spec `0.3`; `uv` shown with `0.4`. Re-read it for the version you target.

## Working example (node server)

```json
{
  "manifest_version": "0.3",
  "name": "notes-search",
  "display_name": "Notes Search",
  "version": "1.0.0",
  "description": "Search local markdown notes from Claude.",
  "long_description": "Searches a notes folder you choose and returns matching snippets.",
  "author": { "name": "Your Name", "email": "you@example.com" },
  "license": "MIT",
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "NOTES_DIR": "${user_config.notes_dir}",
        "API_KEY": "${user_config.api_key}"
      }
    }
  },
  "tools": [
    { "name": "search_notes", "description": "Search notes by keyword." }
  ],
  "user_config": {
    "notes_dir": {
      "type": "directory",
      "title": "Notes folder",
      "description": "Folder containing your markdown notes.",
      "required": true
    },
    "api_key": {
      "type": "string",
      "title": "API key",
      "description": "Optional key for remote enrichment.",
      "sensitive": true,
      "required": false
    }
  },
  "compatibility": {
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": { "node": ">=18.0.0" }
  },
  "privacy_policies": []
}
```

(Add a real `privacy_policies` URL list when connecting to external services.)

## Fields

| Field | Required | Notes |
| --- | :-: | --- |
| `manifest_version` | yes | Spec version string |
| `name` | yes | Machine name |
| `version` | yes | semver |
| `description` | yes | Short |
| `author` | yes | `{ name, email?, url? }` |
| `server` | yes | See below |
| `display_name`, `long_description` | | Listing text |
| `icon`, `icons[]` | | `icons[]` items: `{ src, size, theme }` |
| `screenshots` | | |
| `repository`, `homepage`, `documentation`, `support` | | URLs |
| `keywords`, `license` | | |
| `tools[]`, `prompts[]` | | Prompts can use `${arguments.x}` |
| `tools_generated`, `prompts_generated` | | Set when lists are dynamic |
| `privacy_policies[]` | when external services handle user data | |
| `compatibility` | | `claude_desktop` semver range, `platforms` (`darwin`, `win32`, `linux`), `runtimes` (`node`, `python`) |
| `user_config` | | See below |
| `localization`, `_meta` | | |

## `server`

- `type`: `node` | `python` | `binary` | `uv`
  - `node`: bundle `node_modules`.
  - `python`: bundle dependencies in `server/lib` or `server/venv`.
  - `binary`: compiled executable; `.exe` is appended on Windows; use `platform_overrides` for per-OS paths.
  - `uv`: requires `pyproject.toml`; must **not** include `server/lib` or `server/venv`.
- `entry_point`: path inside the bundle.
- `mcp_config`: `command`, `args`, `env`, and `platform_overrides` (per-OS replacement of those fields).

## Variables

`${__dirname}` (extension root), `${HOME}`, `${DESKTOP}`, `${DOCUMENTS}`, `${DOWNLOADS}`, `${pathSeparator}` / `${/}`, `${user_config.KEY}`.

## `user_config`

Types: `string`, `number`, `boolean`, `directory`, `file`. Properties: `title`, `description`, `required`, `default`, `multiple`, `sensitive` (stored in the OS keychain), `min` / `max`. Claude Desktop will not enable the extension until required values are provided.
