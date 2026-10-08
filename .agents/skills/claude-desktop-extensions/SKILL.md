---
name: claude-desktop-extensions
description: >-
  Build, validate, pack, sign, and distribute Claude Desktop Extensions
  (.mcpb, formerly .dxt): a ZIP of a local MCP server plus manifest.json that
  users install with one click in Claude Desktop. Use when the user wants to
  package an MCP server for Claude Desktop, write an MCPB manifest.json, use
  the mcpb CLI, handle user_config or signing, or submit to the extension
  directory. Not for mods or plugins.
license: MIT
compatibility: Needs Node.js and the mcpb CLI (npm i -g @anthropic-ai/mcpb) to init, validate and pack; installs in Claude Desktop on macOS and Windows.
metadata:
  author: Ali Farahat
  tags: claude-desktop,mcpb,dxt,mcp,extensions
  verified-against: github.com/modelcontextprotocol/mcpb (manifest spec 0.3)
when_to_use: |
  USE WHEN:
  - The user wants a local MCP server one-click installable in Claude Desktop,
    mentions ".mcpb", ".dxt", "Desktop Extension", "mcpb pack", or manifest.json
    for an extension.
  - They need per-user settings or secrets collected by Claude Desktop
    (user_config), signing, enterprise rollout, or directory submission.

  DO NOT USE WHEN:
  - They want to change Claude Code's UI/behavior with JS: use
    claude-desktop-mods.
  - They want to bundle skills/commands/agents/hooks as a plugin: use
    claude-desktop-plugins (a plugin can also reference a .mcpb via mcpServers).
  - A remote MCP server (fixed URL) suffices: it needs no .mcpb, just a
    connector or plugin MCP config.
---

# Claude Desktop Extensions (MCPB)

An **MCPB** (`.mcpb`, formerly `.dxt`; `.dxt` still works, `.mcpb` preferred) is a **ZIP** containing a local MCP server and a `manifest.json`. `manifest.json` is the only required file. Claude Desktop ships Node.js, so users need no runtime setup for `node` servers. Spec and CLI: `https://github.com/modelcontextprotocol/mcpb` (`MANIFEST.md`, `CLI.md`). Manifest spec is `0.3`; the `uv` type is shown under `"manifest_version": "0.4"`. **Check the repo's `MANIFEST.md` for the current version before writing.**

## Workflow

1. **Confirm the fit**: a *local* server the user runs on their machine. For a hosted server, don't package.
2. **Scaffold**: `mcpb init` in the server folder (interactive), or hand-write `manifest.json` from [references/manifest.md](references/manifest.md).
3. **Pick the server type**: `node` (bundle `node_modules`), `python` (bundle deps in `server/lib` or `server/venv`), `binary` (compiled; `.exe` appended on Windows; use `platform_overrides`), or `uv` (needs `pyproject.toml`; **must not** include `server/lib` or `server/venv`).
4. **Declare tools** in `tools[]` (and `prompts[]` if any) so Claude Desktop can show them before launch. Use `tools_generated: true` when the list is dynamic.
5. **Config, not constants**: put keys, paths, and options in `user_config` and reference as `${user_config.KEY}` in `server.mcp_config`. Mark secrets `sensitive: true` (stored in the OS keychain). Claude Desktop will not enable the extension until required values are set.
6. **Validate**: `mcpb validate manifest.json`.
7. **Pack**: `mcpb pack <dir> [out.mcpb]` (validates, excludes dev files; add a `.mcpbignore` for more). Check the result with `mcpb info out.mcpb`.
8. **Test on real installs**: drag the `.mcpb` into Claude Desktop **Settings -> Extensions** (or double-click it). Test on **Windows and macOS** if both are in `compatibility.platforms`.
9. **Sign for distribution**: `mcpb sign` (PKCS#7). `--self-signed` is for development only; production needs a code-signing certificate. Verify with `mcpb verify`.
10. **Distribute**: share the file, host it, submit to Anthropic's extension directory (form; test both OSes first), or roll out to a fleet with GPO/MDM, preinstall, blocklists and private directories.

## Manifest essentials

Required: `manifest_version`, `name`, `version` (semver), `description`, `author { name, email?, url? }`, `server`.

Recommended: `display_name`, `long_description`, `icon`/`icons`, `screenshots`, `repository`, `homepage`, `documentation`, `support`, `keywords`, `license`, `compatibility`, and `privacy_policies[]` (**required when the server connects to external services handling user data**).

`server`: `type`, `entry_point`, `mcp_config { command, args, env, platform_overrides }`.

Variables available in `mcp_config`: `${__dirname}`, `${HOME}`, `${DESKTOP}`, `${DOCUMENTS}`, `${DOWNLOADS}`, `${pathSeparator}` (or `${/}`), `${user_config.KEY}`.

Complete field tables and a working example: [references/manifest.md](references/manifest.md). CLI, signing and distribution: [references/cli-and-distribution.md](references/cli-and-distribution.md).

## Security rules

- Extensions run local code with the user's file and network access. Request the minimum; document what it reads and sends.
- **Never** hardcode credentials, bake secrets into the bundle, or log them. Use `user_config` + `sensitive: true`.
- Validate and sanitize every tool argument; no shelling out with unescaped input; constrain file access to the declared `directory`/`file` config.
- Provide a privacy policy URL if user data leaves the machine.
- Sign production builds; do not ship self-signed to others.
- Pin dependencies; bundle only what runs (`.mcpbignore` out tests, docs, caches).

## Verification checklist

- [ ] `mcpb validate` passes and `mcpb pack` produced a `.mcpb`
- [ ] `mcpb info` shows the expected name, version, and size
- [ ] `server.type` matches what is bundled (and `uv` has no `server/lib`/`server/venv`)
- [ ] All secrets come from `user_config` with `sensitive: true`; none in the zip
- [ ] `compatibility` (`claude_desktop` range, `platforms`, `runtimes`) is accurate
- [ ] Installed in Claude Desktop (Settings -> Extensions) and tools actually appear and run
- [ ] Windows and macOS tested if both are declared
- [ ] `privacy_policies` present when external services are used
- [ ] Production build signed with a real certificate

## Anti-patterns

- Wrong `manifest_version` for the features used.
- Using absolute or machine-specific paths instead of `${__dirname}` / user variables.
- Relying on a global `node`/`python` install instead of the declared type and bundled deps.
- Bundling the entire repo (tests, `.git`, `node_modules` dev deps).
- Treating `--self-signed` as production.
- Packaging a hosted/remote server as a `.mcpb`.
- Guessing manifest fields instead of reading `MANIFEST.md` for your version.

## Pointers

| Need | Read |
| --- | --- |
| manifest.json fields and example | [references/manifest.md](references/manifest.md) |
| mcpb CLI, signing, directory, enterprise | [references/cli-and-distribution.md](references/cli-and-distribution.md) |
| Bundling the `.mcpb` inside a plugin (`mcpServers`) | `claude-desktop-plugins` |
