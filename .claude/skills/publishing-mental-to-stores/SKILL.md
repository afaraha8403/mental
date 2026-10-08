---
name: publishing-mental-to-stores
description: >-
  Publish and update the Mental CLI (@balacode/mental) on every platform it
  supports: npm with version lockstep and the release.yml workflow, the Claude
  Code marketplace and Anthropic directory, the Cursor plugin and marketplace,
  the GitHub Copilot CLI marketplace, VS Code plugin install, Codex/ChatGPT
  plugins and OpenCode npm plugins, plus per-host update steps. Use when the
  user asks how to release, ship, list, submit or update Mental on a store or
  marketplace, or why a host still shows an old version.
license: MIT
compatibility: Needs git, Node 22.13+, the gh CLI for releases, and maintainer access to the afaraha8403/mental repo and the NPM_TOKEN secret. Store submissions need accounts on each platform.
metadata:
  author: Ali Farahat
  tags: release,npm,marketplace,claude-code,cursor,copilot,codex,opencode
  verified-against: .github/workflows/release.yml, docs/install.md, bin/lib/lockstep.mjs, code.claude.com/docs/en/plugins/publish, docs.github.com Copilot CLI plugin docs, cursor.com/docs/plugins
when_to_use: |
  USE WHEN:
  - The user asks to release, tag, publish, list on a marketplace, submit to a
    store, or update Mental on any host (npm, Claude, Cursor, Copilot, VS Code,
    Codex, OpenCode).
  - A host shows a stale Mental version after a release.

  DO NOT USE WHEN:
  - The task is building a desktop UI extension: use the matching
    *-desktop-* or cursor/opencode skill.
  - The user only wants to install Mental locally: see docs/install.md.
---

# Publishing Mental to every supported platform

Mental is one product shipped through several channels. **npm is the source channel**; every host plugin install reads the same Git repo. Never tag, publish, submit or open a PR unless the user explicitly asks for that in this turn, and confirm the version and branch first.

## Channel map

| Platform | Channel | Store submission? | Reference |
| --- | --- | --- | --- |
| npm | `@balacode/mental` via GitHub Release and `release.yml` | No (registry) | [references/npm-release.md](references/npm-release.md) |
| Claude Code | Own marketplace in this repo (`.claude-plugin/marketplace.json`) | Optional: Anthropic directory portal (paid plan) | [references/claude.md](references/claude.md) |
| Cursor | Plugin from the Git repo; `.cursor-plugin/plugin.json` | Optional: cursor.com/marketplace/publish (manual review, open source) | [references/cursor.md](references/cursor.md) |
| GitHub Copilot CLI | Same Git repo as a marketplace | **None exists**; push the repo | [references/copilot.md](references/copilot.md) |
| VS Code | Chat: Install Plugin From Source | No | [references/copilot.md](references/copilot.md) |
| Codex / ChatGPT | OpenAI plugin ZIP | Only with a remote MCP server; Mental is skills-only | [references/codex-opencode.md](references/codex-opencode.md) |
| OpenCode | npm plugin | No official process; Mental has no plugin | [references/codex-opencode.md](references/codex-opencode.md) |

## Version lockstep (the invariant)

`package.json` `version` is the source of truth. The git tag is `v` plus that string. npm must publish that same string. `node scripts/bump-version.mjs X.Y.Z` writes it to `plugin.json`, `.cursor-plugin/plugin.json`, `.claude-plugin/plugin.json`, the lockfile and skill metadata; `--check` fails on drift. Never put `version` on a `marketplace.json` plugin entry.

## Release workflow (summary)

1. Work on `main` for production, `staging` for beta (`X.Y.Z-beta.N`).
2. `node scripts/bump-version.mjs X.Y.Z`, then `node scripts/bump-version.mjs --check`.
3. Cut CHANGELOG `[Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`; commit.
4. After the user confirms: create a GitHub Release tagged exactly `vX.Y.Z` (mark betas as prerelease).
5. `release.yml` runs tests on three OSes, checks tag and lockstep, skips if already on npm, then publishes (`--tag beta` for prereleases).
6. Verify: `npm view @balacode/mental version` equals `package.json`. Not done until it does.
7. If publish failed or was skipped: fix the workflow and run `workflow_dispatch` against the existing tag. **Never cut a new tag to fix npm.**

Full commands, failure modes and the post-release host refresh: [references/npm-release.md](references/npm-release.md) and [references/after-release.md](references/after-release.md).

## Safety

- Confirm with the user before any tag, GitHub Release, `npm publish`, store submission or PR. Say which version and which channel.
- Never print, log or commit `NPM_TOKEN` or any credential. Do not read the secret; the workflow uses `secrets.NPM_TOKEN` as `NODE_AUTH_TOKEN`.
- Never use `MENTAL_SKIP_HOST_PLUGIN_CHECK` outside tests.
- Never ship a tag that differs from `package.json`.
- Repo-only skills under `.agents`, `.claude`, `.cursor` and `.codex` must stay out of the npm `files` list and the plugin `skills/` folder.
- Do not claim a store listing exists when it does not. Cursor `/add-plugin mental` works only after the marketplace lists it.

## Checklist before asking to publish

- [ ] `node scripts/bump-version.mjs --check` passes.
- [ ] CHANGELOG has the dated section; `[Unreleased]` is empty or reset.
- [ ] `npm test` and `npm run check:install` pass (known baseline failures noted).
- [ ] On the right branch; tag name equals `v` plus `package.json` version.
- [ ] User confirmed version, branch and channels in this turn.

## Anti-patterns

- Tagging first and bumping later.
- Publishing from a laptop instead of the workflow.
- Re-tagging to repair npm.
- Setting `version` on the marketplace plugin entry (the manifest wins and the two drift).
- Telling users to run the CLI install subcommand to refresh a host plugin; it does not touch the host plugin cache.

## Pointers

| Need | Where |
| --- | --- |
| npm, tags, workflow, prerelease | [references/npm-release.md](references/npm-release.md) |
| Claude marketplace and directory | [references/claude.md](references/claude.md) |
| Cursor plugin and marketplace | [references/cursor.md](references/cursor.md) |
| Copilot CLI, VS Code | [references/copilot.md](references/copilot.md) |
| Codex and OpenCode | [references/codex-opencode.md](references/codex-opencode.md) |
| What users run after a release | [references/after-release.md](references/after-release.md) |
