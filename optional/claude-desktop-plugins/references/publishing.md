# Publishing and distributing a plugin

Source: `https://code.claude.com/docs/en/plugins/publish`, `https://claude.com/docs/plugins/platform-support`.

## Pick a route

| Route | What you do | Notes |
| --- | --- | --- |
| **No marketplace** | Share the folder or a zip | Users load with `--plugin-dir` / `--plugin-url`, or Desktop Add -> **Upload plugin** (zip) |
| **Your own marketplace** | Add `.claude-plugin/marketplace.json` to a git repo | No submission form. Up to 25 self-added marketplaces per account |
| **Anthropic directory** | Submit in the developer portal at `claude.ai/directory/manage` | Needs a paid claude.ai plan. The portal applies extra rules the CLI does not check. Use the pre-submission checklist on claude.com. `claude-plugins-official` takes no portal submissions |

## Pre-release checklist

1. **Name**: permanent kebab-case; set `displayName` for the label.
2. **Version**: bump `version` each release, or omit it (git-hosted marketplace) so the commit SHA is used.
3. **Validate**: `claude plugin validate --strict ./plugin` (exit 1 on warnings; drop `--strict` when `version` is omitted).
4. **Local install test**: `claude plugin marketplace add ./path` -> `claude plugin install name@marketplace` -> new session.
5. **Metadata**: `description`, `author`, `homepage` (URL), `repository`, README (and privacy policy URL if it talks to external services).
6. Optional: `claude plugin eval` (the `experimental.evals` dir; see `/docs/en/plugin-evals`).
7. Size: under 5,000 files and 200 MB; strip `node_modules`, `.git`, caches.

## `.claude-plugin/marketplace.json`

```json
{
  "name": "my-marketplace",
  "owner": { "name": "Your Name" },
  "plugins": [
    { "name": "my-plugin", "source": "./plugins/my-plugin", "description": "What it does." }
  ]
}
```

A single-plugin repo can list itself with `"source": "./"` and the **same `name`** as its `plugin.json`. Never put `version` on marketplace plugin entries when `plugin.json` already carries it (set it in one place).

## How users install and update

```
claude plugin marketplace add owner/repo
claude plugin install my-plugin@my-marketplace
claude plugin update my-plugin@my-marketplace
```

In-session: `/plugin install my-plugin --marketplace owner/repo` (>= 2.1.275), then `/reload-plugins`. Auto-update is **off** by default for third-party marketplaces. Desktop users can also use Add -> Upload plugin.

## Pitfalls

- Same `version` after a change: users see "already at the latest version".
- Rename after release: it is a different plugin; existing installs do not migrate.
- Directory rejects what `validate` allows: re-read the portal's checklist.
- Admins can set a plugin Not available / Available / Installed by default / Required; plan for a "Required" rollout needing no user prompts (no required `userConfig` without defaults for Cowork MCP).
