# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Ranked FTS search (`bm25`) with snippets, and SQL-side `--type` / `--status` / `--tag` / `--kind` filters so a typed query cannot be crowded out by untyped matches.
- `mental list` includes each concept's `description`; `--kind` filters attention on list and search.
- `mental show` returns `backlinks` from the derived link index (file-scan fallback).
- MCP `list` tool; search accepts the same typed filters as the CLI; tool results are compact JSON.

### Changed

- README now shows the logo, explains the [Agent Plugins 1.0.0](https://agent-plugins.org/specification) packaging, and includes copy-paste install prompts for Cursor, Claude Code, VS Code, and GitHub Copilot.

## [0.1.0] - 2026-08-26

First public release of `@mental/cli`.

### Added

- Standalone Mental CLI: on a TTY, no args prints a one-shot heartbeat and exits; named commands are one-shot; agents use `--json`.
- UUID identity in `~/.mental/bindings.json`, with `remap` / `split` / `link` and `local --import` / `--move`.
- Attention residue (`mental attention`) and `journal --against` so heartbeat carries what is still in the air.
- Agent Plugins 1.0.0 package: root `plugin.json`, skill at `skills/mental/`, MCP at `mcp.json` (stdio `./bin/cli.mjs serve`).
- Cursor / Claude Code shims: `.cursor-plugin/plugin.json` (SVG logo) and `.claude-plugin/plugin.json` (`displayName: Mental`).
- `install --mcp` registers `serve`; `decide` updates by title so an open decision can close.
- Install, doctor, uninstall; hooks stay off by default.

[Unreleased]: https://github.com/afaraha8403/mental/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/afaraha8403/mental/releases/tag/v0.1.0
