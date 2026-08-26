# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.3] - 2026-08-26

### Added

- `mental doctor` checks npm for a newer `@balacode/mental` (warn only; fail open). `mental install` from a published install upgrades the global CLI when npm is ahead, then re-runs so skills match. `MENTAL_SKIP_UPDATE_CHECK=1` skips the network. Heartbeat never checks.

### Changed

- Agent Mental receipt wraps with a separator line (`────────`) instead of `</br>`, which printed as literal tags in Claude Code and other agents.

### Fixed

- `mental install` / `npm i -g` overwrites an existing global `mental` bin (npm 11 EEXIST). Leftover `@mental/cli` links no longer block `@balacode/mental`.

## [0.2.2] - 2026-08-26

### Added

- `mental install` finds leftover **Balakit** Mental skill/rule copies (fingerprint: `npx balakit doctor`, `mentalDataPolicy`, …) and deletes them before writing the standalone skill. Mental-only `<!-- BEGIN balakit -->` blocks are stripped. Journals and `./.mental` data are not deleted. `mental doctor` warns if any remain.

## [0.2.1] - 2026-08-26

### Changed

- Agent Mental receipt wraps with `</br>`, uses a markdown hard break after `🧠 Mental`, and prints indented `Kind: Verb` lines so Cursor chat does not collapse the block onto one line.

## [0.2.0] - 2026-08-26

### Added

- Ranked FTS search (`bm25`) with snippets, and SQL-side `--type` / `--status` / `--tag` / `--kind` filters so a typed query cannot be crowded out by untyped matches.
- `mental list` includes each concept's `description`; `--kind` filters attention on list and search.
- `mental show` returns `backlinks` from the derived link index (file-scan fallback).
- MCP `list` tool; search accepts the same typed filters as the CLI; tool results are compact JSON.
- Agent **Mental receipt** at the end of a turn that used the CLI: `<br>`, title `🧠 Mental`, then type lines (📓 journal, 🚦 attention, 🎯 decision, 📝 note, 🔍 read). Example in the skill; the always-on rule points at it. TTY writes use the same type emojis. `--json` stays ASCII (`MENTAL_ASCII=1` strips emoji).
- `mental install` copies the skill to `~/.config/opencode/skills/mental` (OpenCode).

### Changed

- README now shows the logo, npm (`@balacode/mental`), [Agent Plugins 1.0.0](https://agent-plugins.org/specification) packaging, and copy-paste install prompts for Cursor, Claude Code, VS Code, and GitHub Copilot.
- npm package is `@balacode/mental` (unscoped `mental` is taken). The CLI bin stays `mental`.

## [0.1.0] - 2026-08-26

First public release of the Mental CLI.

### Added

- Standalone Mental CLI: on a TTY, no args prints a one-shot heartbeat and exits; named commands are one-shot; agents use `--json`.
- UUID identity in `~/.mental/bindings.json`, with `remap` / `split` / `link` and `local --import` / `--move`.
- Attention residue (`mental attention`) and `journal --against` so heartbeat carries what is still in the air.
- Agent Plugins 1.0.0 package: root `plugin.json`, skill at `skills/mental/`, MCP at `mcp.json` (stdio `./bin/cli.mjs serve`).
- Cursor / Claude Code shims: `.cursor-plugin/plugin.json` (SVG logo) and `.claude-plugin/plugin.json` (`displayName: Mental`).
- `install --mcp` registers `serve`; `decide` updates by title so an open decision can close.
- Install, doctor, uninstall; hooks stay off by default.

[Unreleased]: https://github.com/afaraha8403/mental/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/afaraha8403/mental/releases/tag/v0.2.3
[0.2.2]: https://github.com/afaraha8403/mental/releases/tag/v0.2.2
[0.2.1]: https://github.com/afaraha8403/mental/releases/tag/v0.2.1
[0.2.0]: https://github.com/afaraha8403/mental/releases/tag/v0.2.0
[0.1.0]: https://github.com/afaraha8403/mental/releases/tag/v0.1.0
