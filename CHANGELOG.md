# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Features

- `mental decide` create requires `--body` (the why). Same `--title` without `--body` still updates. Decision files are title plus body — no Context/Options/Outcome placeholders.
- Search JSON includes `tokens` and `op` (`and` or `or`). Space-separated words are AND prefixes unless `--any`. MCP `q` may be a string array (union of queries). Quotes are not a phrase operator.
- Journal hops (`## HH:MM — title`) index as their own search rows (`journal/YYYY-MM-DD.md#HH:MM`). `mental show` that path returns the section. `list` stays one file per day.
- Search ranks Decision, then Note, then Attention, then Journal.

### Fixes

- Attention create no longer writes `<why this would cost a reload if forgotten>` into the file. Title-only residue is allowed.

### Changes

- Skill and always-on rule: before proposing a flag, crate, or approach, search that name; rejected approaches are Decisions with a searchable title. Journal is not the graveyard of failed ideas.
- Agent install paste names `skills/mental-setup` vs `skill/mental`, fail-open, and no plugin MCP. README and install-doc pastes stay identical.

## [0.7.0] - 2026-08-28

### Features

- Plugin skill is a CLI bootstrap (`skills/mental-setup/`). The full procedure lives in `skill/mental/` and is copied by `mental install`.

### Changes

- Native plugin no longer auto-starts clone MCP from `mcp.json` / `.mcp.json`. Use `mental install --mcp` for PATH `mental serve`. Breaking for plugin-only MCP users.

## [0.6.0] - 2026-08-28

### Features

- Single command catalog drives grouped help, `mental schema --json`, shell completions, and MCP `inputSchema`. Groups: Daily, Lookup, Write, Identity, Setup.
- Progressive help: `mental -h` is Daily (one screen); `mental --help` is all commands grouped; `mental <cmd> --help` and `mental help <cmd>` show that command with examples first, required vs optional, and enums.
- `mental schema --json` dumps the catalog (no auth, no network). `mental schema <cmd> --json` is one command.
- `mental completion bash|zsh|fish` prints a completion script from the catalog (does not write shell rc files).
- `mental --json` with no command is a heartbeat (exit 0). Non-TTY no-args without `--json` still prints help and exits 2.
- Unknown flags fail (exit 2, `unknown-flag`) instead of becoming silent booleans. Hint lists legal flags for that command.
- POSIX `--` ends option parsing (`mental search -- -label` is a query, not a flag).
- JSON errors include `error.hint` (copy-paste next argv). Usage failures exit 2. Human errors go to stderr; `--json` stays on stdout.
- `doctor --json` sets `ok: false` when process exit is 3 (error-level problems). Warn-only stays `ok: true`.
- `list` / `search` JSON include `truncated` and `total` (default cap 50).
- Heartbeat JSON includes `id` and `mode` so agents can skip a `where` round-trip.
- `mental heartbeat --json --fields resume,attention` masks keys. `--fields` with no value lists legal names.
- `--plain` / `--no-color`, plus `NO_COLOR` (any non-empty) and `TERM=dumb`: no emoji, no ANSI. `MENTAL_ASCII` still strips emoji only.
- TTY heartbeat footer: `more · mental doctor · mental search · mental --help`.
- TTY-only “did you mean” for unknown commands. Never auto-run. `--json` hard-fails with `unknown-command` and a Daily hint.

### Fixes

- `journal` requires `--resume` (no silent “Continue” default). Aligns with park/handoff and the skill.

### Changed

- Agent install paste tells the host to use only this client's plugin flow (do not run other hosts' `/plugin` / `copilot plugin` / Command Palette steps).
- Human install docs match Cursor Customize / local symlink, Claude slash vs CLI, and Copilot shell. No GitHub URL `/add-plugin`.
- Skill points agents at `--help` / `schema` instead of inlining a flag table (`skills/mental/references/cli.md`). Procedure stays in SKILL.md.
- MCP `inputSchema` is generated from the catalog for the existing session subset (identity and setup stay CLI). Journal MCP accepts `against`. Closed enums for `kind` / `status` where the CLI already has them.

## [0.5.1] - 2026-08-28

### Changed

- Release workflow publishes with `secrets.NPM_TOKEN` (`NODE_AUTH_TOKEN`) and `setup-node` `registry-url`. `workflow_dispatch` can republish HEAD when git tag `v$(package.json version)` already exists. Agent rule: a release is not done until that npm version equals the tag.
- Agent install paste no longer includes in-repo release lockstep. After doctor, agents ask about optional hooks and time tracking, and whether MCP is needed, with a one-liner for each. Still wait for yes this turn.

## [0.5.0] - 2026-08-28

