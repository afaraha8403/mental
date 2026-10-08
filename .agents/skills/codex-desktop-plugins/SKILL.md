---
name: codex-desktop-plugins
description: >-
  Package, install, test, share and submit plugins for the ChatGPT desktop app
  (formerly the Codex app): the portable plugin.json or .codex-plugin layout,
  extensions.com.openai settings, bundled skills and MCP servers, hooks,
  marketplace.json, install cache paths, .codex/config.toml, workspace publish
  and public directory submission. Use when the user wants to create, ship or
  debug a ChatGPT or Codex desktop plugin and needs its requirements.
license: MIT
compatibility: Needs a ChatGPT desktop app with plugins enabled (macOS or native Windows). Optional Codex CLI for codex plugin marketplace commands. Public submission needs a platform.openai.com organization with verified developer identity.
metadata:
  author: Ali Farahat
  tags: chatgpt-desktop,codex,plugins,marketplace,submission
  verified-against: developers.openai.com/plugins/build/plugins and deploy/submission
when_to_use: |
  USE WHEN:
  - The user wants to create, package, install, share or submit a ChatGPT /
    Codex desktop plugin, or asks what a plugin needs (manifest, skills, MCP,
    marketplace, review test cases).
  - They mention plugin.json, .codex-plugin, .agents/plugins/marketplace.json,
    @plugin-creator, "Add custom MCP server", or plugin submission.

  DO NOT USE WHEN:
  - The task is the UI inside the plugin (entrypoints, MCP Apps): use
    codex-desktop-extensions.
  - The task is writing a SKILL.md: use codex-desktop-skills.
  - The user wants Claude Desktop plugins: use claude-desktop-plugins.
---

# ChatGPT / Codex desktop plugins

A plugin bundles **skills**, optionally an **MCP server** (tools, plus UI via `codex-desktop-extensions`), and listing metadata. Sources (re-check; they change): `https://developers.openai.com/plugins/build/plugins.md`, `.../deploy/submission.md`, `.../plugin-guidelines`, index `https://developers.openai.com/llms.txt`. The ChatGPT/Codex docs live at `https://learn.chatgpt.com/docs/`.

## Requirements

1. A manifest at the plugin root, in one of two accepted formats (below).
2. Every path in the manifest starts with `./`, is relative to the plugin root and stays inside it.
3. Skills in `skills/<name>/SKILL.md` (auto-discovered), each with `name` and `description`.
4. If it has tools: an MCP config declaring one or more servers.
5. Listing metadata (`interface`): name, descriptions, developer, category, icons.
6. For public submission: `review` test cases (5 positive, 3 negative), a walkthrough video URL, release notes, privacy and terms URLs, a public HTTPS MCP server and a verified domain.

## Layouts

**Portable Agent Plugins format** (preferred for new work): root `plugin.json` with `$schema`, OpenAI-specific settings under `extensions.com.openai`, `skills/`, `mcp.json`.

**Codex compat format** (still supported; what `@plugin-creator` scaffolds): `.codex-plugin/plugin.json` with `skills`, `mcpServers` and a root `interface` block, plus `.mcp.json` (no `$schema`, no `type`). Onboarding, review and publication stay under `extensions.com.openai`. When `extensions.com.openai` is an object it **fully replaces** the `.codex-plugin` overlay; the two are not merged.

Claude-style manifests and `.claude-plugin/marketplace.json` are accepted too. Field tables and examples: [references/manifest.md](references/manifest.md).

```text
acme-notes/
  plugin.json
  mcp.json
  assets/        icons, logo, screenshots
  skills/<name>/SKILL.md
```

## Workflow

1. **Scaffold** with `@plugin-creator` (Work mode) or `$plugin-creator` (Codex), or by hand from [references/manifest.md](references/manifest.md). Use a stable kebab-case `name`; it is the identity.
2. **Add skills** (`codex-desktop-skills`) and, if needed, the MCP server and UI (`codex-desktop-extensions`).
3. **Add a marketplace entry** to install locally: [references/marketplaces-and-install.md](references/marketplaces-and-install.md).
4. **Restart the desktop app.** It loads from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`.
5. **Test** skills with direct, indirect and negative prompts; test MCP tools and UI entrypoints.
6. **Share**: repo marketplace for a team, workspace publish for an organization, or public submission: [references/submission.md](references/submission.md).
7. **Bump `version`** for every release; changed packages need a new ZIP when submitted.

## Hooks

`hooks/hooks.json` is discovered by default; an explicit manifest `hooks` value replaces default discovery. Env vars: `PLUGIN_ROOT`, `PLUGIN_DATA` (and `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`). Hooks apply only to manually installed desktop plugins and are skipped until the user reviews and trusts them. **A plugin with hooks cannot be submitted to the public directory**; remove them before submission. Docs: `https://learn.chatgpt.com/docs/hooks`.

## Safety

- Never put secrets, tokens or credentials in the plugin folder or ZIP. Use per-user auth (`policy.authentication`) and server-side secrets.
- Hooks execute shell commands; keep them minimal, document them and never run them silently.
- Keep marketplace `source.path` inside the marketplace root; never point it at `..` or absolute paths.
- Do not ask reviewers to run private-network or MFA-gated setups; supply credentials without MFA.
- MCP tool approval: set conservative `default_tools_approval_mode` and per-tool `approval_mode` for destructive tools.
- Do not tag, publish or submit on the user's behalf without explicit confirmation.

## Verification checklist

- [ ] Manifest parses as JSON; all paths begin with `./` and resolve inside the plugin
- [ ] `name` is stable kebab-case; `version` bumped
- [ ] Each skill has `name` and a trigger-rich `description`
- [ ] `extensions.com.openai` chosen deliberately (it replaces the `.codex-plugin` overlay)
- [ ] MCP config valid; at most one remote MCP server if submitting
- [ ] No hooks and no `apps`/`.app.json` references if submitting to the public directory
- [ ] Marketplace entry has `name`, `source`, `policy`, `category`
- [ ] Reinstalled and app restarted after changes
- [ ] 5 positive and 3 negative review cases, video, release notes (submission)
- [ ] No secrets anywhere in the package

## Anti-patterns

- Editing the cache directory instead of the source plugin.
- Mixing `.codex-plugin/plugin.json` overlay fields with `extensions.com.openai` and expecting a merge.
- Absolute paths or `../` in manifest or marketplace paths.
- Shipping hooks and then submitting to the public directory.
- Adding an MCP server to an already published skills-only plugin (unsupported; changing the server URL needs support).
- Vague skill descriptions, so skills never trigger.
- Changing `name` between versions (breaks identity and installs).

## Pointers

| Need | Read |
| --- | --- |
| Manifest fields, examples, MCP config | [references/manifest.md](references/manifest.md) |
| Marketplaces, install cache, config.toml, CLI | [references/marketplaces-and-install.md](references/marketplaces-and-install.md) |
| Workspace publish, public submission, review | [references/submission.md](references/submission.md) |
| UI entrypoints and MCP Apps | `codex-desktop-extensions` |
| SKILL.md authoring | `codex-desktop-skills` |
