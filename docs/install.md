# Install

Mental is `@balacode/mental` on npm. The CLI binary is `mental`.

The unscoped package [`mental`](https://www.npmjs.com/package/mental) is a **different project**. Do not install that one.

Node.js **>= 18**. Zero runtime npm dependencies.

## Fast path

```bash
npm i -g @balacode/mental
mental install
mental doctor
```

`mental install` puts `mental` on PATH (typically `~/.local/bin/mental`), copies the skill and a tiny always-on rule into `~/.claude`, `~/.cursor`, `~/.agents`, and `~/.config/opencode`, and creates a `~/.mental` skeleton.

That skill is what makes agents journal, decide, and record residue **for you**. You do not keep the log by hand. It does **not** turn on hooks or MCP, and it does not delete journals.

## Paste this into your agent

Copy the block into Cursor, Claude Code, Copilot, Codex, or any other coding agent:

```text
Install Mental from https://github.com/afaraha8403/mental.

Mental is a local-first continuity layer. Git records what changed; Mental records where we left off, why a decision was made, and what is still in the air.

The repo is an Agent Plugins 1.0.0 package (https://agent-plugins.org/specification): plugin.json at the repo root, skill at skills/mental/, MCP at mcp.json.

Use this client's native plugin install if you have one, then put the CLI on PATH and finish setup:

  npm i -g @balacode/mental
  mental install
  mental doctor

Native plugin install is a second channel. `mental install` refreshes the CLI and skill copies, not this client's plugin cache. If the plugin UI shows an older version, update it there. After doctor, tell me what it reports.

After doctor, ask whether I want optional hooks or time tracking, and whether MCP is needed for this client. Give a one-liner for each, then wait — never run `mental option … on` until I say yes this turn.

- hooks: session-start snippets so a new chat loads Mental status (default off)
- MCP: register `mental serve` for tool-only agents that cannot shell the CLI (skip if this client already loaded the plugin MCP or can run `mental`)
- time tracking: optional per-project wall/user timers (default off)
```

## Client one-liners

Plugin install loads the skill and MCP from a git clone the host caches. Still run `mental install` so the CLI, skill, and tiny always-on rule land on this machine. Upgrading the CLI does **not** refresh that cache — after a release, update the plugin in the host (Claude Code: `claude plugin marketplace update mental` then `claude plugin update mental@mental`, then restart; or Settings → Plugins → Update). Copilot: `copilot plugin marketplace update` then `copilot plugin update mental`. `mental doctor` warns when a host plugin or a copied skill is behind the CLI.

**Cursor** — paste in Agent chat:

```text
/add-plugin https://github.com/afaraha8403/mental
```

**Claude Code:**

```text
/plugin marketplace add afaraha8403/mental
/plugin install mental@mental
```

**VS Code** — Command Palette → **Chat: Install Plugin From Source**, then:

```text
https://github.com/afaraha8403/mental
```

**GitHub Copilot CLI:**

```bash
copilot plugin marketplace add afaraha8403/mental
copilot plugin install mental@mental
```

Mental is packaged as a portable [Agent Plugins 1.0.0](https://agent-plugins.org/specification) plugin — the vendor-neutral format maintained by Amazon, Cursor, Microsoft, OpenAI, and Vercel. Compatible clients load the same directory.

| Piece | Where | Role |
| --- | --- | --- |
| `plugin.json` | repo root | Manifest (`$schema` + `name`). The portable schema has no icon field. |
| `skills/mental/` | Agent Skills | Procedure: when to journal, CLI contract, privacy |
| `mcp.json` | repo root | stdio MCP → `./bin/cli.mjs serve` (`cwd` `${PLUGIN_ROOT}`) |

Cursor extras live in `.cursor-plugin/plugin.json` (logo). Claude Code extras live in `.claude-plugin/plugin.json` (`displayName: Mental`) and `.claude-plugin/marketplace.json`. Rules and hooks are **not** portable v1 components — they still come from `mental install` / `mental hooks on`.

## From a clone, without npm

```bash
cd /path/to/mental
node bin/cli.mjs install --json
```

A git checkout installs that tree and does not clobber it with the registry.

## What `mental install` does

Last install wins: an existing global `mental` bin is overwritten (npm 11 no longer fails with `EEXIST`). From a published install it also **upgrades** the CLI when npm has a newer version, then re-runs so skills match. It **removes leftover Balakit Mental skill/rule copies** (the old `npx balakit doctor` pointer) so they cannot fight the new rule.

Optional:

```bash
mental install --mcp    # register `mental serve` in ~/.cursor/mcp.json + ~/.claude.json
mental hooks on         # session-start hooks; default off
mental option track on  # per-UUID timers; never from install paste unless the user asked
mental doctor           # PATH, bindings, ignore, skills, npm update, host plugin lag, optionals[]
mental doctor --fix-ignore   # add .mental/ and .mental-id to your global git excludes
```

Install and doctor JSON include `optionals[]` (`id`, `enabled`, `scope`, `command`, `isNew`, `needsConsent: true`). After doctor, agents ask about hooks and time tracking, and whether MCP is needed, with a one-liner each. Do not pass `--hooks` / `--mcp` / `--track` until the user says yes this turn.

Time tracking is off by default. Hours live in bundle `time.sqlite` (never git). The track skill is copied from `optional/mental-track/` only when track is enabled — not from plugin `skills/`.

## Uninstall

```bash
mental uninstall
mental uninstall --delete-data --confirm DELETE
```

Uninstall removes skill / rule / hooks / MCP / mental-track copies. `~/.mental` stays unless you type `DELETE` (`time.sqlite` stays with OKF).
