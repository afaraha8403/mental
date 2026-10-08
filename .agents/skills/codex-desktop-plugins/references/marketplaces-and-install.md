# Marketplaces and installing

Source: `https://developers.openai.com/plugins/build/plugins.md` and `https://learn.chatgpt.com/docs/` (plugins pages).

## Marketplace files

| Scope | File | Plugins live under |
| --- | --- | --- |
| Repo | `$REPO/.agents/plugins/marketplace.json` | `./plugins/` |
| Personal | `~/.agents/plugins/marketplace.json` | `~/.codex/plugins/` |

`.claude-plugin/marketplace.json` is also accepted.

```json
{
  "name": "acme-marketplace",
  "interface": { "displayName": "Acme Plugins" },
  "plugins": [
    {
      "name": "acme-notes",
      "source": { "source": "local", "path": "./plugins/acme-notes" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

Each entry requires `name`, `source`, `policy` and `category`.

### `source` kinds

- `{ "source": "local", "path": "./..." }` (or a plain string path). Path is relative to the marketplace root, starts with `./` and stays inside it.
- `url`
- `git-subdir`: `url`, `path`, `ref` or `sha`
- `npm`: `package`, `version`, `registry`. Installed without lifecycle scripts.

### `policy`

- `installation`: `AVAILABLE`, `INSTALLED_BY_DEFAULT`, `NOT_AVAILABLE`
- `authentication`: `ON_INSTALL`, or on first use

## Installing

1. Put the plugin in the marketplace location and add the entry.
2. **Restart the desktop app.**
3. Install from the plugins UI. The app copies it to `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` (version `local` for local plugins) and runs from that cache. Edit the source, not the cache; reinstall to refresh.

## CLI

```text
codex plugin marketplace add <source> [--ref <ref>] [--sparse <path>]
codex plugin marketplace list
codex plugin marketplace upgrade
codex plugin marketplace remove <name>
```

## Repo-level toggles: `.codex/config.toml`

```toml
[plugins."acme-notes@acme-marketplace"]
enabled = true

[plugins."acme-notes@acme-marketplace".mcp_servers.acme-notes]
enabled = true
default_tools_approval_mode = "prompt"
enabled_tools = ["search_notes"]
```

Applies only in trusted projects. Per-tool overrides use `approval_mode`. Verify exact value spellings in the docs.

## Workspace sharing (not the public directory)

An admin opens `https://chatgpt.com/plugins`, then Personal, then **Publish**, and picks roles. The admin gate is `features.plugin_sharing = false` in `requirements.toml`.

## Local MCP plugin test flow

`https://chatgpt.com/plugins` -> plus -> **Add custom MCP server** -> **Create as a plugin** -> copy the `plugin_asdk_app...` ID -> ask `@plugin-creator` to use it and add a personal marketplace entry.
