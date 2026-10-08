# plugin.json reference

Source: `https://code.claude.com/docs/en/plugins-reference`. The CLI's `claude plugin validate` is the final judge.

## Minimal and full examples

```json
{ "name": "my-plugin" }
```

```json
{
  "name": "my-plugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "description": "What it does in one sentence.",
  "author": { "name": "Your Name", "email": "you@example.com" },
  "homepage": "https://example.com/my-plugin",
  "repository": "https://github.com/you/my-plugin",
  "license": "MIT",
  "keywords": ["productivity"],
  "userConfig": {
    "api_token": {
      "type": "string",
      "title": "API token",
      "description": "Token for the Example service.",
      "sensitive": true
    }
  },
  "mcpServers": "./.mcp.json"
}
```

## Fields

`$schema`, `name`, `displayName`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `metadata`, `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`, `defaultEnabled`, `dependencies`, `settings`, `userConfig`, `types`, `channels`, `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `workflows`, `experimental`.

- Directory-listing fields (description, author, URLs, icon...) are read **only from `plugin.json`**.
- Unknown top-level keys are stripped with a warning. Unknown keys inside `userConfig`, `channels`, `lspServers` or `monitors` entries are errors.
- `version`: setting it pins users until it changes. Omit it to use the git commit SHA.
- `homepage` must parse as a URL.
- `channels[]` entries bind to an MCP server via `server`.

## Names

- Kebab-case. Components are namespaced `plugin:component`.
- `validate` **errors** on names starting `claude-`, `anthropic-`, `anthropics-`, `cc-plugin-`; on the exact names `claude`, `anthropic`, `anthropics`, `claude-code`, `claude-mods`; and on `official` next to `claude`/`anthropic`. It **warns** when those words appear as whole words elsewhere. `claude plugin init` and `tag` refuse reserved names.

## Paths and component keys

- Every component path starts with `./`, resolves inside the plugin root, and exists. `..` is a traversal error. `skills` also accepts `"."` / `"./"`. `mcpServers` also accepts an `https://` bundle URL.
- `agents` entries are `.md` files; `skills` entries are directories.
- Replace the default folder: `commands`, `agents`, `outputStyles`, `workflows`, `experimental.themes`, `experimental.monitors`.
- Add to the default: `skills`.
- Merge: `hooks`, `mcpServers`, `lspServers`.
- `hooks/hooks.json` wraps hooks in a top-level `"hooks"` key.

## `userConfig`

Per field: required `type` (`string | number | boolean | directory | file`), `title`, `description`. Optional `required`, `default`, `options` (string picker, 1 to 64 chars each; needs Claude Code >= 2.1.271), `multiple`, `sensitive`, `min`, `max`.

- Keys are identifiers: letters, digits, `_`; no leading digit.
- Non-sensitive values are stored under `pluginConfigs` in `settings.json`. Sensitive values go to the OS secure store.
- Reference as `${user_config.KEY}` in MCP config, LSP config, exec-form hook args, and skill/agent content (sensitive values appear as placeholders in skills and agents). Hook processes also get env var `CLAUDE_PLUGIN_OPTION_<KEY>`.
- **Rejected** in shell-form hooks, monitor commands, and `headersHelper`. Use exec-form args or the env var.

## `lspServers` (Claude Code only)

Required: `command`, `extensionToLanguage`. Optional: `args`, `transport`, `env`, `initializationOptions`, `settings`, `workspaceFolder`, `startupTimeout`, `shutdownTimeout`, `requestTimeout` (>= 2.1.288), `restartOnCrash`, `maxRestarts`, `diagnostics`.

## `monitors` (`experimental.monitors` or `monitors/monitors.json`)

Required: `name`, `command`, `description`. Optional: `when` (`always` or `on-skill-invoke:<skill>`). The command cannot use `${user_config.*}`.

## Writing good skills in a plugin

- Folder name equals `name` in `SKILL.md` frontmatter; `description` says **what it does and when to use it**; keep the body short and push detail to `references/` files linked from `SKILL.md`.
- Skills are namespaced `plugin:skill` when invoked.