### Added

- Optional time tracking as an isolated, default-off add-on. Hours live in bundle `time.sqlite` (never git, never the FTS cache). Durations are **wall** (sum of in-session elapsed) and **user** (human time inside that wall), rendered as `h:mm`. `mental option` flags track (per UUID), MCP, and hooks in `~/.mental/config.json`. `mental track` start/stop/focus/discard/report/export. Heartbeat `--json` may include a compact `data.track` sibling (ids only, no titles or hours); TTY heartbeat and pulse stay freeze without a timesheet. Park/handoff stop the focused interval only. The track skill lives in `optional/mental-track/` (not plugin `skills/`). Install and doctor return `optionals[]` with `needsConsent: true`. Agents must not enable a feature unless the user named it this turn.
- Product version lockstep: `package.json` is source of truth. Portable `plugin.json`, Cursor/Claude shims, the lockfile, and skill `metadata.version` must match. `node scripts/bump-version.mjs <semver>` writes them; `--check` (and `release.yml`) refuse drift. Marketplace plugin entries still omit `version` (Claude uses `plugin.json`).
- `mental doctor` warns when a Claude Code or Copilot plugin, or a copied skill, is behind this CLI. Probes `claude plugin list --json` / `copilot plugin list --json` (fail open if missing). Does not write host plugin caches. `MENTAL_SKIP_HOST_PLUGIN_CHECK=1` skips.

### Changed

- Skill `metadata.version` now tracks the product version (was `1.0.0`). Native plugin install is documented as a second channel: `mental install` refreshes CLI + skill copies, not the host plugin UI.

## [0.4.1] - 2026-08-27

### Added

- Every `--json` envelope may include an `update` sibling (`current`, `latest`, `hint`) when npm is ahead of this CLI. Agents tell the user once and suggest `mental install`. TTY prints the same hint. Backed by a 7-day cache under `${XDG_CACHE_HOME:-~/.cache}/mental/npm-latest.json` so ordinary commands never `npm view`; `MENTAL_SKIP_UPDATE_CHECK=1` still skips. `doctor` / `install` still check live.

### Fixed

- GitHub Release workflow no longer sets `setup-node` `registry-url`. That wrote a dummy `NODE_AUTH_TOKEN` and made npm skip OIDC trusted publishing (E404), so `0.3.1` and `0.4.0` never landed on the registry.

## [0.4.0] - 2026-08-27

### Added

- Attention kind `verify` — “agent produced this, human has not looked.” Heartbeat lists it first under **Needs eyes**. Cap still 7. Not a review queue.
- `Hops` on the TTY pulse = parks today (`hopsToday`). `delta.parks` stays since-last-pulse. Makes stealth switching visible without analytics.
- **Settled** on heartbeat: newest decided titles (cap 7, no bodies) so the next agent does not re-litigate.
- `--via <token>` on journal / park / handoff / attention / decide — short client token (`cursor`, `claude-code`, `copilot`, `codex`, `mcp`, `cli`). Rejects emails, URLs, paths, and session ids.

### Changed

- Ship a 256×256 PNG mark (`assets/logo.png`, ~29KB) instead of the 262KB traced SVG. README and Cursor plugin point at the PNG; the SVG is not in the package.
- README “Why this exists” and [docs/research.md](docs/research.md) now cite 2024–2026 agent-era studies (verification load, supervisory engineering, stealth context switching, the productivity–experience paradox) instead of 1998–2011 interruption papers as the primary proof. The ready-to-resume mechanism still maps to `park` / `handoff`.

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

[Unreleased]: https://github.com/afaraha8403/mental/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/afaraha8403/mental/releases/tag/v0.6.0
[0.5.1]: https://github.com/afaraha8403/mental/releases/tag/v0.5.1
[0.5.0]: https://github.com/afaraha8403/mental/releases/tag/v0.5.0
[0.4.1]: https://github.com/afaraha8403/mental/releases/tag/v0.4.1
[0.4.0]: https://github.com/afaraha8403/mental/releases/tag/v0.4.0
[0.3.1]: https://github.com/afaraha8403/mental/releases/tag/v0.3.1
[0.3.0]: https://github.com/afaraha8403/mental/releases/tag/v0.3.0
[0.2.3]: https://github.com/afaraha8403/mental/releases/tag/v0.2.3
[0.2.2]: https://github.com/afaraha8403/mental/releases/tag/v0.2.2
[0.2.1]: https://github.com/afaraha8403/mental/releases/tag/v0.2.1
[0.2.0]: https://github.com/afaraha8403/mental/releases/tag/v0.2.0
[0.1.0]: https://github.com/afaraha8403/mental/releases/tag/v0.1.0
