# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-08-27

### Changed

- New Mental mark (`assets/logo.svg`) on the README and Cursor plugin. Editor chrome stripped; portable `plugin.json` still has no `logo` field (schema is closed).

## [0.3.0] - 2026-08-27

### Added

- `mental park --resume` — encode continuity at an interruption (default journal title `"Parked"`), optional attention in the same call, then heartbeat. For mid-hop context switches, not only planned closes.
- `mental handoff --title --resume` — planned task-boundary sugar: journal then heartbeat in one shot.
- `mental pulse` — compact cross-project rows from `bindings.json` (resume + residue/decision counts, no journal bodies) for multi-repo orchestration.
- Since-last-pulse delta counts on heartbeat / pulse / park / handoff (`${XDG_CACHE_HOME:-~/.cache}/mental/<uuid>.pulse.json`). Heartbeat stays read-only for the watermark; writers refresh it after computing the delta.
- Open-decision budget mirrors attention (cap 7 on heartbeat TTY and JSON; `attentionCount` / `openDecisionCount`; doctor warns when over).
- Doctor warns (exit still 0 if only warns) for attention and decisions left open/later/deferred longer than 14 days (`--days` override).
- First-class README: landing-page promise, measured numbers, and a docs hub (`docs/why.md`, `install.md`, `cli.md`, `agents.md`, `identity.md`, `benchmarks.md`, `research.md`).
- README research section + [docs/research.md](docs/research.md): Parnin/Rugaber resumption lag, Leroy attention residue, Mark interrupted-work stress — mapped to heartbeat, `Resume:`, and attention.
- Reproducible micro-benchmarks via `npm run bench` (`scripts/bench.mjs`) — CLI vs in-process heartbeat and search at 100 / 500 / 2,000 notes.

### Changed

- Agent Mental receipt is a markdown bullet list: `🧠 **Mental**` then `- emoji **Kind** › *action* › title`. No `────────` wrapper. Actions (italic, lowercase): Journal/Note `recorded`; Attention `recorded`/`resolved`; Decision `opened`/`decided`; Read `heartbeat`/`pulse`/`searched`/`showed`/`listed`.
- README is a landing page. Depth (install edge cases, full command table, Agent Plugins, remap) lives in `docs/`.
- SQLite index still writes `concepts` + `links` when Node’s `node:sqlite` has no FTS5 module. Search uses LIKE with title-first ranking; FTS5 + bm25 remains the path when the module exists. `INDEX_VERSION` is 3 so older caches rebuild.
- Discovery metadata for AI-tooling developers: npm `keywords` + author, plugin/marketplace keywords, skill tags (`coding-agents`, `mcp`, `cursor`, `claude-code`, …), and a README subtitle / works-with row (Cursor, Claude Code, Copilot, MCP, Agent Skills).
- README **Who writes** — agents journal / decide / record residue after `mental install`; humans are not expected to keep the log by hand. Same CLI if you want the pulse yourself. Not a hidden hook; not every chat turn.
- README rebuilt on the award-style 3-tier layout used by uv / Aider / Goose / Mem0: pitch + demo + quick start above the fold; highlights; who-writes table; research as proof not a lecture; FAQ for agents and humans; depth stays in `docs/`.

### Fixed

- `mental park --attention` upserts by title like `mental attention` (same-day retry no longer crashes after the journal write).
- `mental pulse` reads opted-in `./.mental` for `store=local` bindings instead of a stale home slice.
- Heartbeat decision cap keeps the newest open/deferred decisions (same newest-first order as attention).
- Pulse watermark writes fail open so an unwritable cache cannot fail park/handoff after a successful journal.

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

[Unreleased]: https://github.com/afaraha8403/mental/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/afaraha8403/mental/releases/tag/v0.3.1
[0.3.0]: https://github.com/afaraha8403/mental/releases/tag/v0.3.0
[0.2.3]: https://github.com/afaraha8403/mental/releases/tag/v0.2.3
[0.2.2]: https://github.com/afaraha8403/mental/releases/tag/v0.2.2
[0.2.1]: https://github.com/afaraha8403/mental/releases/tag/v0.2.1
[0.2.0]: https://github.com/afaraha8403/mental/releases/tag/v0.2.0
[0.1.0]: https://github.com/afaraha8403/mental/releases/tag/v0.1.0
